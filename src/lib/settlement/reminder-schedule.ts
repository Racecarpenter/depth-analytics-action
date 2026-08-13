import type { PaymentSettlementEventType } from "@/types/domain";

export type ReminderEventType = Extract<
  PaymentSettlementEventType,
  "reminder_6h" | "reminder_24h" | "reminder_48h"
>;

export interface ReminderLevel {
  eventType: ReminderEventType;
  hoursAfterOwed: number;
}

/**
 * How long to wait after an Action becomes owed before automatically
 * nagging the loser, and how many levels exist before automatic reminders
 * stop for good (see the note on automatic vs. manual in
 * src/app/api/cron/payment-reminders/route.ts). Ordered descending by
 * hoursAfterOwed so the cron can walk it top-down and fire the highest
 * threshold crossed that hasn't gone out yet, in case a run is missed.
 *
 * Change the numbers here to experiment with reminder timing — nothing
 * else in the codebase hard-codes these hours.
 */
export const REMINDER_SCHEDULE: ReminderLevel[] = [
  { eventType: "reminder_48h", hoursAfterOwed: 48 },
  { eventType: "reminder_24h", hoursAfterOwed: 24 },
  { eventType: "reminder_6h", hoursAfterOwed: 6 },
];

/**
 * One manual Nudge per Action per this many hours. Mirrors the 12-hour
 * window enforced server-side in settlement_record_nudge
 * (supabase/migrations/0007_payment_settlement.sql) — this constant is
 * for UI copy only ("Next nudge available in Xh"); the real enforcement
 * lives in that Postgres function and can't be bypassed from here.
 */
export const MANUAL_NUDGE_COOLDOWN_HOURS = 12;
