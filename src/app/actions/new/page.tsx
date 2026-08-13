import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { requireUser } from "@/features/auth/session";
import { GameSearch } from "@/features/games/components/game-search";
import { ActionTypeTabs } from "@/features/actions/components/action-type-tabs";

export default async function NewActionPage() {
  await requireUser();

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/" label="Home" />
        <h1 className="mb-1 text-xl font-semibold text-ink">Create Action</h1>
        <p className="mb-6 text-sm text-ink-faint">Search for a game to challenge a friend on.</p>
        <ActionTypeTabs active="sports" />
        <GameSearch />
      </PageContainer>
    </>
  );
}
