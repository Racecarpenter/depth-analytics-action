"use client";

import { cn } from "@/lib/utils/cn";
import type { SportsEvent } from "@/lib/sports-data";

/**
 * The entire "market" a Sports Action has: pick the team you think wins.
 * Replaces the old MarketSelector (moneyline/spread/total) — see README
 * ("Sports Action simplification"). Always exactly two buttons, away team
 * first to match the "away @ home" convention used everywhere else in the
 * app.
 */
export function TeamPicker({
  event,
  selectionKey,
  onChange,
}: {
  event: SportsEvent;
  selectionKey: string | null;
  onChange: (selectionKey: string) => void;
}) {
  const teams = [event.awayTeam, event.homeTeam];

  return (
    <div className="grid grid-cols-2 gap-3">
      {teams.map((team) => (
        <button
          key={team.abbreviation}
          type="button"
          onClick={() => onChange(team.abbreviation)}
          className={cn(
            "rounded-xl border px-4 py-4 text-center transition-colors",
            selectionKey === team.abbreviation
              ? "border-accent/50 bg-accent-wash"
              : "border-border-strong bg-bg-raised hover:border-ink-faint",
          )}
        >
          <p className="text-sm font-medium text-ink">{team.name}</p>
        </button>
      ))}
    </div>
  );
}
