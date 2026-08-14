"use client";

import { useEffect, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { getAvatarUrl } from "../lib/identity";
import type { PersonSummary } from "../queries";
import { searchPreviousOpponents } from "../search";

/**
 * "People you've had Action with" — search + a small recent/frequent list,
 * shown above the phone-number path on both the Sports Action and Custom
 * Action builders (see README, "User profiles"). Doesn't manage selection
 * itself — `onSelect` fires per row, and the caller decides what happens
 * (single opponent vs. adding to a multi-person list via `excludeUserIds`
 * to hide people already picked).
 *
 * Renders nothing at all (not even the search box) when the signed-in user
 * has no Action history yet — an empty "search your people" box with
 * nobody in it isn't worth the screen space; the phone-number path is the
 * only option for a brand-new account, exactly as before this feature.
 */
export function PersonPicker({
  onSelect,
  excludeUserIds = [],
  label = "People you've had Action with",
  onHasHistoryChange,
}: {
  onSelect: (person: PersonSummary) => void;
  excludeUserIds?: string[];
  label?: string;
  /** Fires once, after the initial (unfiltered) load resolves — lets a parent hide a now-pointless "OR" divider when there's nothing to reuse. */
  onHasHistoryChange?: (hasHistory: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSummary[]>([]);
  const [hasAnyHistory, setHasAnyHistory] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const delay = query ? 250 : 0;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const people = await searchPreviousOpponents(query);
        setResults(people);
        if (!query) {
          setHasAnyHistory(people.length > 0);
          onHasHistoryChange?.(people.length > 0);
        }
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (hasAnyHistory === false) return null;

  const visible = results.filter((p) => !excludeUserIds.includes(p.userId));

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <Input
        placeholder="Search by name or username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2 space-y-1.5">
        {isPending && hasAnyHistory === null && <p className="px-1 py-2 text-xs text-ink-faint">Loading…</p>}
        {!isPending && query && visible.length === 0 && (
          <p className="px-1 py-2 text-xs text-ink-faint">No matches.</p>
        )}
        {visible.map((person) => (
          <button
            key={person.userId}
            type="button"
            onClick={() => onSelect(person)}
            className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-bg-raised px-3 py-2.5 text-left transition-colors hover:border-ink-faint"
          >
            <Avatar url={getAvatarUrl(person.avatarPath)} label={person.displayName ?? "?"} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{person.displayName ?? "Unnamed"}</p>
              {person.username && <p className="truncate text-xs text-ink-faint">@{person.username}</p>}
            </div>
            <p className="shrink-0 text-xs text-ink-faint">
              {person.actionsTogether} Action{person.actionsTogether === 1 ? "" : "s"} together
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
