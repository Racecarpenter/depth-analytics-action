import { STATUS_LABEL } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils/date";
import type { ActionStatus, ChangedByActor } from "@/types/domain";

interface HistoryEntry {
  id: string;
  to_status: ActionStatus;
  changed_by: ChangedByActor;
  created_at: string;
}

const ACTOR_LABEL: Record<ChangedByActor, string> = {
  system: "Automatically",
  creator: "By the creator",
  opponent: "By the opponent",
};

export function ActionStatusHistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <ol className="space-y-0">
      {entries.map((entry, i) => (
        <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < entries.length - 1 && (
            <span className="absolute left-[5px] top-3 h-full w-px bg-border-subtle" />
          )}
          <span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-accent bg-bg" />
          <div>
            <p className="text-sm font-medium text-ink">{STATUS_LABEL[entry.to_status]}</p>
            <p className="text-xs text-ink-faint">
              {ACTOR_LABEL[entry.changed_by]} · {formatRelativeTime(entry.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
