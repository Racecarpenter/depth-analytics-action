import { format } from "date-fns";
import type { EntitlementSummary } from "../queries";

/**
 * Subtle, text-only balance indicator — not a wallet. "2 Actions available"
 * or "Action Pass Active — Expires Sep 12", nothing fancier.
 */
export function BalanceBadge({ entitlement }: { entitlement: EntitlementSummary }) {
  if (entitlement.error) {
    return <p className="text-xs text-ink-faint">Action balance unavailable — refresh to try again.</p>;
  }

  if (entitlement.betaUnlimited) {
    return <p className="text-xs text-ink-faint">Beta tester — unlimited Actions</p>;
  }

  if (entitlement.activePass) {
    return (
      <p className="text-xs text-ink-faint">
        Action Pass Active — Expires {format(new Date(entitlement.activePass.expiresAt), "MMM d")}
      </p>
    );
  }

  return (
    <p className="text-xs text-ink-faint">
      {entitlement.balance} {entitlement.balance === 1 ? "Action" : "Actions"} available
    </p>
  );
}
