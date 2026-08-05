"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCashtag } from "../mutations";

export function CashtagForm({ initialCashtag }: { initialCashtag: string | null }) {
  const [value, setValue] = useState(initialCashtag ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCashtag(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="cashtag">Cash App $cashtag</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">$</span>
          <Input
            id="cashtag"
            className="pl-8"
            placeholder="yourcashtag"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/^\$/, ""))}
          />
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {saved && !error && <p className="mt-2 text-sm text-accent">Saved.</p>}
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          Used to build a &quot;Pay via Cash App&quot; link when you win an Action, and shown to you when you owe someone.
          Leave blank to opt out — ACTION never holds or moves this money itself.
        </p>
      </div>
      <Button type="submit" isLoading={isPending}>
        Save
      </Button>
    </form>
  );
}