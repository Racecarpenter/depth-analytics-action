import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/utils/log-error";

export interface EntitlementSummary {
  /** sum(amount) over action_credit_transactions — never a stored counter. */
  balance: number;
  activePass: { expiresAt: string } | null;
  /** Active beta_unlimited entitlement — see supabase/migrations/0015_beta_entitlements.sql. */
  betaUnlimited: boolean;
  canCreateAction: boolean;
  /**
   * True if a genuine Supabase read failed on the way to computing the
   * fields above. When this is true, `balance`/`canCreateAction` are a
   * fail-open guess, not a legitimate account state — callers should show a
   * distinct "couldn't load your account" state instead of the paywall.
   * See features/monetization/queries.ts audit notes: this read used to
   * silently collapse a failed query into "0 Actions available," which is
   * indistinguishable from a real, legitimate paywall trigger.
   */
  error: boolean;
}

/**
 * Read-only preview of the signed-in user's entitlement, RLS-scoped to
 * whoever's cookies are on the request. Used for UI (paywall gating,
 * balance display) — never the authorization decision itself for actually
 * creating an Action. That's `consumeActionCreditOrPass` in ./lib/credits,
 * which re-checks atomically at the moment of creation so a stale read here
 * can never let two requests spend the same last credit.
 */
export async function getEntitlementSummary(): Promise<EntitlementSummary> {
  const supabase = await createClient();

  const [passesResult, transactionsResult, betaResult] = await Promise.all([
    supabase
      .from("action_passes")
      .select("expires_at")
      .order("expires_at", { ascending: false })
      .returns<{ expires_at: string }[]>(),
    supabase.from("action_credit_transactions").select("amount").returns<{ amount: number }[]>(),
    supabase
      .from("user_entitlements")
      .select("expires_at")
      .eq("entitlement_type", "beta_unlimited")
      .is("revoked_at", null)
      .returns<{ expires_at: string | null }[]>(),
  ]);

  if (passesResult.error || transactionsResult.error || betaResult.error) {
    logError("[getEntitlementSummary] a read failed:", passesResult.error ?? transactionsResult.error ?? betaResult.error);
    // Fail open, not closed: this is a UI preview, not the authorization
    // decision. The atomic RPC (consumeActionCreditOrPass) is still the
    // real gate at creation time, so letting someone through to the
    // builder here costs nothing if they turn out to actually be at zero —
    // the RPC will correctly deny and surface the real paywall then.
    // What we must never do is claim balance: 0 as if that were a
    // legitimate read.
    return { balance: 0, activePass: null, betaUnlimited: false, canCreateAction: true, error: true };
  }

  const now = Date.now();
  const activePassRow = (passesResult.data ?? []).find((p) => new Date(p.expires_at).getTime() > now);
  const balance = (transactionsResult.data ?? []).reduce((sum, t) => sum + t.amount, 0);
  const betaUnlimited = (betaResult.data ?? []).some((e) => !e.expires_at || new Date(e.expires_at).getTime() > now);

  return {
    balance,
    activePass: activePassRow ? { expiresAt: activePassRow.expires_at } : null,
    betaUnlimited,
    canCreateAction: betaUnlimited || Boolean(activePassRow) || balance > 0,
    error: false,
  };
}
