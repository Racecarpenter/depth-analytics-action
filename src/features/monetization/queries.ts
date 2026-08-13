import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface EntitlementSummary {
  /** sum(amount) over action_credit_transactions — never a stored counter. */
  balance: number;
  activePass: { expiresAt: string } | null;
  canCreateAction: boolean;
}

/**
 * Read-only preview of the signed-in user's entitlement, RLS-scoped to
 * whoever's cookies are on the request. Used for UI (paywall gating,
 * balance display) — never the authorization decision itself for actually
 * creating an Action. That's `consumeActionCreditOrPass` in ./mutations,
 * which re-checks atomically at the moment of creation so a stale read here
 * can never let two requests spend the same last credit.
 */
export async function getEntitlementSummary(): Promise<EntitlementSummary> {
  const supabase = await createClient();

  const [{ data: passes }, { data: transactions }] = await Promise.all([
    supabase
      .from("action_passes")
      .select("expires_at")
      .order("expires_at", { ascending: false })
      .returns<{ expires_at: string }[]>(),
    supabase.from("action_credit_transactions").select("amount").returns<{ amount: number }[]>(),
  ]);

  const now = Date.now();
  const activePassRow = (passes ?? []).find((p) => new Date(p.expires_at).getTime() > now);
  const balance = (transactions ?? []).reduce((sum, t) => sum + t.amount, 0);

  return {
    balance,
    activePass: activePassRow ? { expiresAt: activePassRow.expires_at } : null,
    canCreateAction: Boolean(activePassRow) || balance > 0,
  };
}
