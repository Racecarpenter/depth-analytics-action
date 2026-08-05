"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestOtp, verifyOtp } from "@/features/auth/mutations";
import { PhoneForm } from "./phone-form";
import { OtpForm } from "./otp-form";

/**
 * Owns the two-step phone -> code flow and hands off to Server Actions for
 * everything that touches Supabase or the SMS provider. Used on /login and,
 * unauthenticated, on the invite-accept page.
 */
export function AuthFlow({ redirectTo = "/" }: { redirectTo?: string }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handlePhoneSubmit(rawPhone: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await requestOtp(rawPhone);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPhone(result.phone ?? rawPhone);
      setStep("otp");
    });
  }

  function handleOtpSubmit(code: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await verifyOtp(phone, code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    });
  }

  function handleResend() {
    setError(undefined);
    startTransition(async () => {
      await requestOtp(phone);
    });
  }

  if (step === "phone") {
    return <PhoneForm onSubmit={handlePhoneSubmit} isPending={isPending} error={error} />;
  }

  return (
    <OtpForm
      phone={phone}
      onSubmit={handleOtpSubmit}
      onResend={handleResend}
      isPending={isPending}
      error={error}
    />
  );
}
