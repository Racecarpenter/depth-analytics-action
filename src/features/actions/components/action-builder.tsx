"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PersonPicker } from "@/features/users/components/person-picker";
import { getAvatarUrl } from "@/features/users/lib/identity";
import type { PersonSummary } from "@/features/users/queries";
import { formatGameTime } from "@/lib/utils/date";
import type { SportsEvent } from "@/lib/sports-data";
import { createActionAndInvite } from "../mutations";
import { InviteForm } from "./invite-form";
import { StakeInput } from "./stake-input";
import { TeamPicker } from "./team-picker";

export function ActionBuilder({ event }: { event: SportsEvent }) {
  const [selectionKey, setSelectionKey] = useState<string | null>(null);
  const [stake, setStake] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<PersonSummary | null>(null);
  const [hasPickerHistory, setHasPickerHistory] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(opponent: { opponentPhone: string } | { opponentUserId: string }) {
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
        ...opponent,
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

        {selectedPerson ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border-strong bg-bg-raised px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar url={getAvatarUrl(selectedPerson.avatarPath)} label={selectedPerson.displayName ?? "?"} size="md" />
                <div>
                  <p className="text-sm font-medium text-ink">{selectedPerson.displayName ?? "Unnamed"}</p>
                  {selectedPerson.username && <p className="text-xs text-ink-faint">@{selectedPerson.username}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPerson(null)}
                className="text-xs text-ink-faint underline underline-offset-2 hover:text-ink-muted"
              >
                Change
              </button>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button
              className="w-full tap-target"
              size="lg"
              isLoading={isPending}
              disabled={isPending}
              onClick={() => submit({ opponentUserId: selectedPerson.userId })}
            >
              Send invitation
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <PersonPicker onSelect={setSelectedPerson} onHasHistoryChange={setHasPickerHistory} />

            {hasPickerHistory && (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border-subtle" />
                <p className="text-xs text-ink-faint">OR</p>
                <div className="h-px flex-1 bg-border-subtle" />
              </div>
            )}

            <InviteForm onSubmit={(phone) => submit({ opponentPhone: phone })} isPending={isPending} error={error} />
          </div>
        )}
      </div>
    </div>
  );
}
