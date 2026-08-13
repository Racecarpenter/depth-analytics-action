import { STATUS_LABEL, STATUS_TONE } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import type { ActionStatus } from "@/types/domain";

export function StatusPill({ status, className }: { status: ActionStatus; className?: string }) {
  const isLive = status === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        STATUS_TONE[status],
        className,
      )}
    >
      {isLive && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
