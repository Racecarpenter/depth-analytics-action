"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { respondToInvite } from "../mutations";

export function InviteResponse({ token }: { token: string }) {
  const [error, setError] = useState<string | undefined>();
  const [pendingDecision, setPendingDecision] = useState<"accept" | "decline" | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function respond(decision: "accept" | "decline") {
    setError(undefined);
    setPendingDecision(decision);
    startTransition(async () => {
      const result = await respondToInvite(token, decision);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(decision === "accept" ? `/actions/${result.actionId}` : "/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="flex-1 tap-target"
          size="lg"
          isLoading={isPending && pendingDecision === "decline"}
          disabled={isPending}
          onClick={() => respond("decline")}
        >
          Decline
        </Button>
        <Button
          className="flex-1 tap-target"
          size="lg"
          isLoading={isPending && pendingDecision === "accept"}
          disabled={isPending}
          onClick={() => respond("accept")}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}
