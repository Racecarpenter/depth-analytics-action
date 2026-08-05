import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/features/auth/session";
import { CancelActionButton } from "@/features/actions/components/cancel-action-button";
import { StatusPill } from "@/features/actions/components/status-pill";
import { ActionStatusHistoryList } from "@/features/actions/components/action-status-history";
import { getActionById, getActionStatusHistory } from "@/features/actions/queries";
import { findParticipant, getWinnerLoser, opponentOf, personalStatus } from "@/features/actions/types";
import { MARKET_LABELS, STAKE_DISCLAIMER } from "@/lib/constants";
import { buildCashAppPayLink } from "@/lib/utils/cash-app";
import { formatStake } from "@/lib/utils/currency";
import { formatGameTime } from "@/lib/utils/date";
import { maskPhone } from "@/lib/utils/phone";

export default async function ActionDetailPage({
  params,
}: {
  params: Promise<{ actionId: string }>;
}) {
  const user = await requireUser();
  const { actionId } = await params;

  const action = await getActionById(actionId);
  if (!action) notFound();

  const history = await getActionStatusHistory(actionId);
  const viewer = findParticipant(action, user.id);
  const opponent = opponentOf(action, user.id);
  const status = personalStatus(action.status, viewer?.role ?? null);
  const isLocked = action.status !== "pending" && action.status !== "declined" && action.status !== "cancelled";
  const isFinal = ["won", "lost", "push"].includes(action.status);
  const winnerLoser = getWinnerLoser(action);
  const viewerOwesMoney = winnerLoser?.loser.user_id === user.id;
  const payLink =
    viewerOwesMoney && winnerLoser && action.stake_amount && winnerLoser.winner.user?.cashtag
      ? buildCashAppPayLink(
          winnerLoser.winner.user.cashtag,
          action.stake_amount,
          `${action.game.away_team.abbreviation}@${action.game.home_team.abbreviation} — ACTION`,
        )
      : null;

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/" label="Home" />

        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {action.game.league}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              {action.game.away_team.name} <span className="text-ink-faint">@</span> {action.game.home_team.name}
            </h1>
            <p className="mt-0.5 text-sm text-ink-faint">{formatGameTime(action.game.start_time)}</p>
          </div>
          <StatusPill status={status} />
        </div>

        {isFinal && action.game.home_score !== null && action.game.away_score !== null && (
          <Card className="mb-5">
            <CardContent className="flex items-center justify-center gap-6 pt-5 text-center">
              <div>
                <p className="text-xs text-ink-faint">{action.game.away_team.abbreviation}</p>
                <p className="mono-nums text-2xl font-semibold text-ink">{action.game.away_score}</p>
              </div>
              <span className="text-ink-faint">–</span>
              <div>
                <p className="text-xs text-ink-faint">{action.game.home_team.abbreviation}</p>
                <p className="mono-nums text-2xl font-semibold text-ink">{action.game.home_score}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-5">
          <CardContent className="grid grid-cols-2 gap-5 pt-5">
            <div>
              <p className="text-xs text-ink-faint">Market</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{MARKET_LABELS[action.market]}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Stake</p>
              <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{formatStake(action.stake_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Your pick</p>
              <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{viewer?.side_label ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Opponents pick</p>
              <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{opponent?.side_label ?? "—"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-ink-faint">Opponent</p>
              <p className="mt-0.5 text-sm font-medium text-ink">
                {opponent ? maskPhone(opponent.phone) : "—"}
                {opponent?.status === "invited" && (
                  <span className="ml-2 text-xs font-normal text-ink-faint">Awaiting response</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {winnerLoser && action.stake_amount && (
          <Card className="mb-5">
            <CardContent className="pt-5">
              {viewerOwesMoney ? (
                payLink ? (
                  <>
                    <p className="text-sm font-medium text-ink">
                      You owe {formatStake(action.stake_amount)} — ${winnerLoser.winner.user?.cashtag}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Opens Cash App with the amount pre-filled. You still review and confirm it there — ACTION never
                      touches this money.
                    </p>
                    <a href={payLink} target="_blank" rel="noopener noreferrer" className="mt-4 block">
                      <Button className="w-full tap-target">Pay via Cash App</Button>
                    </a>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">
                    You owe {formatStake(action.stake_amount)}. Ask your opponent for their Cash App $cashtag to
                    settle up, or add your own in{" "}
                    <Link href="/account" className="text-accent underline underline-offset-2">
                      your account
                    </Link>{" "}
                    so future wins are easier to collect.
                  </p>
                )
              ) : (
                <p className="text-sm text-ink-muted">
                  Youre owed {formatStake(action.stake_amount)}.{" "}
                  {winnerLoser.winner.user?.cashtag ? (
                    <>They can pay ${winnerLoser.winner.user.cashtag} directly.</>
                  ) : (
                    <>
                      Add your Cash App $cashtag in{" "}
                      <Link href="/account" className="text-accent underline underline-offset-2">
                        your account
                      </Link>{" "}
                      so they have somewhere to send it.
                    </>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <p className="mb-5 text-xs leading-relaxed text-ink-faint">{STAKE_DISCLAIMER}</p>

        {isLocked && (
          <p className="mb-5 rounded-xl border border-border-subtle bg-bg-raised px-4 py-3 text-xs leading-relaxed text-ink-faint">
            This Action is locked. The game, market, line, stake, and opponent can no longer be changed.
          </p>
        )}

        {viewer?.role === "creator" && action.status === "pending" && (
          <div className="mb-5">
            <CancelActionButton actionId={action.id} />
          </div>
        )}

        <div>
          <p className="mb-4 text-sm font-medium text-ink">Timeline</p>
          <ActionStatusHistoryList entries={history} />
        </div>
      </PageContainer>
    </>
  );
}
