"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { formatGameTime } from "@/lib/utils/date";
import type { SportsEvent } from "@/lib/sports-data";
import { createActionAndInvite } from "../mutations";
import { InviteForm } from "./invite-form";
import { StakeInput } from "./stake-input";
import { TeamPicker } from "./team-picker";

export function ActionBuilder({ event }: { event: SportsEvent }) {
  const [selectionKey, setSelectionKey] = useState<string | null>(null);
  const [stake, setStake] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleInvite(phone: string) {
    if (!selectionKey) {
      setError("Pick a team first.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await createActionAndInvite({
        eventId: event.id,
        selectionKey,
        stakeAmount: stake ? Number(stake) : undefined,
        opponentPhone: phone,
      });
      if (!result.ok) {
        if (result.paywallRequired) {
          // The server-rendered parent page re-checks entitlement on every
          // request and renders <Paywall> instead of this component once
          // canCreateAction is false — refreshing is enough to swap to it.
          router.refresh();
          return;
        }
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
        <p className="mb-3 text-sm font-medium text-ink">Who you got?</p>
        <TeamPicker event={event} selectionKey={selectionKey} onChange={setSelectionKey} />
      </div>

      <StakeInput value={stake} onChange={setStake} />

      <div className="border-t border-border-subtle pt-6">
        <p className="mb-3 text-sm font-medium text-ink">Invite</p>
        <InviteForm onSubmit={handleInvite} isPending={isPending} error={error} />
      </div>
    </div>
  );
}
