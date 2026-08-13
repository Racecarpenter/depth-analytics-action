import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordReminder } from "@/features/settlement/lib/rpc";
import { pickReminderCopy } from "@/lib/settlement/copy";
import { REMINDER_SCHEDULE } from "@/lib/settlement/reminder-schedule";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME, SMS_OPT_OUT_SUFFIX } from "@/lib/constants";
import { formatStake } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

interface OwedObligationRow {
  id: string;
  action_id: string;
  amount: number;
  created_at: string;
  debtor: { user_id: string | null; phone: string | null } | null;
  creditor: { user_id: string | null; user: { display_name: string | null } | null } | null;
}

/**
 * Automatic payment nudges — separate route from /api/cron/settle on
 * purpose, even though it runs on the same 5-minute cadence (see
 * vercel.json): sports grading and payment nagging are different jobs and
 * shouldn't be able to break each other.
 *
 * Obligation-scoped, not Action-scoped: a Custom Action with 3 unpaid
 * losers gets 3 independent reminder schedules, each starting from that
 * specific obligation's own created_at (the moment it was created, which
 * for both sports and custom happens the instant a winner is determined —
 * see settlement_create_obligations). Sends the highest reminder threshold
 * (src/lib/settlement/reminder-schedule.ts) crossed since then and not yet
 * sent — checking thresholds highest-first means a missed run doesn't
 * burst-send every level at once. Idempotent per (obligation, level) via
 * settlement_record_reminder. Stops entirely once an obligation leaves
 * 'owed' (paid, disputed, or settled) — this query just never selects it
 * again, and that's independent per obligation: Race paying doesn't affect
 * Chris's schedule.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const OBLIGATION_SELECT = `
    id, action_id, amount, created_at,
    debtor:participants!settlement_obligations_debtor_participant_id_fkey(user_id, phone),
    creditor:participants!settlement_obligations_creditor_participant_id_fkey(user_id, user:users(display_name))
  `;

  const { data: owedObligations, error } = await admin
    .from("settlement_obligations")
    .select(OBLIGATION_SELECT)
    .eq("payment_status", "owed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = { checked: 0, sent: 0 };

  for (const obligation of (owedObligations ?? []) as unknown as OwedObligationRow[]) {
    summary.checked += 1;

    const hoursSinceOwed = (Date.now() - new Date(obligation.created_at).getTime()) / 3_600_000;
    const level = REMINDER_SCHEDULE.find((l) => hoursSinceOwed >= l.hoursAfterOwed);
    if (!level) continue;

    const sent = await recordReminder(obligation.id, level.eventType);
    if (!sent) continue;

    if (!obligation.debtor?.user_id) continue;

    const winnerName = obligation.creditor?.user?.display_name?.trim() || "your opponent";
    const body = pickReminderCopy(level.eventType, winnerName, formatStake(obligation.amount));

    await admin.from("notifications").insert({
      user_id: obligation.debtor.user_id,
      action_id: obligation.action_id,
      type: "payment_reminder",
      title: "Still owed",
      body,
    });

    if (obligation.debtor.phone) {
      await getSmsProvider().send({ to: obligation.debtor.phone, body: `${APP_NAME}: ${body}${SMS_OPT_OUT_SUFFIX}` });
    }

    summary.sent += 1;
  }

  return NextResponse.json({ ok: true, ...summary });
}
