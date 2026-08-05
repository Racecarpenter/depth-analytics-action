import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export function AppHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-ink transition-colors group-hover:text-accent">
            {APP_NAME}
          </span>
          <span className="text-xs text-ink-faint">{APP_TAGLINE}</span>
        </Link>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
