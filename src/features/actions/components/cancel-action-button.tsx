"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelAction } from "../mutations";

export function CancelActionButton({ actionId }: { actionId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    setError(undefined);
    startTransition(async () => {
      const result = await cancelAction(actionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Button variant="danger" size="sm" isLoading={isPending} onClick={handleCancel}>
        Cancel invite
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
