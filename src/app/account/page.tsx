import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireUser } from "@/features/auth/session";
import { BalanceBadge } from "@/features/monetization/components/balance-badge";
import { getEntitlementSummary } from "@/features/monetization/queries";
import { formatPhoneForDisplay } from "@/lib/utils/phone";

// The Cash App $cashtag field (features/account/components/cashtag-form.tsx)
// is intentionally not rendered here — payment settlement no longer routes
// through Cash App. See README ("Payment settlement" section) for how to
// restore it.
export default async function AccountPage() {
  const user = await requireUser();
  const entitlement = await getEntitlementSummary();

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/" label="Home" />
        <h1 className="mb-1 text-xl font-semibold text-ink">Account</h1>
        <p className="mb-1 text-sm text-ink-faint">{formatPhoneForDisplay(user.phone)}</p>
        <div className="mb-6">
          <BalanceBadge entitlement={entitlement} />
        </div>

        <SignOutButton />

        <p className="mt-8 text-xs text-ink-faint">
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink-muted">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink-muted">
            Privacy
          </Link>
        </p>
      </PageContainer>
    </>
  );
}
