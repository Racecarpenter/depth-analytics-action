import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/features/auth/session";
import { ActionBuilder } from "@/features/actions/components/action-builder";
import { getSportsDataProvider } from "@/lib/sports-data";

export default async function NewActionForGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  await requireUser();
  const { gameId } = await params;

  const provider = getSportsDataProvider();
  const event = await provider.getEvent(gameId);

  if (!event) notFound();

  const alreadyStarted = event.status !== "scheduled";
  const markets = alreadyStarted ? [] : await provider.getMarkets(gameId);

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
          <ActionBuilder event={event} markets={markets} />
        )}
      </PageContainer>
    </>
  );
}
