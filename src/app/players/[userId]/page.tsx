import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/features/auth/session";
import { resolveIdentity } from "@/features/users/lib/identity";
import { getHeadToHeadStats, getUserActionStats } from "@/features/users/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatStake } from "@/lib/utils/currency";
import { logError } from "@/lib/utils/log-error";

/**
 * The lightweight "relationship profile" — never globally browsable. Access
 * is gated entirely by shared Action history: get_head_to_head_stats
 * returns actions_together: 0 for any pair with no genuine (both sides
 * accepted) shared Action, and that's treated identically to "this route
 * doesn't exist" — see README ("User profiles") for why that's the whole
 * privacy model here, no separate ACL table needed.
 */
export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const viewer = await requireUser();
  const { userId } = await params;

  if (userId === viewer.id) redirect("/profile");

  const headToHead = await getHeadToHeadStats(viewer.id, userId);
  if (!headToHead || headToHead.actionsTogether === 0) notFound();

  const admin = createAdminClient();
  const { data: profileUser, error } = await admin
    .from("users")
    .select("id, display_name, username, avatar_path, phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) logError("[PlayerProfilePage] user lookup failed:", error);
  if (!profileUser) notFound();

  const identity = resolveIdentity(profileUser, profileUser.phone);
  const stats = await getUserActionStats(userId);
  const settlementRate =
    stats && stats.owedTotalCount > 0 ? Math.round((stats.settledCount / stats.owedTotalCount) * 100) : null;

  const netLabel =
    headToHead.netAmount === 0
      ? "Even"
      : `${headToHead.netAmount > 0 ? "+" : "-"}${formatStake(Math.abs(headToHead.netAmount))}`;
  const netTone = headToHead.netAmount > 0 ? "text-accent" : headToHead.netAmount < 0 ? "text-danger" : "text-ink";

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/" label="Home" />

        <div className="mb-6 flex items-center gap-4">
          <Avatar url={identity.avatarUrl} label={identity.name} size="lg" />
          <div>
            <h1 className="text-xl font-semibold text-ink">{identity.name}</h1>
            {identity.handle && <p className="text-sm text-ink-faint">{identity.handle}</p>}
          </div>
        </div>

        {stats && (
          <Card className="mb-5">
            <CardContent className="grid grid-cols-2 gap-5 pt-5">
              <div>
                <p className="text-xs text-ink-faint">Record</p>
                <p className="mono-nums mt-0.5 text-lg font-semibold text-ink">
                  {stats.wins}–{stats.losses}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-faint">Total Actions</p>
                <p className="mono-nums mt-0.5 text-lg font-semibold text-ink">{stats.totalActions}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-ink-faint">Settlement rate</p>
                <p className="mono-nums mt-0.5 text-lg font-semibold text-ink">
                  {settlementRate === null ? "—" : `${settlementRate}%`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <p className="mb-3 text-sm font-medium text-ink">You vs {identity.name}</p>
          <Card>
            <CardContent className="grid grid-cols-2 gap-5 pt-5">
              <div>
                <p className="text-xs text-ink-faint">Record</p>
                <p className="mono-nums mt-0.5 text-lg font-semibold text-ink">
                  {headToHead.viewerWins}–{headToHead.viewerLosses}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-faint">Actions together</p>
                <p className="mono-nums mt-0.5 text-lg font-semibold text-ink">{headToHead.actionsTogether}</p>
              </div>
              {headToHead.obligationsCount > 0 && (
                <>
                  <div>
                    <p className="text-xs text-ink-faint">Net</p>
                    <p className={`mono-nums mt-0.5 text-lg font-semibold ${netTone}`}>{netLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-faint">Settled</p>
                    <p className="mono-nums mt-0.5 text-lg font-semibold text-ink">
                      {headToHead.allSettled ? "All settled ✓" : "Some open"}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
