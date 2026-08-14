"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonPicker } from "@/features/users/components/person-picker";
import { getAvatarUrl } from "@/features/users/lib/identity";
import type { PersonSummary } from "@/features/users/queries";
import { CUSTOM_ACTION_MAX_PARTICIPANTS, CUSTOM_ACTION_TITLE_MAX_LENGTH, STAKE_DISCLAIMER } from "@/lib/constants";
import { formatStake } from "@/lib/utils/currency";
import { createCustomActionAndInvite } from "../mutations";

const MAX_OPPONENTS = CUSTOM_ACTION_MAX_PARTICIPANTS - 1;

export function CustomActionBuilder() {
  const [title, setTitle] = useState("");
  const [stake, setStake] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<PersonSummary[]>([]);
  const [hasPickerHistory, setHasPickerHistory] = useState(false);
  const [phones, setPhones] = useState<string[]>([""]);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filledPhones = phones.map((p) => p.trim()).filter(Boolean);
  const opponentCount = selectedPeople.length + filledPhones.length;
  const participantCount = 1 + opponentCount;
  const remainingSlots = MAX_OPPONENTS - opponentCount;
  const stakeNumber = Number(stake);
  const hasValidStake = stake.trim() !== "" && Number.isFinite(stakeNumber) && stakeNumber > 0;

  function addPerson(person: PersonSummary) {
    if (opponentCount >= MAX_OPPONENTS) return;
    setSelectedPeople((prev) => (prev.some((p) => p.userId === person.userId) ? prev : [...prev, person]));
  }

  function removePerson(userId: string) {
    setSelectedPeople((prev) => prev.filter((p) => p.userId !== userId));
  }

  function updatePhone(index: number, value: string) {
    setPhones((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function addPhone() {
    if (opponentCount >= MAX_OPPONENTS) return;
    setPhones((prev) => [...prev, ""]);
  }

  function removePhone(index: number) {
    setPhones((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function handleSubmit() {
    setError(undefined);
    if (!title.trim()) {
      setError("Add a title.");
      return;
    }
    if (!hasValidStake) {
      setError("Enter a stake amount.");
      return;
    }
    if (opponentCount === 0) {
      setError("Add at least one opponent.");
      return;
    }

    startTransition(async () => {
      const result = await createCustomActionAndInvite({
        title: title.trim(),
        stakeAmount: stakeNumber,
        opponentPhones: filledPhones,
        opponentUserIds: selectedPeople.map((p) => p.userId),
      });
      if (!result.ok) {
        if (result.paywallRequired) {
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
      <div>
        <Label htmlFor="custom-title">Challenge</Label>
        <Input
          id="custom-title"
          placeholder="Lowest score at Papago wins"
          maxLength={CUSTOM_ACTION_TITLE_MAX_LENGTH}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="custom-stake">Stake (each)</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">$</span>
          <input
            id="custom-stake"
            type="text"
            inputMode="decimal"
            placeholder="20"
            value={stake}
            onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
            className="h-12 w-full rounded-xl border border-border-strong bg-bg-raised pl-8 pr-4 text-base text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">{STAKE_DISCLAIMER}</p>
      </div>

      <div>
        <Label>Participants</Label>

        {selectedPeople.length > 0 && (
          <div className="mb-3 space-y-2">
            {selectedPeople.map((person) => (
              <div
                key={person.userId}
                className="flex items-center justify-between rounded-xl border border-border-strong bg-bg-raised px-3 py-2"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar url={getAvatarUrl(person.avatarPath)} label={person.displayName ?? "?"} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-ink">{person.displayName ?? "Unnamed"}</p>
                    {person.username && <p className="text-xs text-ink-faint">@{person.username}</p>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePerson(person.userId)}
                  aria-label={`Remove ${person.displayName ?? "person"}`}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}

        {opponentCount < MAX_OPPONENTS && (
          <div className="mb-4">
            <PersonPicker
              onSelect={addPerson}
              excludeUserIds={selectedPeople.map((p) => p.userId)}
              onHasHistoryChange={setHasPickerHistory}
            />
          </div>
        )}

        {hasPickerHistory && (
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border-subtle" />
            <p className="text-xs text-ink-faint">OR</p>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>
        )}

        <div className="space-y-3">
          {phones.map((phone, i) => (
            <div key={i} className="flex gap-2">
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(415) 555-0123"
                value={phone}
                onChange={(e) => updatePhone(i, e.target.value)}
              />
              {phones.length > 1 && (
                <Button type="button" variant="ghost" size="md" onClick={() => removePhone(i)} aria-label="Remove">
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>
        {opponentCount < MAX_OPPONENTS && (
          <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={addPhone}>
            + Add another
          </Button>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          {remainingSlots > 0 ? `Up to ${remainingSlots} more` : "Max reached"} ({CUSTOM_ACTION_MAX_PARTICIPANTS} total players).
        </p>
      </div>

      {hasValidStake && opponentCount > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-ink-faint">{participantCount} participants × {formatStake(stakeNumber)}</p>
            <p className="mt-0.5 text-lg font-semibold text-ink">
              Total Action: {formatStake(stakeNumber * participantCount)}
            </p>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button className="w-full tap-target" size="lg" isLoading={isPending} onClick={handleSubmit}>
        Send Action
      </Button>
    </div>
  );
}
