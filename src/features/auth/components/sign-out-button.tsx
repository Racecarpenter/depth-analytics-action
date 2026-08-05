"use client";

import { useTransition } from "react";
import { signOut } from "@/features/auth/mutations";
import { cn } from "@/lib/utils/cn";

export function SignOutButton({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => signOut())}
      disabled={isPending}
      className={cn(
        "text-sm text-ink-faint transition-colors hover:text-ink-muted disabled:opacity-50",
        className,
      )}
    >
      Sign out
    </button>
  );
}
