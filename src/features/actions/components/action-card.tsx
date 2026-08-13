import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MARKET_LABELS } from "@/lib/constants";
import { formatStake } from "@/lib/utils/currency";
import { formatGameTime } from "@/lib/utils/date";
import { maskPhone } from "@/lib/utils/phone";
import { findParticipant, opponentOf, personalStatus, type ActionWithDetails } from "../types";
import { StatusPill } from "./status-pill";

export function ActionCard({ action, currentUserId }: { action: ActionWithDetails; currentUserId: string }) {
  const viewer = findParticipant(action, currentUserId);
  const status = personalStatus(action.status, viewer?.role ?? null);

  return (
    <Link href={`/actions/${action.id}`} className="block">
      <Card className="p-5 transition-colors hover:border-border-strong">
        {action.action_type === "sports" && action.game ? (
          <SportsCardBody action={action} status={status} currentUserId={currentUserId} />
        ) : (
          <CustomCardBody action={action} status={status} />
        )}
      </Card>
    </Link>
  );
}

function SportsCardBody({
  action,
  status,
  currentUserId,
}: {
  action: ActionWithDetails;
  status: ReturnType<typeof personalStatus>;
  currentUserId: string;
}) {
  if (!action.game || !action.market) return null;
  const viewer = findParticipant(action, currentUserId);
  const opponent = opponentOf(action, currentUserId);
  const opponentLabel =
    opponent?.status === "invited" ? "Invite sent" : opponent ? maskPhone(opponent.phone) : "—";
  const matchup = `${action.game.away_team.abbreviation} @ ${action.game.home_team.abbreviation}`;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{opponentLabel}</p>
          <p className="mt-1 text-base font-semibold text-ink">{matchup}</p>
          <p className="mt-0.5 text-xs text-ink-faint">{formatGameTime(action.game.start_time)}</p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
        <div>
          <p className="text-xs text-ink-faint">{MARKET_LABELS[action.market]}</p>
          <p className="mono-nums text-sm font-medium text-ink">{viewer?.side_label ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-faint">Stake</p>
          <p className="mono-nums text-sm font-medium text-ink">{formatStake(action.stake_amount)}</p>
        </div>
      </div>
    </>
  );
}

function CustomCardBody({ action, status }: { action: ActionWithDetails; status: ReturnType<typeof personalStatus> }) {
  const participantCount = action.participants.length;
  const stake = action.stake_amount ?? 0;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Custom Action</p>
          <p className="mt-1 text-base font-semibold text-ink">{action.title}</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {participantCount} player{participantCount === 1 ? "" : "s"}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
        <div>
          <p className="text-xs text-ink-faint">Stake (each)</p>
          <p className="mono-nums text-sm font-medium text-ink">{formatStake(stake)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-faint">Total Action</p>
          <p className="mono-nums text-sm font-medium text-ink">{formatStake(stake * participantCount)}</p>
        </div>
      </div>
    </>
  );
}
