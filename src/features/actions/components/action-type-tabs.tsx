import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * The one selection point between Sports Actions (result from a sports
 * data provider) and Custom Actions (result from unanimous participant
 * vote) — deliberately just two links, not a wizard step. Sports lives at
 * /actions/new (search-first), Custom at /actions/new/custom (title/stake/
 * invitees-first, no game search).
 */
export function ActionTypeTabs({ active }: { active: "sports" | "custom" }) {
  return (
    <div className="mb-6 flex gap-2 rounded-xl border border-border-subtle bg-bg-raised p-1">
      <Link
        href="/actions/new"
        className={cn(
          "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-colors",
          active === "sports" ? "bg-accent text-black" : "text-ink-muted hover:text-ink",
        )}
      >
        Sports Action
      </Link>
      <Link
        href="/actions/new/custom"
        className={cn(
          "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-colors",
          active === "custom" ? "bg-accent text-black" : "text-ink-muted hover:text-ink",
        )}
      >
        Custom Action
      </Link>
    </div>
  );
}
