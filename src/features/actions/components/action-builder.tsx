"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { formatGameTime } from "@/lib/utils/date";
import type { EventMarket, SportsEvent } from "@/lib/sports-data";
import type { MarketType } from "@/types/database.types";
import { createActionAndInvite } from "../mutations";
import { InviteForm } from "./invite-form";
import { MarketSelector } from "./market-selector";
import { StakeInput } from "./stake-input";

export function ActionBuilder({ event, markets }: { event: SportsEvent; markets: EventMarket[] }) {
  const [market, setMarket] = useState<MarketType>(markets[0]?.market ?? "moneyline");
  const [selectionKey, setSelectionKey] = useState<string | null>(null);
  const [stake, setStake] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleMarketChange(nextMarket: MarketType, nextSelectionKey: string) {
    if (nextMarket !== market) {
      setMarket(nextMarket);
      setSelectionKey(nextSelectionKey || null);
    } else if (nextSelectionKey) {
      setSelectionKey(nextSelectionKey);
    }
  }

  function handleInvite(phone: string) {
    if (!selectionKey) {
      setError("Pick a side first.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await createActionAndInvite({
        eventId: event.id,
        market,
        selectionKey,
        stakeAmount: stake ? Number(stake) : undefined,
        opponentPhone: phone,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/actions/${result.actionId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{event.league}</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {event.awayTeam.name} <span className="text-ink-faint">@</span> {event.homeTeam.name}
          </p>
          <p className="mt-0.5 text-sm text-ink-faint">{formatGameTime(event.startTime)}</p>
        </CardContent>
      </Card>

      <div>
        <p className="mb-3 text-sm font-medium text-ink">Market &amp; side</p>
        <MarketSelector markets={markets} market={market} selectionKey={selectionKey} onChange={handleMarketChange} />
      </div>

      <StakeInput value={stake} onChange={setStake} />

      <div className="border-t border-border-subtle pt-6">
        <p className="mb-3 text-sm font-medium text-ink">Invite</p>
        <InviteForm onSubmit={handleInvite} isPending={isPending} error={error} />
      </div>
    </div>
  );
}
