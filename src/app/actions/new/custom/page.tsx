import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/features/auth/session";
import { ActionTypeTabs } from "@/features/actions/components/action-type-tabs";
import { CustomActionBuilder } from "@/features/custom-actions/components/custom-action-builder";
import { getEntitlementSummary } from "@/features/monetization/queries";
import { Paywall } from "@/features/monetization/components/paywall";
import { isBetaFreeCreditsFeatureEnabled } from "@/features/monetization/lib/beta-credits";

export default async function NewCustomActionPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  await requireUser();
  const { checkout } = await searchParams;

  const entitlement = await getEntitlementSummary();
  if (entitlement.error) {
    return (
      <>
        <AppHeader />
        <PageContainer>
          <BackLink href="/actions/new" label="Search" />
          <EmptyState
            title="Couldn't load your account"
            description="Something went wrong checking your Action balance. Try again in a moment."
          />
        </PageContainer>
      </>
    );
  }
  if (!entitlement.canCreateAction) {
    return (
      <>
        <AppHeader />
        <PageContainer>
          <BackLink href="/actions/new" label="Search" />
          <Paywall
            returnTo="/actions/new/custom"
            justPurchased={checkout === "success"}
            actionPackPurchasable={Boolean(process.env.STRIPE_PRICE_ACTION_PACK)}
            actionPassPurchasable={Boolean(process.env.STRIPE_PRICE_ACTION_PASS)}
            betaCreditsAvailable={entitlement.isBetaTester && isBetaFreeCreditsFeatureEnabled()}
          />
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/actions/new" label="Search" />
        <h1 className="mb-1 text-xl font-semibold text-ink">Create Action</h1>
        <p className="mb-6 text-sm text-ink-faint">Winner-take-all, decided by everyone agreeing on who won.</p>
        <ActionTypeTabs active="custom" />
        <CustomActionBuilder />
      </PageContainer>
    </>
  );
}
