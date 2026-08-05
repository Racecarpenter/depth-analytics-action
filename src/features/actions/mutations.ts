"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createNotification } from "@/features/notifications/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSportsDataProvider } from "@/lib/sports-data";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME } from "@/lib/constants";
import { logError } from "@/lib/utils/log-error";
import { normalizePhone } from "@/lib/utils/phone";
import { createActionSchema } from "@/lib/validations/action";
import { recordStatusChange } from "./lib/status-history";
import { createInviteToken, inviteUrl, verifyInviteToken } from "./lib/signed-token";
import { syncGameFromEvent } from "./lib/sync-game";

export interface ActionMutationResult {
  ok: boolean;
  error?: string;
  actionId?: string;
}

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

  try {
    const game = await syncGameFromEvent(admin, event, provider.name);

    const { data: action, error: actionError } = await admin
      .from("actions")
      .insert({
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
      return { ok: false, error: "Couldn't create the Action. Try again." };
    }

    const { data: opponentUser } = await admin
      .from("users")
      .select("id")
      .eq("phone", opponentPhone)
      .maybeSingle();

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

    const { data: opponentParticipant, error: participantError } = await admin
      .from("participants")
      .insert({
        action_id: action.id,
        user_id: opponentUser?.id ?? null,
        phone: opponentPhone,
        role: "opponent",
        status: "invited",
        selection: opponentSelection.key,
        side_label: opponentSelection.label,
        invite_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      })
      .select("*")
      .single();

    if (participantError || !opponentParticipant) {
      return { ok: false, error: "Couldn't invite that number. Try again." };
    }

    const token = createInviteToken(action.id, opponentParticipant.id);
    await admin.from("participants").update({ invite_token: token }).eq("id", opponentParticipant.id);

    await recordStatusChange(admin, action.id, null, "pending", "creator");

    const matchup = `${event.awayTeam.name} @ ${event.homeTeam.name}`;
    const inviteLink = inviteUrl(token);
    const smsBody = `${currentUser.display_name ?? "A friend"} challenged you on ${APP_NAME}: ${matchup} — you'd take ${opponentSelection.label}. Review it: ${inviteLink}`;
    await getSmsProvider().send({ to: opponentPhone, body: smsBody });

    if (opponentUser?.id) {
      await createNotification(admin, {
        userId: opponentUser.id,
        actionId: action.id,
        type: "invite_received",
        title: "New Action invite",
        body: `You've been challenged on ${matchup}.`,
      });
    }

    revalidatePath("/");
    return { ok: true, actionId: action.id };
  } catch (err) {
    logError("[createActionAndInvite] failed:", err);
    return { ok: false, error: "Something went wrong creating that Action. Try again." };
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
    if (creatorParticipant?.user_id) {
      await createNotification(admin, {
        userId: creatorParticipant.user_id,
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
  await admin
    .from("actions")
    .update({ status: "accepted", locked_at: new Date().toISOString() })
    .eq("id", action.id);
  await recordStatusChange(admin, action.id, "pending", "accepted", "opponent");
  if (creatorParticipant?.user_id) {
    await createNotification(admin, {
      userId: creatorParticipant.user_id,
      actionId: action.id,
      type: "action_accepted",
      title: "Action accepted",
      body: "Your challenge was accepted. It's locked in.",
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
