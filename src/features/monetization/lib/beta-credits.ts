import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PRICING } from "@/lib/monetization/pricing";
import { logError } from "@/lib/utils/log-error";

/**
 * Single kill switch for the whole beta free-credit feature (see README
 * "Beta testing access"). When Stripe goes live, set this to false in
 * Vercel and redeploy: the option disappears from the paywall (see the two
 * NewAction*Page server components, which read this to decide what to pass
 * into <Paywall>) AND grantBetaPaywallCredits refuses below, with no other
 * change required anywhere else in the monetization system.
 */
export function isBetaFreeCreditsFeatureEnabled(): boolean {
  return process.env.ENABLE_BETA_FREE_CREDITS === "true";
}

export type BetaGrantReason = "not_beta_tester" | "has_active_pass" | "balance_positive" | "feature_disabled" | "error";

export interface BetaGrantResult {
  granted: boolean;
  reason?: BetaGrantReason;
  balanceAfter?: number | null;
}

/**
 * The only place a 'beta_grant' ledger row is ever inserted. This function's
 * own feature-flag check is a fast, cheap first gate — the real
 * authorization is grant_beta_paywall_credits (SECURITY DEFINER,
 * supabase/migrations/0018_beta_paywall_credits.sql), which independently
 * re-verifies beta-tester status, no active Pass, and balance <= 0 itself
 * regardless of what any caller believes to be true. A non-beta user (or
 * anyone hitting this with the flag off) gets `granted: false` — no partial
 * credit, no exception, nothing inserted.
 */
export async function grantBetaPaywallCredits(userId: string): Promise<BetaGrantResult> {
  if (!isBetaFreeCreditsFeatureEnabled()) {
    return { granted: false, reason: "feature_disabled" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_beta_paywall_credits", {
    p_user_id: userId,
    p_amount: PRICING.betaGrantActions,
  });

  if (error) {
    logError("[grantBetaPaywallCredits] RPC failed:", error);
    return { granted: false, reason: "error" };
  }
  const result = data?.[0];
  if (!result) return { granted: false, reason: "error" };

  return {
    granted: result.granted,
    reason: result.granted ? undefined : ((result.reason ?? "error") as BetaGrantReason),
    balanceAfter: result.balance_after,
  };
}
