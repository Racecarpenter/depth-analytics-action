"use client";

import { Label } from "@/components/ui/label";
import { STAKE_DISCLAIMER } from "@/lib/constants";

export function StakeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label htmlFor="stake">Stake (optional)</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">$</span>
        <input
          id="stake"
          type="text"
          inputMode="decimal"
          placeholder="20"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          className="h-12 w-full rounded-xl border border-border-strong bg-bg-raised pl-8 pr-4 text-base text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">{STAKE_DISCLAIMER}</p>
    </div>
  );
}
