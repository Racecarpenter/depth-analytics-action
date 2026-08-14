"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PRICING } from "@/lib/monetization/pricing";
import { claimBetaPaywallCredits } from "../beta-mutations";

/**
 * The temporary beta-only "keep testing for free" option — see README
 * ("Beta testing access"). Paywall only renders this when the server has
 * already confirmed (getEntitlementSummary().isBetaTester +
 * isBetaFreeCreditsFeatureEnabled()) that the signed-in user is an
 * authorized beta tester and the feature is currently on;
 * claimBetaPaywallCredits() independently re-checks both server-side
 * regardless, so this component being rendered is a UX convenience, never
 * the actual authorization boundary.
 */
export function BetaPaywallCredits() {
  const [error, setError] = useState<string | undefined>();
  const [granted, setGranted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClaim() {
    setError(undefined);
    startTransition(async () => {
      const result = await claimBetaPaywallCredits();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGranted(true);
      // Re-runs the current route's server components — the parent page's
      // getEntitlementSummary() picks up the new balance and stops
      // rendering the paywall at all, handing back the normal creation
      // flow with no extra "close" step needed.
      router.refresh();
    });
  }

  return (
    <Card className="border-accent/30">
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Beta access</p>
        <div className="mt-1 flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">{PRICING.betaGrantActions} Actions</p>
          <p className="mono-nums text-sm font-semibold text-accent">Free</p>
        </div>

        {granted ? (
          <p className="mt-4 text-sm font-medium text-accent">+{PRICING.betaGrantActions} Actions added</p>
        ) : (
          <>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <Button className="mt-4 w-full tap-target" isLoading={isPending} disabled={isPending} onClick={handleClaim}>
              Add {PRICING.betaGrantActions} Actions
            </Button>
            <p className="mt-2 text-center text-xs text-ink-faint">Beta testing only — no payment required.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
