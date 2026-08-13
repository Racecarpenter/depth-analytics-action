"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createNotification } from "@/features/notifications/lib/notify";
import { getResolution } from "@/features/actions/types";
import { inviteParticipant } from "@/features/actions/lib/invite-participant";
import { inviteUrl } from "@/features/actions/lib/signed-token";
import { recordStatusChange } from "@/features/actions/lib/status-history";
import { consumeActionCreditOrPass, refundActionCredit } from "@/features/monetization/lib/credits";
import { logAnalyticsEvent } from "@/lib/monetization/analytics";
import { getActionForSettlement, participantDisplayName } from "@/features/settlement/lib/context";
import { createObligations } from "@/features/settlement/lib/rpc";
import { RESULT_COPY } from "@/lib/settlement/copy";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME, CUSTOM_ACTION_MAX_PARTICIPANTS, INVITE_EXPIRY_HOURS } from "@/lib/constants";
import { logError } from "@/lib/utils/log-error";
import { formatStake } from "@/lib/utils/currency";
import { normalizePhone } from "@/lib/utils/phone";
import { createCustomActionSchema } from "@/lib/validations/action";
import { revote, submitVote } from "./lib/rpc";

export interface CustomActionMutationResult {
  ok: boolean;
  error?: string;
  actionId?: string;
  paywallRequired?: boolean;
}

class CustomActionCreationFailedError extends Error {}

/**
 * Creates a Custom Action and every invitation for it in one step — one
 * Action row, one participant row per person (creator auto-accepted, the
 * rest invited), all against the same action_id (never separate pairwise
 * Actions). Shares createActionAndInvite's credit-consumption pattern
 * exactly (features/actions/mutations.ts): one credit regardless of
 * participant count, refunded via the same compensating-transaction
 * pattern if anything downstream fails.
 */
export async function createCustomActionAndInvite(input: {
  title: string;
  stakeAmount: number;
  opponentPhones: string[];
}): Promise<CustomActionMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const parsed = createCustomActionSchema.safeParse({ title: input.title, stakeAmount: input.stakeAmount });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid Action details." };
  }

  const normalizedPhones: string[] = [];
  for (const raw of input.opponentPhones) {
    const normalized = normalizePhone(raw);
    if (!normalized) return { ok: false, error: "Enter a valid phone number for everyone." };
    normalizedPhones.push(normalized);
  }
  if (normalizedPhones.length === 0) {
    return { ok: false, error: "Add at least one opponent." };
  }
  if (normalizedPhones.length + 1 > CUSTOM_ACTION_MAX_PARTICIPANTS) {
    return { ok: false, error: `Custom Actions support up to ${CUSTOM_ACTION_MAX_PARTICIPANTS} participants total.` };
  }
  if (new Set(normalizedPhones).size !== normalizedPhones.length) {
    return { ok: false, error: "You added the same number twice." };
  }
  if (normalizedPhones.includes(currentUser.phone)) {
    return { ok: false, error: "You can't invite yourself." };
  }

  const admin = createAdminClient();

  // Same authorization gate as createActionAndInvite: creating an Action —
  // any type — is the only thing ever monetized, and it counts as exactly
  // one regardless of how many people are invited.
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
    const { data: action, error: actionError } = await admin
      .from("actions")
      .insert({
        id: actionId,
        creator_id: currentUser.id,
        action_type: "custom",
        title: parsed.data.title,
        status: "pending",
        stake_amount: parsed.data.stakeAmount,
      })
      .select("*")
      .single();

    if (actionError || !action) {
      throw new CustomActionCreationFailedError("Couldn't create the Action. Try again.");
    }

    await admin.from("participants").insert({
      action_id: action.id,
      user_id: currentUser.id,
      phone: currentUser.phone,
      role: "creator",
      status: "accepted",
      responded_at: new Date().toISOString(),
    });

    const totalPlayers = normalizedPhones.length + 1;
    const stakeDisplay = formatStake(parsed.data.stakeAmount);

    for (const phone of normalizedPhones) {
      const invited = await inviteParticipant(admin, currentUser.id, {
        actionId: action.id,
        phone,
        inviteExpiryHours: INVITE_EXPIRY_HOURS,
      });
      if (!invited) {
        throw new CustomActionCreationFailedError("Couldn't invite one of those numbers. Try again.");
      }

      const inviteLink = inviteUrl(invited.inviteToken);
      const smsBody = `${currentUser.display_name ?? "A friend"} invited you to an Action on ${APP_NAME}: ${parsed.data.title} — ${stakeDisplay} each, ${totalPlayers} players. Review it: ${inviteLink}`;
      await getSmsProvider().send({ to: phone, body: smsBody });

      if (invited.existingUserId) {
        await createNotification(admin, {
          userId: invited.existingUserId,
          actionId: action.id,
          type: "invite_received",
          title: "New Action invite",
          body: `You've been invited to: ${parsed.data.title}.`,
        });
      }
    }

    await recordStatusChange(admin, action.id, null, "pending", "creator");

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
        action_type: "custom",
        participant_count: totalPlayers,
      },
    });

    revalidatePath("/");
    return { ok: true, actionId: action.id };
  } catch (err) {
    if (consumeResult.method === "credit") {
      await refundActionCredit(currentUser.id, `Refund: Custom Action creation failed (${actionId})`);
    }
    const message =
      err instanceof CustomActionCreationFailedError ? err.message : "Something went wrong creating that Action. Try again.";
    logError("[createCustomActionAndInvite] failed:", err);
    return { ok: false, error: message };
  }
}

function mapVoteError(code?: string): string {
  switch (code) {
    case "not_open":
      return "Voting isn't open for this Action.";
    case "not_participant":
      return "Only participants on this Action can submit a result.";
    case "invalid_selection":
      return "That person isn't part of this Action.";
    case "already_voted":
      return "You already submitted your result for this round.";
    default:
      return "Something went wrong. Try again.";
  }
}

export interface SubmitVoteMutationResult {
  ok: boolean;
  error?: string;
  allVoted: boolean;
  unanimous: boolean;
}

/**
 * Independent winner submission. The return value deliberately never
 * includes anyone else's individual pick — only whether everyone has now
 * voted and, if so, whether it was unanimous — so there's no way for the
 * UI to leak "Race picked Mike" to someone who hasn't voted yet.
 */
export async function submitCustomActionVote(
  actionId: string,
  selectedParticipantId: string,
  proofPhotoPath: string | null,
): Promise<SubmitVoteMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in.", allVoted: false, unanimous: false };

  const result = await submitVote(actionId, currentUser.id, selectedParticipantId, proofPhotoPath);
  if (!result.ok) {
    return { ok: false, error: mapVoteError(result.error), allVoted: result.allVoted, unanimous: result.unanimous };
  }

  const admin = createAdminClient();

  if (result.allVoted && result.unanimous && result.winnerParticipantId) {
    const action = await getActionForSettlement(admin, actionId);
    const resolution = action
      ? getResolution({ winner_participant_id: result.winnerParticipantId, participants: action.participants })
      : null;

    if (action && resolution) {
      for (const p of action.participants) {
        if (!p.user_id) continue;
        const isWinner = p.id === result.winnerParticipantId;
        await createNotification(admin, {
          userId: p.user_id,
          actionId,
          type: "action_settled",
          title: "Results are in",
          body: isWinner
            ? `You won: ${action.title ?? "your Custom Action"}.`
            : `${participantDisplayName(resolution.winner)} won: ${action.title ?? "your Custom Action"}.`,
        });
      }

      if (action.stake_amount) {
        const { ok: obligationsOk, obligationsCreated } = await createObligations(actionId, result.winnerParticipantId);
        if (obligationsOk && obligationsCreated > 0) {
          const amount = formatStake(action.stake_amount);
          const winnerName = participantDisplayName(resolution.winner);
          for (const loser of resolution.losers) {
            if (!loser.user_id) continue;
            const { title, body } = RESULT_COPY.loserOwes(winnerName, amount);
            await createNotification(admin, { userId: loser.user_id, actionId, type: "payment_owed", title, body });
          }
          if (resolution.winner.user_id) {
            const loserName = resolution.losers[0] ? participantDisplayName(resolution.losers[0]) : "your opponent";
            const { title, body } = RESULT_COPY.winnerOwed(loserName, amount);
            await createNotification(admin, { userId: resolution.winner.user_id, actionId, type: "payment_owed", title, body });
          }
        }
      }
    }
  } else if (result.allVoted && !result.unanimous) {
    const { data: participants } = await admin
      .from("participants")
      .select("user_id")
      .eq("action_id", actionId)
      .eq("status", "accepted");
    for (const p of participants ?? []) {
      if (!p.user_id) continue;
      await createNotification(admin, {
        userId: p.user_id,
        actionId,
        type: "action_settled",
        title: "Hold up",
        body: "You don't all agree on what happened. Revote when everyone's ready.",
      });
    }
  }

  revalidatePath(`/actions/${actionId}`);
  return { ok: true, allVoted: result.allVoted, unanimous: result.unanimous };
}

export interface RequestRevoteResult {
  ok: boolean;
  error?: string;
}

/** Any accepted participant can call this — never just the creator. */
export async function requestRevote(actionId: string): Promise<RequestRevoteResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await revote(actionId, currentUser.id);
  if (!result.ok) {
    const message =
      result.error === "round_incomplete"
        ? "Everyone needs to submit a result before revoting."
        : result.error === "already_unanimous"
          ? "Everyone already agreed — nothing to revote."
          : result.error === "not_participant"
            ? "Only participants on this Action can do that."
            : "Something went wrong. Try again.";
    return { ok: false, error: message };
  }

  const admin = createAdminClient();
  const { data: participants } = await admin
    .from("participants")
    .select("user_id")
    .eq("action_id", actionId)
    .eq("status", "accepted");
  for (const p of participants ?? []) {
    if (!p.user_id || p.user_id === currentUser.id) continue;
    await createNotification(admin, {
      userId: p.user_id,
      actionId,
      type: "action_settled",
      title: "Revote",
      body: `${currentUser.display_name ?? "Someone"} started a new vote. Submit your result again.`,
    });
  }

  revalidatePath(`/actions/${actionId}`);
  return { ok: true };
}
