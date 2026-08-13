import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSportsDataProvider } from "@/lib/sports-data";
import { gradeSelection } from "@/features/actions/lib/settlement";
import { recordStatusChange } from "@/features/actions/lib/status-history";
import { syncGameFromEvent } from "@/features/actions/lib/sync-game";
import { getResolution, personalStatus } from "@/features/actions/types";
import type { ActionWithDetails } from "@/features/actions/types";
import { notifyParticipants } from "@/features/notifications/lib/notify";
import { createObligations, markActionNotApplicable } from "@/features/settlement/lib/rpc";
import { RESULT_COPY } from "@/lib/settlement/copy";
import { formatStake } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

/**
 * Settlement job. Intended to run on a schedule (see vercel.json — every 5
 * minutes) but safe to call any time: it only ever acts on Actions whose
 * game has actually progressed since the last run.
 *
 * Swapping SportsDataProvider implementations (mock -> The Odds API ->
 * anything else) requires zero changes here — this route only talks to the
 * SportsDataProvider interface.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const provider = getSportsDataProvider();
  const ACTION_SELECT = `*, game:games(*, home_team:teams!games_home_team_id_fkey(*), away_team:teams!games_away_team_id_fkey(*)), participants(*, user:users(id, display_name, cashtag))`;

  const summary = { gamesChecked: 0, movedToLive: 0, settled: 0, cancelled: 0, expired: 0 };

  // Expire invites nobody responded to in time. Independent of the
  // game-progress loop below since it doesn't need provider data at all.
  const { data: pendingActions } = await admin
    .from("actions")
    .select(ACTION_SELECT)
    .eq("status", "pending")
    .eq("action_type", "sports");

  for (const action of (pendingActions ?? []) as unknown as ActionWithDetails[]) {
    const opponent = action.participants.find((p) => p.role === "opponent");
    if (!opponent || opponent.status !== "invited" || !opponent.invite_expires_at) continue;
    if (new Date(opponent.invite_expires_at) >= new Date()) continue;

    await admin.from("actions").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", action.id);
    await admin.from("participants").update({ invite_token: null }).eq("id", opponent.id);
    await recordStatusChange(admin, action.id, "pending", "expired", "system", "Invite window closed unanswered.");
    await notifyParticipants(admin, action, "action_cancelled", "Invite expired", () => "Nobody responded in time, so this Action expired.");
    await markActionNotApplicable(action.id);
    summary.expired += 1;
  }

  const { data: openActions, error } = await admin
    .from("actions")
    .select(ACTION_SELECT)
    .in("status", ["accepted", "live"])
    .eq("action_type", "sports");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actions = (openActions ?? []) as unknown as ActionWithDetails[];
  const actionsByGameId = new Map<string, ActionWithDetails[]>();
  for (const action of actions) {
    if (!action.game_id) continue; // sports Actions always have one; guards the type only
    const list = actionsByGameId.get(action.game_id) ?? [];
    list.push(action);
    actionsByGameId.set(action.game_id, list);
  }

  for (const [, gameActions] of actionsByGameId) {
    const game = gameActions[0]!.game;
    if (!game) continue; // sports Actions always have one; guards the type only
    summary.gamesChecked += 1;

    const event = await provider.getEvent(game.external_id, game.league);
    if (!event) continue;

    await syncGameFromEvent(admin, event, provider.name);

    if (event.status === "live") {
      for (const action of gameActions) {
        if (action.status !== "accepted") continue;
        await admin.from("actions").update({ status: "live" }).eq("id", action.id);
        await recordStatusChange(admin, action.id, "accepted", "live", "system");
        await notifyParticipants(admin, action, "action_live", "Game is live", () => `${game.away_team.abbreviation} @ ${game.home_team.abbreviation} just started.`);
        summary.movedToLive += 1;
      }
      continue;
    }

    if (event.status === "postponed" || event.status === "cancelled") {
      for (const action of gameActions) {
        await admin
          .from("actions")
          .update({ status: "cancelled", cancelled_reason: `Game ${event.status} by the league.`, resolved_at: new Date().toISOString() })
          .eq("id", action.id);
        await recordStatusChange(admin, action.id, action.status, "cancelled", "system", `Game ${event.status}.`);
        await notifyParticipants(admin, action, "action_cancelled", "Action cancelled", () => `${game.away_team.abbreviation} @ ${game.home_team.abbreviation} was ${event.status}.`);
        await markActionNotApplicable(action.id);
        summary.cancelled += 1;
      }
      continue;
    }

    if (event.status !== "final") continue;

    const result = await provider.getGameResult(game.external_id, game.league);
    if (!result) continue;

    for (const action of gameActions) {
      const creator = action.participants.find((p) => p.role === "creator");
      if (!creator) continue;

      const opponent = action.participants.find((p) => p.role === "opponent");

      // Sports Actions always have market + a creator selection (enforced by
      // the action_type_fields_match DB check) — this guard exists only to
      // satisfy the now-nullable column types, which had to become nullable
      // to allow Custom Actions to omit them entirely.
      if (!action.market || !creator.selection) continue;

      const grade = gradeSelection({
        market: action.market,
        line: action.line,
        selection: creator.selection,
        homeAbbreviation: game.home_team.abbreviation,
        awayAbbreviation: game.away_team.abbreviation,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
      });

      // winner_participant_id is the type-agnostic source of truth for
      // "who won" (see getResolution in features/actions/types.ts) — set
      // here the same way unanimous Custom Action consensus sets it, so
      // every downstream reader (settlement, notifications, history) never
      // needs to know this was a sports Action specifically. Null on a push.
      const winnerParticipantId = grade === "won" ? creator.id : grade === "lost" ? (opponent?.id ?? null) : null;

      await admin
        .from("actions")
        .update({ status: grade, resolved_at: new Date().toISOString(), winner_participant_id: winnerParticipantId })
        .eq("id", action.id);
      await recordStatusChange(admin, action.id, action.status, grade, "system", `Final: ${result.awayScore}-${result.homeScore}`);
      await notifyParticipants(admin, action, "action_settled", "Action settled", (viewerRole) => {
        const personal = personalStatus(grade, viewerRole);
        const label = personal === "won" ? "You won" : personal === "lost" ? "You lost" : "It was a push";
        return `${label} — ${game.away_team.abbreviation} ${result.awayScore}, ${game.home_team.abbreviation} ${result.homeScore}.`;
      });
      summary.settled += 1;

      // Payment settlement is a separate concern from the sports result
      // above — whether Mike covered the spread is not the same fact as
      // whether he's paid up. A push never owes anyone anything; a
      // won/lost Action with a stake creates settlement obligations and
      // gets its own notification alongside (not instead of) the result
      // notification above. ACTION still never touches any money here —
      // this only records what the app believes is owed and notifies.
      if (grade === "push" || !winnerParticipantId) {
        await markActionNotApplicable(action.id);
      } else if (action.stake_amount) {
        const { ok, obligationsCreated } = await createObligations(action.id, winnerParticipantId);
        if (ok && obligationsCreated > 0) {
          const resolution = getResolution({ winner_participant_id: winnerParticipantId, participants: action.participants });
          if (resolution) {
            const amount = formatStake(action.stake_amount);
            const winnerName = resolution.winner.user?.display_name?.trim() || "your opponent";
            for (const loser of resolution.losers) {
              if (loser.user_id) {
                const { title, body } = RESULT_COPY.loserOwes(winnerName, amount);
                await admin.from("notifications").insert({ user_id: loser.user_id, action_id: action.id, type: "payment_owed", title, body });
              }
            }
            if (resolution.winner.user_id) {
              const loserName = resolution.losers[0]?.user?.display_name?.trim() || "your opponent";
              const { title, body } = RESULT_COPY.winnerOwed(loserName, amount);
              await admin.from("notifications").insert({ user_id: resolution.winner.user_id, action_id: action.id, type: "payment_owed", title, body });
            }
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
