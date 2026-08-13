"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createNotification } from "@/features/notifications/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSportsDataProvider } from "@/lib/sports-data";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME, INVITE_EXPIRY_HOURS } from "@/lib/constants";
import { logError } from "@/lib/utils/log-error";
import { normalizePhone } from "@/lib/utils/phone";
import { createActionSchema } from "@/lib/validations/action";
import { consumeActionCreditOrPass, grantReferralRewardIfEligible, refundActionCredit } from "@/features/monetization/lib/credits";
import { logAnalyticsEvent } from "@/lib/monetization/analytics";
import { PRICING } from "@/lib/monetization/pricing";
import { recordStatusChange } from "./lib/status-history";
import { inviteParticipant } from "./lib/invite-participant";
import { inviteUrl, verifyInviteToken } from "./lib/signed-token";
import { syncGameFromEvent } from "./lib/sync-game";

export interface ActionMutationResult {
  ok: boolean;
  error?: string;
  actionId?: string;
  paywallRequired?: boolean;
}

/**
 * Thrown for any failure inside createActionAndInvite's write sequence once
 * a credit/pass has already been consumed, so a single catch block can
 * decide whether a compensating refund is needed instead of duplicating
 * that logic at every early-return site.
 */
class ActionCreationFailedError extends Error {}

/**
 * Creates an Action and its invite in one step. There's no persisted
 * "draft" state — the game/market/side/stake wizard lives entirely in
 * client state until the creator enters a phone number and sends it, which
 * is the point this mutation runs.
 */
export async function createActionAndInvite(input: {
  eventId: string;
  market: "moneyline" | "spread" | "total";
  selectionKey: string;
  stakeAmount?: number;
  opponentPhone: string;
}): Promise<ActionMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const parsed = createActionSchema.safeParse({
    eventId: input.eventId,
    market: input.market,
    selectionKey: input.selectionKey,
    stakeAmount: input.stakeAmount,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid Action details." };
  }

  const opponentPhone = normalizePhone(input.opponentPhone);
  if (!opponentPhone) return { ok: false, error: "Enter a valid phone number." };
  if (opponentPhone === currentUser.phone) {
    return { ok: false, error: "You can't challenge yourself." };
  }

  const provider = getSportsDataProvider();
  const event = await provider.getEvent(parsed.data.eventId);
  if (!event) return { ok: false, error: "That game is no longer available." };
  if (event.status !== "scheduled") {
    return { ok: false, error: "You can only create an Action for a game that hasn't started." };
  }

  const markets = await provider.getMarkets(parsed.data.eventId);
  const marketLine = markets.find((m) => m.market === parsed.data.market);
  const creatorSelection = marketLine?.selections.find((s) => s.key === parsed.data.selectionKey);
  if (!marketLine || !creatorSelection) {
    return { ok: false, error: "That selection is no longer available." };
  }
  const opponentSelection = marketLine.selections.find((s) => s.key !== parsed.data.selectionKey);
  if (!opponentSelection) {
    return { ok: false, error: "Couldn't determine the opposing side." };
  }

  // Canonical line, always stored home-relative (spread) or shared (total).
  const homeLine =
    parsed.data.market === "spread"
      ? (marketLine.selections.find((s) => s.key === event.homeTeam.abbreviation)?.line ?? null)
      : parsed.data.market === "total"
        ? (marketLine.selections[0]?.line ?? null)
        : null;

  const admin = createAdminClient();

  // Authorization gate: creating an Action is the only thing that's ever
  // monetized (see src/lib/monetization/pricing.ts). Everything above this
  // point — validation, lookups — must never consume anything, since
  // abandoning the flow or hitting an error before this line shouldn't cost
  // the user an Action. actionId is generated client-side (server-side,
  // despite the name — "client" here means "the caller of the RPC") so the
  // ledger row referencing it and the `actions` row itself can share one id
  // without a chicken-and-egg insert order.
  const actionId = crypto.randomUUID();
  const consumeResult = await consumeActionCreditOrPass(currentUser.id, actionId);
  if (!consumeResult.allowed) {
    return {
      ok: false,
      error: "You've used your free Actions. Buy more or invite a friend to earn one.",
      paywallRequired: true,
    };
  }

  try {
    const game = await syncGameFromEvent(admin, event, provider.name);

    const { data: action, error: actionError } = await admin
      .from("actions")
      .insert({
        id: actionId,
        creator_id: currentUser.id,
        game_id: game.id,
        market: parsed.data.market,
        line: homeLine,
        status: "pending",
        stake_amount: parsed.data.stakeAmount ?? null,
      })
      .select("*")
      .single();

    if (actionError || !action) {
      throw new ActionCreationFailedError("Couldn't create the Action. Try again.");
    }

    await admin.from("participants").insert({
      action_id: action.id,
      user_id: currentUser.id,
      phone: currentUser.phone,
      role: "creator",
      status: "accepted",
      selection: creatorSelection.key,
      side_label: creatorSelection.label,
      responded_at: new Date().toISOString(),
    });

    const invited = await inviteParticipant(admin, currentUser.id, {
      actionId: action.id,
      phone: opponentPhone,
      selection: opponentSelection.key,
      sideLabel: opponentSelection.label,
      inviteExpiryHours: INVITE_EXPIRY_HOURS,
    });

    if (!invited) {
      throw new ActionCreationFailedError("Couldn't invite that number. Try again.");
    }

    await recordStatusChange(admin, action.id, null, "pending", "creator");

    const matchup = `${event.awayTeam.name} @ ${event.homeTeam.name}`;
    const inviteLink = inviteUrl(invited.inviteToken);
    const smsBody = `${currentUser.display_name ?? "A friend"} challenged you on ${APP_NAME}: ${matchup} — you'd take ${opponentSelection.label}. Review it: ${inviteLink}`;
    await getSmsProvider().send({ to: opponentPhone, body: smsBody });

    if (invited.existingUserId) {
      await createNotification(admin, {
        userId: invited.existingUserId,
        actionId: action.id,
        type: "invite_received",
        title: "New Action invite",
        body: `You've been challenged on ${matchup}.`,
      });
    }

    const { count: actionsCreatedCount } = await admin
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", currentUser.id);

    await logAnalyticsEvent(admin, {
      eventName: "action_created",
      userId: currentUser.id,
      actionId: action.id,
      metadata: {
        paid_via: consumeResult.method,
        nth_action: actionsCreatedCount ?? null,
      },
    });

    revalidatePath("/");
    return { ok: true, actionId: action.id };
  } catch (err) {
    if (consumeResult.method === "credit") {
      await refundActionCredit(currentUser.id, `Refund: Action creation failed (${actionId})`);
    }
    const message = err instanceof ActionCreationFailedError ? err.message : "Something went wrong creating that Action. Try again.";
    logError("[createActionAndInvite] failed:", err);
    return { ok: false, error: message };
  }
}

export async function respondToInvite(
  token: string,
  decision: "accept" | "decline",
): Promise<ActionMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const payload = verifyInviteToken(token);
  if (!payload) return { ok: false, error: "This invite link is invalid or has expired." };

  const admin = createAdminClient();

  const { data: participant } = await admin
    .from("participants")
    .select("*")
    .eq("id", payload.participantId)
    .eq("action_id", payload.actionId)
    .maybeSingle();

  if (!participant || participant.invite_token !== token) {
    return { ok: false, error: "This invite link is invalid or has expired." };
  }
  if (participant.status !== "invited") {
    return { ok: false, error: "This invite has already been responded to." };
  }
  if (participant.invite_expires_at && new Date(participant.invite_expires_at) < new Date()) {
    return { ok: false, error: "This invite has expired." };
  }
  if (participant.phone !== currentUser.phone) {
    return { ok: false, error: "This invite was sent to a different phone number." };
  }

  const { data: action } = await admin.from("actions").select("*").eq("id", payload.actionId).maybeSingle();
  if (!action) return { ok: false, error: "This Action no longer exists." };
  if (action.status !== "pending") return { ok: false, error: "This Action is no longer available." };

  const { data: creatorParticipant } = await admin
    .from("participants")
    .select("*")
    .eq("action_id", action.id)
    .eq("role", "creator")
    .maybeSingle();

  if (decision === "decline") {
    await admin
      .from("participants")
      .update({ status: "declined", user_id: currentUser.id, responded_at: new Date().toISOString(), invite_token: null })
      .eq("id", participant.id);
    await admin.from("actions").update({ status: "declined" }).eq("id", action.id);
    await recordStatusChange(admin, action.id, "pending", "declined", "opponent");

    // One decline cancels the whole Action (V1 keeps this simple — see the
    // Custom Action spec) so everyone else who'd already accepted needs to
    // know, not just the creator. For a 2-participant sports Action this
    // is exactly the old behavior (creator is the only "everyone else").
    const { data: otherAccepted } = await admin
      .from("participants")
      .select("user_id")
      .eq("action_id", action.id)
      .eq("status", "accepted");
    for (const p of otherAccepted ?? []) {
      if (!p.user_id) continue;
      await createNotification(admin, {
        userId: p.user_id,
        actionId: action.id,
        type: "action_declined",
        title: "Action declined",
        body: "Your challenge was declined.",
      });
    }
    revalidatePath("/");
    revalidatePath(`/actions/${action.id}`);
    return { ok: true, actionId: action.id };
  }

  await admin
    .from("participants")
    .update({ status: "accepted", user_id: currentUser.id, responded_at: new Date().toISOString(), invite_token: null })
    .eq("id", participant.id);

  // An Action only fully activates once every invited participant has
  // accepted — for a 2-participant sports Action this one accept always is
  // "everyone," identical to the old behavior. For a Custom Action with
  // several invitees, earlier accepts just notify the creator that one
  // more person is in; the LAST acceptance is what locks terms and
  // notifies everyone else.
  const { data: allParticipants } = await admin
    .from("participants")
    .select("user_id, status")
    .eq("action_id", action.id);
  const everyoneAccepted = (allParticipants ?? []).every((p) => p.status === "accepted");

  if (everyoneAccepted) {
    await admin
      .from("actions")
      .update({ status: "accepted", locked_at: new Date().toISOString() })
      .eq("id", action.id);
    await recordStatusChange(admin, action.id, "pending", "accepted", "opponent");

    for (const p of allParticipants ?? []) {
      if (!p.user_id || p.user_id === currentUser.id) continue;
      await createNotification(admin, {
        userId: p.user_id,
        actionId: action.id,
        type: "action_accepted",
        title: "Action accepted",
        body: "Everyone's in. It's locked in.",
      });
    }
  } else if (creatorParticipant?.user_id && creatorParticipant.user_id !== currentUser.id) {
    await createNotification(admin, {
      userId: creatorParticipant.user_id,
      actionId: action.id,
      type: "action_accepted",
      title: "Action accepted",
      body: `${currentUser.display_name ?? "Someone"} accepted. Waiting on the rest.`,
    });
  }

  // Referral reward: fires the first time this user has ever accepted an
  // Action, regardless of whether it was this specific invite that brought
  // them in. Best-effort — never blocks the accept itself.
  const referralGrant = await grantReferralRewardIfEligible(currentUser.id, action.id, PRICING.referralRewardActions);
  if (referralGrant.granted && referralGrant.inviterUserId) {
    await createNotification(admin, {
      userId: referralGrant.inviterUserId,
      actionId: action.id,
      type: "referral_reward_earned",
      title: "+1 Action",
      body: `${currentUser.display_name ?? "Someone you invited"} joined ${APP_NAME}.`,
    });
  }

  revalidatePath("/");
  revalidatePath(`/actions/${action.id}`);
  return { ok: true, actionId: action.id };
}

/** Creator-only: withdraw a challenge before the opponent has responded. */
export async function cancelAction(actionId: string): Promise<ActionMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const admin = createAdminClient();
  const { data: action } = await admin.from("actions").select("*").eq("id", actionId).maybeSingle();
  if (!action) return { ok: false, error: "This Action no longer exists." };
  if (action.creator_id !== currentUser.id) return { ok: false, error: "Only the creator can cancel this." };
  if (action.status !== "pending") return { ok: false, error: "This Action can no longer be cancelled." };

  await admin
    .from("actions")
    .update({ status: "cancelled", cancelled_reason: "Cancelled by creator before acceptance." })
    .eq("id", actionId);
  await recordStatusChange(admin, actionId, action.status, "cancelled", "creator");

  revalidatePath("/");
  revalidatePath(`/actions/${actionId}`);
  return { ok: true, actionId };
}
