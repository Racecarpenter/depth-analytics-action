import type { PaymentSettlementEventType } from "@/types/domain";

type CopyFn = (opponentName: string, amount: string) => string;

function pick(lines: CopyFn[], opponentName: string, amount: string): string {
  const fn = lines[Math.floor(Math.random() * lines.length)]!;
  return fn(opponentName, amount);
}

/**
 * Centralized, editable copy for every player-facing moment in payment
 * settlement — the whole point of Action's "playfully pushy, not
 * genuinely hostile" personality living in one place instead of scattered
 * across mutations/cron routes. Nothing here implies ACTION is collecting
 * a debt on anyone's behalf; every line stays in "friends giving each
 * other shit," never collections/legal language. Reminder and nudge copy
 * is picked randomly from its pool on each send so an Action doesn't see
 * the identical line every time.
 */

export const RESULT_COPY = {
  /** Shown to the loser the moment an Action resolves and money is owed. */
  loserOwes: (winnerName: string, amount: string) => ({
    title: "Well, shit.",
    body: `You owe ${winnerName} ${amount}.`,
  }),
  /** Shown to the winner at the same moment. */
  winnerOwed: (loserName: string, amount: string) => ({
    title: "You got him.",
    body: `${loserName} owes you ${amount}.`,
  }),
};

const REMINDER_LINES: Record<
  Extract<PaymentSettlementEventType, "reminder_6h" | "reminder_24h" | "reminder_48h">,
  CopyFn[]
> = {
  reminder_6h: [
    (_name, amount) => `👀 Just checking in on that ${amount}.`,
    (name, amount) => `${name}'s ${amount} is wondering where you are.`,
    () => "Friendly reminder: losing was free. Paying up is the hard part.",
  ],
  reminder_24h: [
    (_name, amount) => `24 hours later... that ${amount} is still undefeated.`,
    (name, _amount) => `A full day. Impressive commitment to holding onto ${name}'s money.`,
    (_name, amount) => `That ${amount} has officially spent the night.`,
  ],
  reminder_48h: [
    (_name, amount) => `48 hours unpaid. We're starting to think you're emotionally attached to that ${amount}.`,
    () => "Two days. This debt now qualifies as a long-term relationship.",
    () => "The Action Department of Collections has been notified. Unfortunately, it's just this notification.",
  ],
};

export function pickReminderCopy(
  level: Extract<PaymentSettlementEventType, "reminder_6h" | "reminder_24h" | "reminder_48h">,
  winnerName: string,
  amount: string,
): string {
  return pick(REMINDER_LINES[level], winnerName, amount);
}

const NUDGE_LINES: CopyFn[] = [
  (name, amount) => `${name} would like you to know: that ${amount} isn't going to pay itself.`,
  (_name, amount) => `A gentle nudge about that ${amount}.`,
  (name, amount) => `${name} is nudging you about ${amount}. Rude of them, honestly. Also, you owe it.`,
];

export function pickNudgeCopy(winnerName: string, amount: string): string {
  return pick(NUDGE_LINES, winnerName, amount);
}

export const MARK_PAID_COPY = {
  /** Notification to the winner once the loser taps "Mark as Paid." */
  winnerNotified: (loserName: string, amount: string) => ({
    title: "Payment marked",
    body: `${loserName} says they paid you ${amount}.`,
  }),
};

export const CONFIRMED_COPY = {
  /** Notification to the loser once the winner confirms receipt. */
  loserNotified: (winnerName: string) => ({
    title: "Settled ✓",
    body: `${winnerName} confirmed they got paid. You're squared up.`,
  }),
};

export const DISPUTED_COPY = {
  /** Notification to the loser if the winner says they didn't receive it. */
  loserNotified: () => ({
    title: "Payment not confirmed",
    body: "Your opponent says they haven't received it yet. You two will need to sort this out yourselves.",
  }),
  /** Neutral, non-adjudicating label shown in the UI to both sides. */
  neutralStatusLabel: "Payment not confirmed",
};
