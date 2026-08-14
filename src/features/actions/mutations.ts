"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createNotification } from "@/features/notifications/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSportsDataProvider } from "@/lib/sports-data";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME, INVITE_EXPIRY_HOURS, SMS_OPT_OUT_SUFFIX } from "@/lib/constants";
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
import type { ActionRow, ParticipantRow } from "./types";
import type { Tables } from "@/types/domain";

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
 * "draft" state — the game/team/stake wizard lives entirely in client state
 * until the creator enters a phone number and sends it, which is the point
 * this mutation runs.
 *
 * A Sports Action is deliberately just "who wins": `selectionKey` is the
 * creator's chosen team abbreviation (home or away), and the opponent
 * automatically gets the other team — no market/odds concept at all. Every
 * new Sports Action is stored as `market: 'moneyline', line: null`, which
 * is what makes `gradeSelection()`'s existing moneyline branch (home score
 * vs. away score, tie = push) the entire grading logic going forward. See
 * README ("Sports Action simplification").
 */
export async function createActionAndInvite(input: {
  eventId: string;
  selectionKey: string;
  stakeAmount?: number;
  /** Provide exactly one — see PersonPicker ("people you've had Action with") vs. typing a number directly. */
  opponentPhone?: string;
  opponentUserId?: string;
}): Promise<ActionMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const parsed = createActionSchema.safeParse({
    eventId: input.eventId,
    selectionKey: input.selectionKey,
    stakeAmount: input.stakeAmount,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid Action details." };
  }

  let opponentPhone: string | null = null;
  if (input.opponentUserId) {
    if (input.opponentUserId === currentUser.id) return { ok: false, error: "You can't challenge yourself." };
  } else if (input.opponentPhone) {
    opponentPhone = normalizePhone(input.opponentPhone);
    if (!opponentPhone) return { ok: false, error: "Enter a valid phone number." };
    if (opponentPhone === currentUser.phone) {
      return { ok: false, error: "You can't challenge yourself." };
    }
  } else {
    return { ok: false, error: "Pick someone or enter a phone number." };
  }

  const provider = getSportsDataProvider();
  const event = await provider.getEvent(parsed.data.eventId);
  if (!event) return { ok: false, error: "That game is no longer available." };
  if (event.status !== "scheduled") {
    return { ok: false, error: "You can only create an Action for a game that hasn't started." };
  }

  const creatorTeam =
    event.homeTeam.abbreviation === parsed.data.selectionKey
      ? event.homeTeam
      : event.awayTeam.abbreviation === parsed.data.selectionKey
        ? event.awayTeam
        : null;
  if (!creatorTeam) {
    return { ok: false, error: "That team isn't part of this game." };
  }
  const opponentTeam = creatorTeam === event.homeTeam ? event.awayTeam : event.homeTeam;

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
        market: "moneyline",
        line: null,
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
      selection: creatorTeam.abbreviation,
      side_label: creatorTeam.name,
      responded_at: new Date().toISOString(),
    });

    const invited = await inviteParticipant(admin, currentUser.id, {
      actionId: action.id,
      phone: opponentPhone ?? undefined,
      userId: input.opponentUserId,
      selection: opponentTeam.abbreviation,
      sideLabel: opponentTeam.name,
      inviteExpiryHours: INVITE_EXPIRY_HOURS,
    });

    if (!invited) {
      throw new ActionCreationFailedError("Couldn't invite that person. Try again.");
    }

    await recordStatusChange(admin, action.id, null, "pending", "creator");

    const matchup = `${event.awayTeam.name} @ ${event.homeTeam.name}`;

    // Selected via the person picker: identity is already established, so
    // no SMS invite link is needed — they see it in-app via the normal
    // "Needs your response" flow (respondToActionInvite). Typed-phone path
    // keeps sending the SMS link exactly as before, since that's the only
    // way a not-yet-a-user (or not-signed-in) recipient can find the Action.
    if (!input.opponentUserId && opponentPhone) {
      const inviteLink = inviteUrl(invited.inviteToken);
      const smsBody = `${APP_NAME}: ${currentUser.display_name ?? "A friend"} challenged you: ${matchup} — you'd take ${opponentTeam.name}. Review it: ${inviteLink}${SMS_OPT_OUT_SUFFIX}`;
      await getSmsProvider().send({ to: opponentPhone, body: smsBody });
    }

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

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("*")
    .eq("id", payload.participantId)
    .eq("action_id", payload.actionId)
    .maybeSingle();
  if (participantError) logError("[respondToInvite] participant lookup failed:", participantError);

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

  const { data: action, error: actionError } = await admin
    .from("actions")
    .select("*")
    .eq("id", payload.actionId)
    .maybeSingle();
  if (actionError) logError("[respondToInvite] action lookup failed:", actionError);
  if (!action) return { ok: false, error: "This Action no longer exists." };
  if (action.status !== "pending") return { ok: false, error: "This Action is no longer available." };

  return finalizeInviteResponse(admin, action, participant, currentUser, decision);
}

/**
 * In-app counterpart to respondToInvite: lets an already-signed-in
 * participant accept/decline directly from the Action detail page, with no
 * invite link/token involved at all. SMS delivery (and, right now, actual
 * A2P campaign approval) must never be a precondition for using Action — see
 * README ("SMS consent & Twilio A2P 10DLC") and the "SMS is optional"
 * principle this mutation exists to satisfy.
 *
 * Authorization is "are you the invited participant on this Action,"
 * checked first by user_id (the normal case — see the invite-claim backfill
 * in verifyOtp, features/auth/mutations.ts) and falling back to phone as a
 * defense-in-depth safety net. This is the same authorization guarantee the
 * signed token encodes for the SMS-delivered path, just derived from the
 * signed-in session instead of a URL parameter.
 */
export async function respondToActionInvite(
  actionId: string,
  decision: "accept" | "decline",
): Promise<ActionMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const admin = createAdminClient();

  const { data: action, error: actionError } = await admin.from("actions").select("*").eq("id", actionId).maybeSingle();
  if (actionError) logError("[respondToActionInvite] action lookup failed:", actionError);
  if (!action) return { ok: false, error: "This Action no longer exists." };
  if (action.status !== "pending") return { ok: false, error: "This Action is no longer available." };

  const { data: byUserId, error: byUserIdError } = await admin
    .from("participants")
    .select("*")
    .eq("action_id", actionId)
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (byUserIdError) logError("[respondToActionInvite] participant lookup by user_id failed:", byUserIdError);

  let participant = byUserId;
  if (!participant) {
    const { data: byPhone, error: byPhoneError } = await admin
      .from("participants")
      .select("*")
      .eq("action_id", actionId)
      .eq("phone", currentUser.phone)
      .maybeSingle();
    if (byPhoneError) logError("[respondToActionInvite] participant lookup by phone failed:", byPhoneError);
    participant = byPhone;
  }

  if (!participant) return { ok: false, error: "You're not part of this Action." };
  if (participant.status !== "invited") return { ok: false, error: "You've already responded to this Action." };
  if (participant.invite_expires_at && new Date(participant.invite_expires_at) < new Date()) {
    return { ok: false, error: "This invite has expired." };
  }

  return finalizeInviteResponse(admin, action, participant, currentUser, decision);
}

/**
 * Shared accept/decline core for both respondToInvite (token-authorized,
 * SMS-delivered) and respondToActionInvite (session-authorized, in-app) —
 * everything past "which participant row, on which Action, is this" is
 * identical between the two entry points, so it lives in exactly one place
 * rather than being duplicated per authorization method.
 */
async function finalizeInviteResponse(
  admin: ReturnType<typeof createAdminClient>,
  action: ActionRow,
  participant: ParticipantRow,
  currentUser: Tables<"users">,
  decision: "accept" | "decline",
): Promise<ActionMutationResult> {
  const { data: creatorParticipant, error: creatorError } = await admin
    .from("participants")
    .select("*")
    .eq("action_id", action.id)
    .eq("role", "creator")
    .maybeSingle();
  if (creatorError) logError("[finalizeInviteResponse] creator participant lookup failed:", creatorError);

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
    .select("user_id, status, phone")
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
      if (p.phone) {
        await getSmsProvider().send({
          to: p.phone,
          body: `${APP_NAME}: Everyone's in — your Action is locked in.${SMS_OPT_OUT_SUFFIX}`,
        });
      }
    }
  } else if (creatorParticipant?.user_id && creatorParticipant.user_id !== currentUser.id) {
    await createNotification(admin, {
      userId: creatorParticipant.user_id,
      actionId: action.id,
      type: "action_accepted",
      title: "Action accepted",
      body: `${currentUser.display_name ?? "Someone"} accepted. Waiting on the rest.`,
    });
    if (creatorParticipant.phone) {
      await getSmsProvider().send({
        to: creatorParticipant.phone,
        body: `${APP_NAME}: ${currentUser.display_name ?? "Someone"} accepted your Action. Waiting on the rest.${SMS_OPT_OUT_SUFFIX}`,
      });
    }
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
  const { data: action, error: actionError } = await admin.from("actions").select("*").eq("id", actionId).maybeSingle();
  if (actionError) logError("[cancelAction] action lookup failed:", actionError);
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
