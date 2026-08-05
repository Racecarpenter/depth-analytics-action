export function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</h2>
      {typeof count === "number" && count > 0 && (
        <span className="mono-nums text-xs text-ink-faint">{count}</span>
      )}
    </div>
  );
}
