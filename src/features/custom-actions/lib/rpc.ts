import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";

/**
 * Thin wrappers around the two SECURITY DEFINER RPCs in
 * supabase/migrations/0013_custom_action_voting.sql. All authorization
 * ("must be an accepted participant," no creator-only authority) and the
 * unanimous-consensus check itself live in those functions, not here.
 */

export interface SubmitVoteResult {
  ok: boolean;
  error?: string;
  allVoted: boolean;
  unanimous: boolean;
  winnerParticipantId: string | null;
}

export async function submitVote(
  actionId: string,
  voterUserId: string,
  selectedParticipantId: string,
  proofPhotoPath: string | null,
): Promise<SubmitVoteResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("submit_custom_action_vote", {
    p_action_id: actionId,
    p_voter_user_id: voterUserId,
    p_selected_participant_id: selectedParticipantId,
    p_proof_photo_path: proofPhotoPath,
  });

  if (error) {
    logError("[submitVote] RPC failed:", error);
    return { ok: false, error: "Something went wrong. Try again.", allVoted: false, unanimous: false, winnerParticipantId: null };
  }
  const result = data?.[0];
  if (!result) {
    return { ok: false, error: "Something went wrong. Try again.", allVoted: false, unanimous: false, winnerParticipantId: null };
  }
  return {
    ok: result.ok,
    error: result.error ?? undefined,
    allVoted: result.all_voted,
    unanimous: result.unanimous ?? false,
    winnerParticipantId: result.winner_participant_id,
  };
}

export interface RevoteResult {
  ok: boolean;
  error?: string;
}

export async function revote(actionId: string, actorUserId: string): Promise<RevoteResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("revote_custom_action", {
    p_action_id: actionId,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    logError("[revote] RPC failed:", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  const result = data?.[0];
  return { ok: result?.ok ?? false, error: result?.error ?? undefined };
}
