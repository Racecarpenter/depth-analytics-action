import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/features/auth/session";
import { ActionBuilder } from "@/features/actions/components/action-builder";
import { getEntitlementSummary } from "@/features/monetization/queries";
import { Paywall } from "@/features/monetization/components/paywall";
import { getSportsDataProvider } from "@/lib/sports-data";

export default async function NewActionForGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  await requireUser();
  const { gameId } = await params;
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
          <Paywall returnTo={`/actions/new/${gameId}`} justPurchased={checkout === "success"} />
        </PageContainer>
      </>
    );
  }

  const provider = getSportsDataProvider();
  const event = await provider.getEvent(gameId);

  if (!event) notFound();

  const alreadyStarted = event.status !== "scheduled";

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/actions/new" label="Search" />
        {alreadyStarted ? (
          <EmptyState
            title="This game has already started"
            description="You can only create an Action for a game that hasn't kicked off yet."
          />
        ) : (
          <ActionBuilder event={event} />
        )}
      </PageContainer>
    </>
  );
}
