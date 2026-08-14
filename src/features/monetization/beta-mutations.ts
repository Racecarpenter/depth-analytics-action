"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAnalyticsEvent } from "@/lib/monetization/analytics";
import { PRICING } from "@/lib/monetization/pricing";
import { grantBetaPaywallCredits } from "./lib/beta-credits";

export interface ClaimBetaCreditsResult {
  ok: boolean;
  error?: string;
  balanceAfter?: number | null;
}

/**
 * The ONE entry point for the temporary beta free-credit paywall option —
 * see README ("Beta testing access"). This file, lib/beta-credits.ts, the
 * 'beta_grant' transaction type, and components/beta-paywall-credits.tsx
 * are the entire feature: nothing else in the monetization system needs to
 * change, or even know this exists, to remove it later. Authentication and
 * beta eligibility are both re-checked here server-side — this is a Server
 * Action, callable directly, so it can never trust that only an eligible
 * user's browser rendered the button that called it.
 */
export async function claimBetaPaywallCredits(): Promise<ClaimBetaCreditsResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await grantBetaPaywallCredits(currentUser.id);
  if (!result.granted) {
    const message =
      result.reason === "not_beta_tester"
        ? "This is only available to beta testers."
        : result.reason === "has_active_pass"
          ? "You already have an active Action Pass."
          : result.reason === "balance_positive"
            ? "You still have Actions available."
            : result.reason === "feature_disabled"
              ? "Beta credits aren't available right now."
              : "Something went wrong. Try again.";
    return { ok: false, error: message };
  }

  // Mirrors the same first-party analytics pattern as starter grants
  // (verifyOtp) and paywall views (logPaywallShown) — analytics_events has
  // a real jsonb metadata column, unlike the credit ledger itself, so the
  // "source"/"quantity" detail lives here rather than as a new column on
  // action_credit_transactions purely for this one feature.
  const admin = createAdminClient();
  await logAnalyticsEvent(admin, {
    eventName: "beta_credits_granted",
    userId: currentUser.id,
    metadata: { source: "beta_paywall", quantity: PRICING.betaGrantActions },
  });

  revalidatePath("/");

  return { ok: true, balanceAfter: result.balanceAfter };
}
