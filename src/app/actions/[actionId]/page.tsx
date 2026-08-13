import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/features/auth/session";
import { CancelActionButton } from "@/features/actions/components/cancel-action-button";
import { StatusPill } from "@/features/actions/components/status-pill";
import { ActionStatusHistoryList } from "@/features/actions/components/action-status-history";
import { getActionById, getActionStatusHistory } from "@/features/actions/queries";
import { findParticipant, getWinnerLoser, opponentOf, personalStatus } from "@/features/actions/types";
import { PaymentSettlementCard } from "@/features/settlement/components/payment-settlement-card";
import { getLastNudgeAt } from "@/features/settlement/queries";
import { MANUAL_NUDGE_COOLDOWN_HOURS } from "@/lib/settlement/reminder-schedule";
import { MARKET_LABELS, STAKE_DISCLAIMER } from "@/lib/constants";
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
  const viewerPaymentRole: "winner" | "loser" | null =
    winnerLoser?.winner.user_id === user.id ? "winner" : winnerLoser?.loser.user_id === user.id ? "loser" : null;
  const showPaymentCard = winnerLoser !== null && action.payment_status !== "not_applicable" && viewerPaymentRole !== null;

  const nudgeAvailableAt =
    showPaymentCard && action.payment_status === "owed"
      ? await getLastNudgeAt(action.id).then((lastNudgeAt) =>
          lastNudgeAt ? new Date(new Date(lastNudgeAt).getTime() + MANUAL_NUDGE_COOLDOWN_HOURS * 3_600_000).toISOString() : null,
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

        {showPaymentCard && winnerLoser && action.stake_amount && viewerPaymentRole && action.payment_status !== "not_applicable" && (
          <PaymentSettlementCard
            actionId={action.id}
            paymentStatus={action.payment_status}
            viewerRole={viewerPaymentRole}
            amount={formatStake(action.stake_amount)}
            winnerName={winnerLoser.winner.user?.display_name?.trim() || "your opponent"}
            loserName={winnerLoser.loser.user?.display_name?.trim() || "your opponent"}
            nudgeAvailableAt={nudgeAvailableAt}
          />
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
