import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWinnerLoser } from "@/features/actions/types";
import type { ActionWithDetails } from "@/features/actions/types";
import { recordReminder } from "@/features/settlement/lib/rpc";
import { pickReminderCopy } from "@/lib/settlement/copy";
import { REMINDER_SCHEDULE } from "@/lib/settlement/reminder-schedule";
import { formatStake } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

/**
 * Automatic payment nudges — separate route from /api/cron/settle on
 * purpose, even though it runs on the same 5-minute cadence (see
 * vercel.json): sports grading and payment nagging are different jobs and
 * shouldn't be able to break each other.
 *
 * For every Action with payment_status = 'owed', sends the highest
 * reminder threshold (src/lib/settlement/reminder-schedule.ts) that's been
 * crossed since resolved_at and hasn't gone out yet — checking thresholds
 * highest-first means a missed run doesn't burst-send every level at once,
 * just the most relevant one. Idempotent via settlement_record_reminder
 * (partial unique index per action/level), so an overlapping or retried
 * run can't double-send. Stops entirely once payment_status leaves 'owed'
 * (paid, disputed, or settled) — this query just never selects those rows.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ACTION_SELECT = `*, game:games(*, home_team:teams!games_home_team_id_fkey(*), away_team:teams!games_away_team_id_fkey(*)), participants(*, user:users(id, display_name, cashtag))`;

  const { data: owedActions, error } = await admin.from("actions").select(ACTION_SELECT).eq("payment_status", "owed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = { checked: 0, sent: 0 };

  for (const action of (owedActions ?? []) as unknown as ActionWithDetails[]) {
    summary.checked += 1;
    if (!action.resolved_at || !action.stake_amount) continue;

    const hoursSinceOwed = (Date.now() - new Date(action.resolved_at).getTime()) / 3_600_000;
    const level = REMINDER_SCHEDULE.find((l) => hoursSinceOwed >= l.hoursAfterOwed);
    if (!level) continue;

    const sent = await recordReminder(action.id, level.eventType);
    if (!sent) continue;

    const winnerLoser = getWinnerLoser({ status: action.status, participants: action.participants });
    if (!winnerLoser?.loser.user_id) continue;

    const winnerName = winnerLoser.winner.user?.display_name?.trim() || "your opponent";
    const body = pickReminderCopy(level.eventType, winnerName, formatStake(action.stake_amount));

    await admin.from("notifications").insert({
      user_id: winnerLoser.loser.user_id,
      action_id: action.id,
      type: "payment_reminder",
      title: "Still owed",
      body,
    });

    summary.sent += 1;
  }

  return NextResponse.json({ ok: true, ...summary });
}
