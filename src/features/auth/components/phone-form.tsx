"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PhoneForm({
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
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="(415) 555-0123"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
      <Button type="submit" className="w-full tap-target" size="lg" isLoading={isPending}>
        Send code
      </Button>
    </form>
  );
}
