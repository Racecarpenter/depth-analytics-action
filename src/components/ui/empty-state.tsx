import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {description && <p className="mt-1.5 max-w-xs text-sm text-ink-faint">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
