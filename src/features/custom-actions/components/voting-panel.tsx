"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { compressImage } from "@/lib/utils/compress-image";
import { requestRevote, submitCustomActionVote } from "../mutations";
import { uploadCustomActionProof } from "../proof-mutations";

export interface VotingPanelParticipant {
  id: string;
  name: string;
}

export interface VoteTallyDisplayEntry {
  name: string;
  votes: number;
}

export interface VotingPanelProps {
  actionId: string;
  participants: VotingPanelParticipant[];
  hasVoted: boolean;
  voteCount: number;
  totalParticipants: number;
  /** Present only once everyone has voted and it wasn't unanimous. */
  tally: VoteTallyDisplayEntry[] | null;
}

/**
 * Independent "Who won?" submission. Deliberately never fetches or displays
 * anyone else's individual pick — the parent page only passes aggregate
 * counts (voteCount/tally), which the server itself only reveals once
 * everyone has voted (see getVoteTally's usage in the Action detail page
 * and submitCustomActionVote's return shape). Self-votes are valid and get
 * no special treatment in the participant list.
 */
export function VotingPanel({ actionId, participants, hasVoted, voteCount, totalParticipants, tally }: VotingPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleSubmit() {
    if (!selectedId) {
      setError("Pick who won.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      let proofPath: string | null = null;
      if (file) {
        const compressed = await compressImage(file);
        const formData = new FormData();
        formData.append("file", compressed);
        const uploadResult = await uploadCustomActionProof(actionId, formData);
        if (!uploadResult.ok) {
          setError(uploadResult.error ?? "Couldn't upload that photo.");
          return;
        }
        proofPath = uploadResult.path ?? null;
      }

      const result = await submitCustomActionVote(actionId, selectedId, proofPath);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRevote() {
    setError(undefined);
    startTransition(async () => {
      const result = await requestRevote(actionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (tally) {
    const sorted = [...tally].sort((a, b) => b.votes - a.votes);
    return (
      <Card className="mb-5">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-ink">You don&apos;t all agree.</p>
          <div className="mt-3 space-y-1.5">
            {sorted.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between text-sm">
                <p className="text-ink-muted">{entry.name}</p>
                <p className="mono-nums text-ink-faint">{entry.votes} vote{entry.votes === 1 ? "" : "s"}</p>
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <Button variant="secondary" className="mt-4 w-full tap-target" isLoading={isPending} disabled={isPending} onClick={handleRevote}>
            Revote
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (hasVoted) {
    return (
      <Card className="mb-5">
        <CardContent className="pt-5">
          <p className="text-sm text-ink-muted">
            Result submitted — waiting on {totalParticipants - voteCount} more.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-5">
      <CardContent className="pt-5">
        <p className="text-sm font-medium text-ink">Who won?</p>
        <p className="mt-1 text-xs text-ink-faint">
          Your pick stays private until everyone submits theirs.
        </p>
        <div className="mt-4 space-y-2">
          {participants.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-border-strong bg-bg-raised px-4 py-3 text-sm text-ink"
            >
              <input
                type="radio"
                name="winner"
                value={p.id}
                checked={selectedId === p.id}
                onChange={() => setSelectedId(p.id)}
                className="h-4 w-4 accent-accent"
              />
              {p.name}
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-xs text-ink-faint">Proof photo (optional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-xs text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-bg-raised file:px-3 file:py-2 file:text-xs file:font-medium file:text-ink"
          />
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <Button className="mt-4 w-full tap-target" isLoading={isPending} disabled={isPending} onClick={handleSubmit}>
          Submit result
        </Button>
      </CardContent>
    </Card>
  );
}
