import type { ActionStatus, League, MarketType } from "@/types/database.types";

export const LEAGUES: League[] = ["NFL", "NBA", "MLB", "NHL"];

export const MARKET_TYPES: MarketType[] = ["moneyline", "spread", "total"];

export const MARKET_LABELS: Record<MarketType, string> = {
  moneyline: "Moneyline",
  spread: "Spread",
  total: "Game Total",
};

export const STAKE_DISCLAIMER =
  "This amount is informational only. ACTION does not hold or transfer funds.";

/** Home-screen section groupings, in display order. */
export const STATUS_GROUPS = {
  pending: ["pending"] as ActionStatus[],
  accepted: ["accepted"] as ActionStatus[],
  live: ["live"] as ActionStatus[],
  settled: ["won", "lost", "push", "declined", "cancelled", "expired"] as ActionStatus[],
};

export const STATUS_LABEL: Record<ActionStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  live: "Live",
  won: "Won",
  lost: "Lost",
  push: "Push",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** Tailwind utility classes for each status, applied to StatusPill. */
export const STATUS_TONE: Record<ActionStatus, string> = {
  pending: "text-warn bg-warn/10 border-warn/20",
  accepted: "text-accent bg-accent/10 border-accent/20",
  live: "text-accent bg-accent/10 border-accent/20",
  won: "text-accent bg-accent/10 border-accent/20",
  lost: "text-danger bg-danger/10 border-danger/20",
  push: "text-ink-muted bg-ink-muted/10 border-ink-muted/20",
  declined: "text-danger bg-danger/10 border-danger/20",
  cancelled: "text-ink-muted bg-ink-muted/10 border-ink-muted/20",
  expired: "text-ink-muted bg-ink-muted/10 border-ink-muted/20",
};

export const INVITE_EXPIRY_HOURS = 72;

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export const APP_NAME = "ACTION";
export const APP_TAGLINE = "by Depth Analytics";
