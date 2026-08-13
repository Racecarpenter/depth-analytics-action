"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createNotification } from "@/features/notifications/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME, SMS_OPT_OUT_SUFFIX } from "@/lib/constants";
import { formatStake } from "@/lib/utils/currency";
import { CONFIRMED_COPY, DISPUTED_COPY, MARK_PAID_COPY, pickNudgeCopy } from "@/lib/settlement/copy";
import { getObligationContext, participantDisplayName } from "./lib/context";
import { confirmReceived, disputePayment, markPaid, recordNudge } from "./lib/rpc";

export interface SettlementMutationResult {
  ok: boolean;
  error?: string;
  nextAvailableAt?: string;
}

/** Debtor taps "Mark as Paid" on one obligation. Notifies the creditor; does not settle anything by itself. */
export async function markActionPaid(obligationId: string): Promise<SettlementMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await markPaid(obligationId, currentUser.id);
  if (!result.ok) return result;

  const admin = createAdminClient();
  const context = await getObligationContext(admin, obligationId);
  if (context?.creditor.user_id) {
    const { title, body } = MARK_PAID_COPY.winnerNotified(
      participantDisplayName(context.debtor),
      formatStake(context.amount),
    );
    await createNotification(admin, { userId: context.creditor.user_id, actionId: context.actionId, type: "payment_marked_paid", title, body });
    if (context.creditor.phone) {
      await getSmsProvider().send({ to: context.creditor.phone, body: `${APP_NAME}: ${body}${SMS_OPT_OUT_SUFFIX}` });
    }
  }

  if (context) revalidatePath(`/actions/${context.actionId}`);
  return { ok: true };
}

/** Creditor taps "Confirm Received." Valid from marked_paid or disputed. */
export async function confirmPaymentReceived(obligationId: string): Promise<SettlementMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await confirmReceived(obligationId, currentUser.id);
  if (!result.ok) return result;

  const admin = createAdminClient();
  const context = await getObligationContext(admin, obligationId);
  if (context?.debtor.user_id) {
    const { title, body } = CONFIRMED_COPY.loserNotified(participantDisplayName(context.creditor));
    await createNotification(admin, { userId: context.debtor.user_id, actionId: context.actionId, type: "payment_confirmed", title, body });
    if (context.debtor.phone) {
      await getSmsProvider().send({ to: context.debtor.phone, body: `${APP_NAME}: ${body}${SMS_OPT_OUT_SUFFIX}` });
    }
  }

  if (context) revalidatePath(`/actions/${context.actionId}`);
  return { ok: true };
}

/**
 * Creditor taps "Didn't Receive It." Doesn't adjudicate — just flips this
 * one obligation to disputed, stops its automatic reminders, and shows a
 * neutral status. The creditor can still confirm receipt later once it's
 * sorted out. Other obligations on the same Action (other losers) are
 * completely unaffected.
 */
export async function disputePaymentReceipt(obligationId: string): Promise<SettlementMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await disputePayment(obligationId, currentUser.id);
  if (!result.ok) return result;

  const admin = createAdminClient();
  const context = await getObligationContext(admin, obligationId);
  if (context?.debtor.user_id) {
    const { title, body } = DISPUTED_COPY.loserNotified();
    await createNotification(admin, { userId: context.debtor.user_id, actionId: context.actionId, type: "payment_disputed", title, body });
    if (context.debtor.phone) {
      await getSmsProvider().send({ to: context.debtor.phone, body: `${APP_NAME}: ${body}${SMS_OPT_OUT_SUFFIX}` });
    }
  }

  if (context) revalidatePath(`/actions/${context.actionId}`);
  return { ok: true };
}

/**
 * Creditor taps "Nudge" for one specific debtor. Rate-limited to one per
 * 12h per obligation — nudging Chris never touches Race's cooldown or
 * notification history.
 */
export async function sendNudge(obligationId: string): Promise<SettlementMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await recordNudge(obligationId, currentUser.id);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "cooldown" ? "You already nudged. Give them a minute." : result.error,
      nextAvailableAt: result.nextAvailableAt,
    };
  }

  const admin = createAdminClient();
  const context = await getObligationContext(admin, obligationId);
  if (context?.debtor.user_id) {
    const body = pickNudgeCopy(participantDisplayName(context.creditor), formatStake(context.amount));
    await createNotification(admin, { userId: context.debtor.user_id, actionId: context.actionId, type: "payment_reminder", title: "Nudge", body });
    if (context.debtor.phone) {
      await getSmsProvider().send({ to: context.debtor.phone, body: `${APP_NAME}: ${body}${SMS_OPT_OUT_SUFFIX}` });
    }
  }

  if (context) revalidatePath(`/actions/${context.actionId}`);
  return { ok: true };
}
