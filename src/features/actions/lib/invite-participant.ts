import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/utils/log-error";
import { createInviteToken } from "./signed-token";

export interface InviteParticipantInput {
  actionId: string;
  phone: string;
  /** Sports-only — a Custom Action participant has neither. */
  selection?: string | null;
  sideLabel?: string | null;
  inviteExpiryHours: number;
}

export interface InviteParticipantResult {
  participantId: string;
  inviteToken: string;
  /** Set if this phone number is already an ACTION user — used to send an in-app notification in addition to SMS. */
  existingUserId: string | null;
}

/**
 * Looks up whether a phone number already belongs to an ACTION user,
 * attributes first-touch referral credit if not, inserts the `participants`
 * row (always role='opponent' — the creator's own row is trivially
 * different: auto-accepted, no token, no referral check, so it's inserted
 * inline by each caller instead), and creates its signed invite token.
 *
 * Shared by createActionAndInvite (sports, exactly one invitee) and
 * createCustomActionAndInvite (up to 7) so this sequence — the part that's
 * genuinely identical between them — lives in exactly one place. SMS/
 * notification copy stays with each caller since that text is meaningfully
 * different between a sports challenge and a Custom Action invite.
 */
export async function inviteParticipant(
  admin: SupabaseClient<Database>,
  currentUserId: string,
  input: InviteParticipantInput,
): Promise<InviteParticipantResult | null> {
  const { data: existingUser, error: existingUserError } = await admin
    .from("users")
    .select("id")
    .eq("phone", input.phone)
    .maybeSingle();
  if (existingUserError) {
    // Falls through and treats this phone as "not yet a user," same as a
    // genuine not-found — the alternative (blocking the whole invite) is
    // worse than the small risk of a referral misattribution on a
    // transient read failure. Logged so a persistent failure is visible.
    logError("[inviteParticipant] existing-user lookup failed:", existingUserError);
  }

  if (!existingUser?.id) {
    const { error: referralError } = await admin
      .from("referrals")
      .upsert(
        { inviter_user_id: currentUserId, invitee_phone: input.phone },
        { onConflict: "invitee_phone", ignoreDuplicates: true },
      );
    if (referralError) logError("[inviteParticipant] referral upsert failed:", referralError);
  }

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .insert({
      action_id: input.actionId,
      user_id: existingUser?.id ?? null,
      phone: input.phone,
      role: "opponent",
      status: "invited",
      selection: input.selection ?? null,
      side_label: input.sideLabel ?? null,
      invite_expires_at: new Date(Date.now() + input.inviteExpiryHours * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (participantError || !participant) {
    logError("[inviteParticipant] participant insert failed:", participantError);
    return null;
  }

  const token = createInviteToken(input.actionId, participant.id);
  await admin.from("participants").update({ invite_token: token }).eq("id", participant.id);

  return { participantId: participant.id, inviteToken: token, existingUserId: existingUser?.id ?? null };
}
