"use client";

import { MARKET_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { formatAmericanOdds } from "@/lib/utils/odds";
import type { EventMarket, MarketSelection } from "@/lib/sports-data";
import type { MarketType } from "@/types/database.types";

export function MarketSelector({
  markets,
  market,
  selectionKey,
  onChange,
}: {
  markets: EventMarket[];
  market: MarketType;
  selectionKey: string | null;
  onChange: (market: MarketType, selectionKey: string) => void;
}) {
  const active = markets.find((m) => m.market === market);

  return (
    <div>
      <div className="flex gap-1 rounded-xl bg-bg-raised p-1">
        {markets.map((m) => (
          <button
            key={m.market}
            type="button"
            onClick={() => onChange(m.market, "")}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
              m.market === market ? "bg-bg-card text-ink shadow-subtle" : "text-ink-faint hover:text-ink-muted",
            )}
          >
            {MARKET_LABELS[m.market]}
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {active.selections.map((selection: MarketSelection) => (
            <button
              key={selection.key}
              type="button"
              onClick={() => onChange(market, selection.key)}
              className={cn(
                "rounded-xl border px-4 py-4 text-left transition-colors",
                selectionKey === selection.key
                  ? "border-accent/50 bg-accent-wash"
                  : "border-border-strong bg-bg-raised hover:border-ink-faint",
              )}
            >
              <p className="text-sm font-medium text-ink">{selection.label}</p>
              {selection.odds !== null && (
                <p className="mono-nums mt-1 text-xs text-ink-faint">{formatAmericanOdds(selection.odds)}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
