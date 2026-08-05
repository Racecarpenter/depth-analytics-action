"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlockSiteGate } from "../mutations";

export function SiteGateForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await unlockSiteGate(password);
      if (!result.ok) {
        setError(result.error ?? "Wrong password.");
        return;
      }
      // No redirect needed — the gate is rendered inline by the root
      // layout, so refreshing re-evaluates it server-side with the new
      // cookie and just shows the page that was already requested.
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        autoComplete="off"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full tap-target" isLoading={isPending}>
        Enter
      </Button>
    </form>
  );
}