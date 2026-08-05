"use client";

import { useRef, useState, useTransition } from "react";
import { useOnClickOutside } from "@/lib/utils/use-on-click-outside";
import { formatRelativeTime } from "@/lib/utils/date";
import { markAllNotificationsRead } from "../mutations";
import type { Tables } from "@/types/database.types";

export function NotificationBell({ notifications }: { notifications: Tables<"notifications">[] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  function handleOpen() {
    setOpen((prev) => !prev);
    if (unreadCount > 0) {
      startTransition(async () => {
        await markAllNotificationsRead();
      });
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-bg-raised hover:text-ink"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 max-h-96 w-80 overflow-y-auto rounded-2xl border border-border bg-bg-overlay p-2 shadow-glow animate-fade-in">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-faint">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="rounded-xl px-3 py-2.5 hover:bg-bg-raised">
                <p className="text-sm font-medium text-ink">{n.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{n.body}</p>
                <p className="mt-1 text-[11px] text-ink-faint">{formatRelativeTime(n.created_at)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}