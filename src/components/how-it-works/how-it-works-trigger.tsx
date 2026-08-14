"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { HowItWorksGraphic } from "./how-it-works-graphic";

/**
 * The understated "How it works" link used on the login/phone-entry screen.
 * Deliberately text, not a button that competes with the primary auth CTA.
 * Opens the infographic in a modal over the login page — never navigates
 * away from authentication. Same graphic as /how-it-works (that route exists
 * as a fallback/shareable link, not a replacement for this).
 */
export function HowItWorksTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-faint underline underline-offset-2 transition-colors hover:text-ink-muted"
      >
        How it works
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="how-it-works-title" className="sm:max-w-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 id="how-it-works-title" className="text-sm font-medium text-ink">
            How Action works
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-bg-raised hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <HowItWorksGraphic priority />
        </div>
      </Dialog>
    </>
  );
}
