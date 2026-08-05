import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatGameTime } from "@/lib/utils/date";
import type { SportsEvent } from "@/lib/sports-data";

export function GameResultRow({ event }: { event: SportsEvent }) {
  const disabled = event.status !== "scheduled";

  const content = (
    <div className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-4 py-3.5 transition-colors">
      <div className="flex items-center gap-3">
        <Badge className="shrink-0">{event.league}</Badge>
        <div>
          <p className="text-sm font-medium text-ink">
            {event.awayTeam.name} <span className="text-ink-faint">@</span> {event.homeTeam.name}
          </p>
          <p className="text-xs text-ink-faint">
            {disabled ? "Already underway" : formatGameTime(event.startTime)}
          </p>
        </div>
      </div>
    </div>
  );

  if (disabled) {
    return <div className="cursor-not-allowed opacity-50">{content}</div>;
  }

  return (
    <Link href={`/actions/new/${event.id}`} className="block hover:opacity-90">
      {content}
    </Link>
  );
}
