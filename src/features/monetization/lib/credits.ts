import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";

/**
 * Internal server-to-server helpers wrapping the two SECURITY DEFINER RPCs
 * from supabase/migrations/0005_monetization.sql. Not "use server" — these
 * are only ever called from other server code (features/actions/mutations.ts),
 * never directly from a client component, and both RPCs are revoked from
 * anon/authenticated at the database level regardless.
 */

export type ConsumeResult =
  | { allowed: true; method: "pass" }
  | { allowed: true; method: "credit"; balanceAfter: number | null }
  | { allowed: false };

/**
 * The single authorization + spend gate for creating an Action. `actionId`
 * should be a client-generated UUID (crypto.randomUUID()) that the caller
 * then inserts `actions` with as that same id — see createActionAndInvite.
 */
export async function consumeActionCreditOrPass(userId: string, actionId: string): Promise<ConsumeResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_action_credit_or_pass", {
    p_user_id: userId,
    p_action_id: actionId,
  });

  if (error) {
    logError("[consumeActionCreditOrPass] RPC failed:", error);
    return { allowed: false };
  }
  const result = data?.[0];
  if (!result || !result.allowed) return { allowed: false };

  if (result.method === "pass") return { allowed: true, method: "pass" };
  return { allowed: true, method: "credit", balanceAfter: result.balance_after };
}

/**
 * Compensating entry for the one real edge case this design accepts: credit
 * consumed successfully, but something else in createActionAndInvite failed
 * afterward. A ledger-style refund (not a delete) so the original spend and
 * the correction are both visible in the audit trail.
 */
export async function refundActionCredit(userId: string, note: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("action_credit_transactions").insert({
    user_id: userId,
    type: "admin_adjustment",
    amount: 1,
    reference_type: "system",
    note,
  });
  if (error) logError("[refundActionCredit] failed to insert compensating transaction:", error);
}

export interface ReferralGrantResult {
  granted: boolean;
  inviterUserId: string | null;
}

/** Best-effort — never blocks the accept flow itself if this fails. */
export async function grantReferralRewardIfEligible(
  userId: string,
  actionId: string,
  rewardAmount: number,
): Promise<ReferralGrantResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_referral_reward_if_eligible", {
    p_user_id: userId,
    p_action_id: actionId,
    p_reward_amount: rewardAmount,
  });

  if (error) {
    logError("[grantReferralRewardIfEligible] RPC failed:", error);
    return { granted: false, inviterUserId: null };
  }
  const result = data?.[0];
  if (!result) return { granted: false, inviterUserId: null };
  return { granted: result.granted, inviterUserId: result.inviter_user_id };
}
