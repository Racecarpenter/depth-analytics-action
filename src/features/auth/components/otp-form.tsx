"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneForDisplay } from "@/lib/utils/phone";

export function OtpForm({
  phone,
  onSubmit,
  onResend,
  isPending,
  error,
}: {
  phone: string;
  onSubmit: (code: string) => void;
  onResend: () => void;
  isPending: boolean;
  error?: string;
}) {
  const [code, setCode] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length === 6) onSubmit(code.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="code">Verification code</Label>
        <p className="mb-3 text-sm text-ink-muted">
          Sent to {formatPhoneForDisplay(phone)}. In development, check the server console.
        </p>
        <Input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="123456"
          className="mono-nums text-center text-xl tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
      <Button type="submit" className="w-full tap-target" size="lg" isLoading={isPending} disabled={code.length !== 6}>
        Verify &amp; continue
      </Button>
      <button
        type="button"
        onClick={onResend}
        className="w-full text-center text-sm text-ink-faint transition-colors hover:text-ink-muted"
      >
        Resend code
      </button>
    </form>
  );
}
