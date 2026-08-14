import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { ParticipantIdentity } from "@/features/users/components/participant-identity";
import { resolveIdentity } from "@/features/users/lib/identity";
import { requireUser } from "@/features/auth/session";
import { ActionInviteResponse } from "@/features/actions/components/action-invite-response";
import { CancelActionButton } from "@/features/actions/components/cancel-action-button";
import { StatusPill } from "@/features/actions/components/status-pill";
import { ActionStatusHistoryList } from "@/features/actions/components/action-status-history";
import { getActionById, getActionStatusHistory } from "@/features/actions/queries";
import {
  canRespondToInvite,
  findParticipant,
  getResolution,
  opponentOf,
  personalStatus,
  type ActionWithDetails,
} from "@/features/actions/types";
import { AcceptanceChecklist } from "@/features/custom-actions/components/acceptance-checklist";
import { ResolutionReveal } from "@/features/custom-actions/components/resolution-reveal";
import { VotingPanel } from "@/features/custom-actions/components/voting-panel";
import { getVoteCountForRound, getVoteTally, hasVotedThisRound } from "@/features/custom-actions/queries";
import { ObligationList, type ObligationListEntry } from "@/features/settlement/components/obligation-list";
import { PaymentSettlementCard } from "@/features/settlement/components/payment-settlement-card";
import { participantDisplayName } from "@/features/settlement/lib/context";
import { getLastNudgeAt, getObligationsForAction } from "@/features/settlement/queries";
import { MANUAL_NUDGE_COOLDOWN_HOURS } from "@/lib/settlement/reminder-schedule";
import { STAKE_DISCLAIMER } from "@/lib/constants";
import { formatStake } from "@/lib/utils/currency";
import { formatGameTime } from "@/lib/utils/date";

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
  const status = personalStatus(action.status, viewer?.role ?? null);
  const isLocked = action.status !== "pending" && action.status !== "declined" && action.status !== "cancelled";

  // Single resolution point for "who is this participant" on this page —
  // identityFor gives the full { name, avatarUrl } shape for components that
  // render an avatar (AcceptanceChecklist); nameFor is a thin wrapper for
  // the plain-text-only leaf components (VotingPanel, ResolutionReveal,
  // ObligationList) that weren't reshaped to take avatars — see README
  // ("User profiles") for why those stayed text-only.
  const identityFor = (participantId: string) => {
    const p = action.participants.find((x) => x.id === participantId);
    if (!p) return { name: "someone", handle: null, avatarUrl: null, hasProfile: false };
    return resolveIdentity(p.user, p.phone);
  };
  const nameFor = (participantId: string) => identityFor(participantId).name;

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/" label="Home" />

        {action.action_type === "sports" ? (
          <SportsHeader action={action} status={status} />
        ) : (
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Custom Action</p>
              <h1 className="mt-1 text-xl font-semibold text-ink">{action.title}</h1>
            </div>
            <StatusPill status={status} />
          </div>
        )}

        {action.action_type === "sports" ? (
          <SportsInfoCard action={action} viewerId={user.id} />
        ) : (
          <CustomInfoCard action={action} />
        )}

        {/* Accept/Decline — in-app, no invite link required (see respondToActionInvite) */}
        {canRespondToInvite(action, user.id) && <ActionInviteResponse actionId={action.id} />}

        {/* Custom Action: acceptance checklist while pending */}
        {action.action_type === "custom" && action.status === "pending" && (
          <AcceptanceChecklist
            entries={action.participants.map((p) => {
              const identity = identityFor(p.id);
              return {
                id: p.id,
                name: identity.name,
                avatarUrl: identity.avatarUrl,
                accepted: p.status === "accepted",
              };
            })}
          />
        )}

        {/* Custom Action: voting panel while accepted (voting is open the instant everyone's in) */}
        {action.action_type === "custom" && action.status === "accepted" && viewer && (
          <CustomVoting action={action} viewerParticipantId={viewer.id} nameFor={nameFor} />
        )}

        {/* Custom Action: reveal + multi-obligation settlement once resolved */}
        {action.action_type === "custom" && action.status === "resolved" && (
          <CustomResolution action={action} viewerId={user.id} nameFor={nameFor} />
        )}

        {/* Sports Action: single-obligation settlement card once it has a resolution */}
        {action.action_type === "sports" && ["won", "lost", "push"].includes(action.status) && (
          <SportsSettlement action={action} viewerId={user.id} />
        )}

        <p className="mb-5 text-xs leading-relaxed text-ink-faint">{STAKE_DISCLAIMER}</p>

        {isLocked && (
          <p className="mb-5 rounded-xl border border-border-subtle bg-bg-raised px-4 py-3 text-xs leading-relaxed text-ink-faint">
            This Action is locked. The{" "}
            {action.action_type === "sports" ? "game, team picks, stake, and opponent" : "title, stake, and participants"} can
            no longer be changed.
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

// --- Sports ---

function SportsHeader({
  action,
  status,
}: {
  action: ActionWithDetails;
  status: ReturnType<typeof personalStatus>;
}) {
  if (!action.game) return null;
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{action.game.league}</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">
          {action.game.away_team.name} <span className="text-ink-faint">@</span> {action.game.home_team.name}
        </h1>
        <p className="mt-0.5 text-sm text-ink-faint">{formatGameTime(action.game.start_time)}</p>
      </div>
      <StatusPill status={status} />
    </div>
  );
}

function SportsInfoCard({
  action,
  viewerId,
}: {
  action: ActionWithDetails;
  viewerId: string;
}) {
  if (!action.game || !action.market) return null;
  const viewer = findParticipant(action, viewerId);
  const opponent = opponentOf(action, viewerId);
  const isFinal = ["won", "lost", "push"].includes(action.status);
  // Only link through to the lightweight profile once there's genuine
  // shared history (opponent has accepted) — matches the same "genuinely
  // participated" rule the people-history RPCs use, and is what keeps
  // /players/[userId] from being reachable off a still-pending invite.
  const opponentProfileHref =
    opponent?.status === "accepted" && opponent.user_id ? `/players/${opponent.user_id}` : undefined;

  return (
    <>
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
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="text-xs text-ink-faint">Your team</p>
              <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{viewer?.side_label ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Opponent&apos;s team</p>
              <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{opponent?.side_label ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Stake</p>
              <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{formatStake(action.stake_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Opponent</p>
              {opponent ? (
                <div className="mt-1">
                  <ParticipantIdentity source={opponent.user} phone={opponent.phone} href={opponentProfileHref} size="sm" />
                  {opponent.status === "invited" && (
                    <span className="mt-1 block text-xs font-normal text-ink-faint">Awaiting response</span>
                  )}
                </div>
              ) : (
                <p className="mt-0.5 text-sm font-medium text-ink">—</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

async function SportsSettlement({
  action,
  viewerId,
}: {
  action: ActionWithDetails;
  viewerId: string;
}) {
  const resolution = getResolution(action);
  // A sports Action always has exactly one loser; losers is typed as an
  // array only because getResolution is shared with Custom Actions (up to 7).
  const loser = resolution?.losers[0];
  if (!resolution || !loser || !action.stake_amount) return null;

  const obligations = await getObligationsForAction(action.id);
  const obligation = obligations[0];
  // An obligation row is only ever created with payment_status "owed" and
  // moves through marked_paid/disputed/settled from there — "not_applicable"
  // is exclusively the actions.payment_status rollup value for Actions with
  // no obligations at all, so this guard is just satisfying the narrower
  // PaymentSettlementCard prop type, not a real runtime case.
  if (!obligation || obligation.paymentStatus === "not_applicable") return null;

  const viewerRole: "winner" | "loser" | null =
    obligation.creditorParticipantId === findParticipant(action, viewerId)?.id
      ? "winner"
      : obligation.debtorParticipantId === findParticipant(action, viewerId)?.id
        ? "loser"
        : null;
  if (!viewerRole) return null;

  const nudgeAvailableAt =
    obligation.paymentStatus === "owed"
      ? await getLastNudgeAt(obligation.id).then((lastNudgeAt) =>
          lastNudgeAt ? new Date(new Date(lastNudgeAt).getTime() + MANUAL_NUDGE_COOLDOWN_HOURS * 3_600_000).toISOString() : null,
        )
      : null;

  return (
    <PaymentSettlementCard
      obligationId={obligation.id}
      paymentStatus={obligation.paymentStatus}
      viewerRole={viewerRole}
      amount={formatStake(obligation.amount)}
      winnerName={participantDisplayName(resolution.winner)}
      loserName={participantDisplayName(loser)}
      nudgeAvailableAt={nudgeAvailableAt}
    />
  );
}

// --- Custom ---

function CustomInfoCard({ action }: { action: ActionWithDetails }) {
  const participantCount = action.participants.length;
  const stake = action.stake_amount ?? 0;
  const grossPot = stake * participantCount;
  const winnerProfit = stake * Math.max(0, participantCount - 1);

  return (
    <Card className="mb-5">
      <CardContent className="grid grid-cols-2 gap-5 pt-5">
        <div>
          <p className="text-xs text-ink-faint">Stake (each)</p>
          <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{formatStake(stake)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-faint">Players</p>
          <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{participantCount}</p>
        </div>
        <div>
          <p className="text-xs text-ink-faint">Total Action</p>
          <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{formatStake(grossPot)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-faint">Winner takes</p>
          <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{formatStake(winnerProfit)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

async function CustomVoting({
  action,
  viewerParticipantId,
  nameFor,
}: {
  action: ActionWithDetails;
  viewerParticipantId: string;
  nameFor: (id: string) => string;
}) {
  const acceptedParticipants = action.participants.filter((p) => p.status === "accepted");
  const round = action.voting_round;
  const totalParticipants = acceptedParticipants.length;
  const voteCount = await getVoteCountForRound(action.id, round);
  const hasVoted = await hasVotedThisRound(action.id, round, viewerParticipantId);
  const allVoted = voteCount >= totalParticipants;

  // If all voted and it were unanimous, the RPC would have already flipped
  // action.status to "resolved" — reaching here with status still
  // "accepted" and allVoted true means it wasn't unanimous.
  const tally =
    allVoted && totalParticipants > 0
      ? (await getVoteTally(action.id, round)).map((t) => ({ name: nameFor(t.participantId), votes: t.votes }))
      : null;

  return (
    <VotingPanel
      actionId={action.id}
      participants={acceptedParticipants.map((p) => ({ id: p.id, name: nameFor(p.id) }))}
      hasVoted={hasVoted}
      voteCount={voteCount}
      totalParticipants={totalParticipants}
      tally={tally}
    />
  );
}

async function CustomResolution({
  action,
  viewerId,
  nameFor,
}: {
  action: ActionWithDetails;
  viewerId: string;
  nameFor: (id: string) => string;
}) {
  const resolution = getResolution(action);
  if (!resolution) return null;

  const participantCount = action.participants.filter((p) => p.status === "accepted").length;
  const viewerParticipantId = findParticipant(action, viewerId)?.id;
  const viewerIsCreditor = viewerParticipantId === resolution.winner.id;

  const obligations = await getObligationsForAction(action.id);
  const nudgeDeadlineByObligationId = new Map<string, string | null>(
    await Promise.all(
      obligations.map(async (o): Promise<[string, string | null]> => {
        if (o.paymentStatus !== "owed") return [o.id, null];
        const lastNudgeAt = await getLastNudgeAt(o.id);
        const deadline = lastNudgeAt
          ? new Date(new Date(lastNudgeAt).getTime() + MANUAL_NUDGE_COOLDOWN_HOURS * 3_600_000).toISOString()
          : null;
        return [o.id, deadline];
      }),
    ),
  );

  const entries: ObligationListEntry[] = obligations
    .filter((o): o is typeof o & { paymentStatus: Exclude<typeof o.paymentStatus, "not_applicable"> } => o.paymentStatus !== "not_applicable")
    .map((o) => ({
      obligationId: o.id,
      debtorName: nameFor(o.debtorParticipantId),
      amount: formatStake(o.amount),
      paymentStatus: o.paymentStatus,
      viewerIsDebtor: viewerParticipantId === o.debtorParticipantId,
      nudgeAvailableAt: nudgeDeadlineByObligationId.get(o.id) ?? null,
    }));

  return (
    <>
      <ResolutionReveal winnerName={participantDisplayName(resolution.winner)} participantCount={participantCount} />
      {entries.length > 0 && <ObligationList entries={entries} viewerIsCreditor={viewerIsCreditor} />}
    </>
  );
}
