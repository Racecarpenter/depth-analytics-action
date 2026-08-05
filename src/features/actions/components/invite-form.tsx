"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InviteForm({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (phone: string) => void;
  isPending: boolean;
  error?: string;
}) {
  const [phone, setPhone] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (phone.trim()) onSubmit(phone.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="opponent-phone">Opponent phone number</Label>
        <Input
          id="opponent-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(415) 555-0123"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
      <Button type="submit" className="w-full tap-target" size="lg" isLoading={isPending} disabled={!phone.trim()}>
        Send invitation
      </Button>
    </form>
  );
}
