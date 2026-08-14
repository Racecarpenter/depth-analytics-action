"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useOnClickOutside } from "@/lib/utils/use-on-click-outside";
import { formatRelativeTime } from "@/lib/utils/date";
import { markAllNotificationsRead, markNotificationRead } from "../mutations";
import type { Tables } from "@/types/domain";

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
            notifications.map((n) => <NotificationRow key={n.id} notification={n} onNavigate={() => setOpen(false)} />)
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Every Action-scoped notification type is created via createNotification()
 * (features/notifications/lib/notify.ts) with an actionId — so any
 * notification with a non-null action_id always means "go look at that
 * Action," regardless of its specific type. Deriving the destination
 * generically off action_id (rather than a per-type switch statement) means
 * every current and future Action-related notification type routes
 * correctly without this file needing to know about it.
 *
 * `profile_completion` is the one deliberate exception — it has no
 * action_id (it's not about any specific Action), so it's special-cased by
 * type instead.
 */
function notificationHref(notification: Tables<"notifications">): string | null {
  if (notification.type === "profile_completion") return "/profile";
  return notification.action_id ? `/actions/${notification.action_id}` : null;
}

function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: Tables<"notifications">;
  onNavigate: () => void;
}) {
  const href = notificationHref(notification);
  const isUnread = !notification.read_at;

  const body = (
    <>
      <p className="text-sm font-medium text-ink">{notification.title}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{notification.body}</p>
      <p className="mt-1 text-[11px] text-ink-faint">{formatRelativeTime(notification.created_at)}</p>
    </>
  );

  if (!href) {
    // Purely informational, no Action to navigate to — not interactive.
    return <div className="rounded-xl px-3 py-2.5">{body}</div>;
  }

  function handleClick() {
    onNavigate();
    // Fire-and-forget on purpose — navigation must never wait on, or be
    // blocked by, this succeeding (mark-all-read on open already covers the
    // common case; this is belt-and-suspenders for the specific row clicked).
    if (isUnread) void markNotificationRead(notification.id);
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="tap-target block rounded-xl px-3 py-2.5 transition-colors hover:bg-bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {body}
    </Link>
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