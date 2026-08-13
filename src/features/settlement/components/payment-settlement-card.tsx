"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DISPUTED_COPY } from "@/lib/settlement/copy";
import type { PaymentSettlementStatus } from "@/types/database.types";
import { confirmPaymentReceived, disputePaymentReceipt, markActionPaid, sendNudge } from "../mutations";

export interface PaymentSettlementCardProps {
  actionId: string;
  paymentStatus: Exclude<PaymentSettlementStatus, "not_applicable">;
  viewerRole: "winner" | "loser";
  amount: string;
  winnerName: string;
  loserName: string;
  /** null = a nudge can be sent right now; otherwise the ISO timestamp it unlocks. */
  nudgeAvailableAt: string | null;
}

type Action = "mark_paid" | "confirm" | "dispute" | "nudge";

/**
 * The one card on the Action detail page that shows payment state — kept
 * separate from the sports-result StatusPill above it on purpose (won/lost
 * is a different fact from paid/unpaid). Renders one of four views based on
 * paymentStatus; the parent page doesn't render this at all when
 * payment_status is "not_applicable" (pushes/cancels never owe anything).
 */
export function PaymentSettlementCard({
  actionId,
  paymentStatus,
  viewerRole,
  amount,
  winnerName,
  loserName,
  nudgeAvailableAt,
}: PaymentSettlementCardProps) {
  const [error, setError] = useState<string | undefined>();
  const [needAMinute, setNeedAMinute] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: Action, mutation: () => Promise<{ ok: boolean; error?: string }>) {
    setError(undefined);
    setPendingAction(action);
    startTransition(async () => {
      const result = await mutation();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (paymentStatus === "owed") {
    const hoursUntilNudge =
      nudgeAvailableAt && new Date(nudgeAvailableAt) > new Date()
        ? Math.max(1, Math.ceil((new Date(nudgeAvailableAt).getTime() - Date.now()) / 3_600_000))
        : null;

    if (viewerRole === "loser") {
      return (
        <Card className="mb-5">
          <CardContent className="pt-5">
            <p className="text-lg font-semibold text-ink">Well, shit.</p>
            <p className="mt-1 text-sm text-ink-muted">
              You owe {winnerName} {amount}.
            </p>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            {needAMinute ? (
              <p className="mt-4 text-sm text-ink-faint">Ok, no rush.</p>
            ) : (
              <div className="mt-4 flex gap-3">
                <Button
                  variant="ghost"
                  className="tap-target"
                  disabled={isPending}
                  onClick={() => setNeedAMinute(true)}
                >
                  I need a minute
                </Button>
                <Button
                  className="flex-1 tap-target"
                  isLoading={isPending && pendingAction === "mark_paid"}
                  disabled={isPending}
                  onClick={() => run("mark_paid", () => markActionPaid(actionId))}
                >
                  Mark as Paid
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="mb-5">
        <CardContent className="pt-5">
          <p className="text-lg font-semibold text-ink">You got him.</p>
          <p className="mt-1 text-sm text-ink-muted">
            {loserName} owes you {amount}.
          </p>
          <p className="mono-nums mt-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            {amount} owed
          </p>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-4">
            {hoursUntilNudge !== null ? (
              <p className="text-sm text-ink-faint">Next nudge available in {hoursUntilNudge}h</p>
            ) : (
              <Button
                variant="secondary"
                className="w-full tap-target"
                isLoading={isPending && pendingAction === "nudge"}
                disabled={isPending}
                onClick={() => run("nudge", () => sendNudge(actionId))}
              >
                Nudge {loserName}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (paymentStatus === "marked_paid") {
    if (viewerRole === "winner") {
      return (
        <Card className="mb-5">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-ink">
              {loserName} says they paid you {amount}.
            </p>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex gap-3">
              <Button
                variant="danger"
                className="flex-1 tap-target"
                isLoading={isPending && pendingAction === "dispute"}
                disabled={isPending}
                onClick={() => run("dispute", () => disputePaymentReceipt(actionId))}
              >
                Didn&apos;t Receive It
              </Button>
              <Button
                className="flex-1 tap-target"
                isLoading={isPending && pendingAction === "confirm"}
                disabled={isPending}
                onClick={() => run("confirm", () => confirmPaymentReceived(actionId))}
              >
                Confirm Received
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="mb-5">
        <CardContent className="pt-5">
          <p className="text-sm text-ink-muted">Marked paid — waiting on {winnerName} to confirm.</p>
        </CardContent>
      </Card>
    );
  }

  if (paymentStatus === "disputed") {
    return (
      <Card className="mb-5">
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-ink">{DISPUTED_COPY.neutralStatusLabel}</p>
          <p className="mt-1 text-sm text-ink-muted">{DISPUTED_COPY.loserNotified().body}</p>
          {viewerRole === "winner" && (
            <>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <Button
                className="mt-4 w-full tap-target"
                isLoading={isPending && pendingAction === "confirm"}
                disabled={isPending}
                onClick={() => run("confirm", () => confirmPaymentReceived(actionId))}
              >
                Confirm Received
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // settled
  return (
    <Card className="mb-5">
      <CardContent className="pt-5">
        <p className="text-sm font-medium text-accent">Settled ✓</p>
      </CardContent>
    </Card>
  );
}
