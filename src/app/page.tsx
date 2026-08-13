import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { requireUser } from "@/features/auth/session";
import { ActionCard } from "@/features/actions/components/action-card";
import { getActionsForCurrentUser } from "@/features/actions/queries";
import { findParticipant, personalStatus } from "@/features/actions/types";
import { getRecentNotifications } from "@/features/notifications/queries";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { BalanceBadge } from "@/features/monetization/components/balance-badge";
import { getEntitlementSummary } from "@/features/monetization/queries";
import { STATUS_GROUPS } from "@/lib/constants";
import type { ActionStatus } from "@/types/domain";

export default async function HomePage() {
  const user = await requireUser();
  const [actions, notifications, entitlement] = await Promise.all([
    getActionsForCurrentUser(),
    getRecentNotifications(),
    getEntitlementSummary(),
  ]);

  const byGroup = (statuses: ActionStatus[]) =>
    actions.filter((action) => {
      const viewer = findParticipant(action, user.id);
      const status = personalStatus(action.status, viewer?.role ?? null);
      return statuses.includes(status);
    });

  const sections = [
    { key: "pending", title: "Pending", items: byGroup(STATUS_GROUPS.pending) },
    { key: "accepted", title: "Accepted", items: byGroup(STATUS_GROUPS.accepted) },
    { key: "live", title: "Live", items: byGroup(STATUS_GROUPS.live) },
    { key: "settled", title: "Settled", items: byGroup(STATUS_GROUPS.settled) },
  ];

  const hasAnyActions = actions.length > 0;

  return (
    <>
      <AppHeader
        right={
          <>
            <NotificationBell notifications={notifications} />
            <Link
              href="/account"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-bg-raised hover:text-ink"
              aria-label="Account"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" strokeLinecap="round" />
              </svg>
            </Link>
          </>
        }
      />
      <PageContainer>
        <div className="mb-8">
          <Link href="/actions/new">
            <Button size="lg" className="w-full tap-target">
              Create Action
            </Button>
          </Link>
          <div className="mt-2 text-center">
            <BalanceBadge entitlement={entitlement} />
          </div>
        </div>

        {!hasAnyActions ? (
          <EmptyState
            title="No Actions yet"
            description="Challenge a friend on tonight's game to get started."
            action={
              <Link href="/actions/new">
                <Button variant="secondary">Create your first Action</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-8">
            {sections.map(
              (section) =>
                section.items.length > 0 && (
                  <section key={section.key}>
                    <SectionHeading title={section.title} count={section.items.length} />
                    <div className="space-y-3">
                      {section.items.map((action) => (
                        <ActionCard key={action.id} action={action} currentUserId={user.id} />
                      ))}
                    </div>
                  </section>
                ),
            )}
          </div>
        )}
      </PageContainer>
    </>
  );
}
