"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PaymentSettlementStatus } from "@/types/domain";
import { confirmPaymentReceived, disputePaymentReceipt, markActionPaid, sendNudge } from "../mutations";

export interface ObligationListEntry {
  obligationId: string;
  debtorName: string;
  amount: string;
  paymentStatus: Exclude<PaymentSettlementStatus, "not_applicable">;
  /** Is the current viewer the one who owes this specific obligation? */
  viewerIsDebtor: boolean;
  /** null = a nudge can be sent right now; otherwise the ISO timestamp it unlocks. */
  nudgeAvailableAt: string | null;
}

const STATUS_TEXT: Record<Exclude<PaymentSettlementStatus, "not_applicable">, string> = {
  owed: "owed",
  marked_paid: "Marked Paid",
  disputed: "Payment not confirmed",
  settled: "Settled ✓",
};

/**
 * The winner-take-all Pay Up list for a Custom Action — one compact row per
 * loser, e.g. "Race — Settled ✓ / Zane — $20 owed / Chris — Marked Paid."
 * Visible to every participant (part of what makes settling social), but
 * action buttons only render for whoever the button actually belongs to:
 * the debtor gets "Mark as Paid" on their own row, the creditor (the Action
 * winner, viewing every row) gets Nudge/Confirm/Dispute, everyone else just
 * sees the read-only status. This is the Custom Action counterpart to
 * PaymentSettlementCard, which stays the full single-obligation experience
 * for 2-participant sports Actions — both call the exact same mutations.
 */
export function ObligationList({
  entries,
  viewerIsCreditor,
}: {
  entries: ObligationListEntry[];
  viewerIsCreditor: boolean;
}) {
  return (
    <Card className="mb-5">
      <CardContent className="space-y-4 pt-5">
        <p className="text-sm font-medium text-ink">Pay up</p>
        {entries.map((entry) => (
          <ObligationRow key={entry.obligationId} entry={entry} viewerIsCreditor={viewerIsCreditor} />
        ))}
      </CardContent>
    </Card>
  );
}

function ObligationRow({ entry, viewerIsCreditor }: { entry: ObligationListEntry; viewerIsCreditor: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(mutation: () => Promise<{ ok: boolean; error?: string }>) {
    setError(undefined);
    startTransition(async () => {
      const result = await mutation();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const hoursUntilNudge =
    entry.nudgeAvailableAt && new Date(entry.nudgeAvailableAt) > new Date()
      ? Math.max(1, Math.ceil((new Date(entry.nudgeAvailableAt).getTime() - Date.now()) / 3_600_000))
      : null;

  return (
    <div className="border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{entry.debtorName}</p>
        <p className="mono-nums text-sm text-ink-muted">
          {entry.paymentStatus === "owed" ? `${entry.amount} owed` : STATUS_TEXT[entry.paymentStatus]}
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {entry.viewerIsDebtor && entry.paymentStatus === "owed" && (
        <Button size="sm" className="mt-2 tap-target" isLoading={isPending} disabled={isPending} onClick={() => run(() => markActionPaid(entry.obligationId))}>
          Mark as Paid
        </Button>
      )}

      {viewerIsCreditor && entry.paymentStatus === "owed" && (
        <div className="mt-2">
          {hoursUntilNudge !== null ? (
            <p className="text-xs text-ink-faint">Next nudge available in {hoursUntilNudge}h</p>
          ) : (
            <Button variant="secondary" size="sm" isLoading={isPending} disabled={isPending} onClick={() => run(() => sendNudge(entry.obligationId))}>
              Nudge {entry.debtorName}
            </Button>
          )}
        </div>
      )}

      {viewerIsCreditor && (entry.paymentStatus === "marked_paid" || entry.paymentStatus === "disputed") && (
        <div className="mt-2 flex gap-2">
          {entry.paymentStatus === "marked_paid" && (
            <Button variant="danger" size="sm" isLoading={isPending} disabled={isPending} onClick={() => run(() => disputePaymentReceipt(entry.obligationId))}>
              Didn&apos;t Receive It
            </Button>
          )}
          <Button size="sm" isLoading={isPending} disabled={isPending} onClick={() => run(() => confirmPaymentReceived(entry.obligationId))}>
            Confirm Received
          </Button>
        </div>
      )}
    </div>
  );
}
