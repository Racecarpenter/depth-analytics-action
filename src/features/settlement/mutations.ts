"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createNotification } from "@/features/notifications/lib/notify";
import { getWinnerLoser } from "@/features/actions/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatStake } from "@/lib/utils/currency";
import { CONFIRMED_COPY, DISPUTED_COPY, MARK_PAID_COPY, pickNudgeCopy } from "@/lib/settlement/copy";
import { getActionForSettlement, participantDisplayName } from "./lib/context";
import { confirmReceived, disputePayment, markPaid, recordNudge } from "./lib/rpc";

export interface SettlementMutationResult {
  ok: boolean;
  error?: string;
  nextAvailableAt?: string;
}

/** Loser taps "Mark as Paid." Notifies the winner; does not settle anything by itself. */
export async function markActionPaid(actionId: string): Promise<SettlementMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await markPaid(actionId, currentUser.id);
  if (!result.ok) return result;

  const admin = createAdminClient();
  const action = await getActionForSettlement(admin, actionId);
  const winnerLoser = action ? getWinnerLoser(action) : null;
  if (action?.stake_amount && winnerLoser?.winner.user_id) {
    const { title, body } = MARK_PAID_COPY.winnerNotified(
      participantDisplayName(winnerLoser.loser),
      formatStake(action.stake_amount),
    );
    await createNotification(admin, { userId: winnerLoser.winner.user_id, actionId, type: "payment_marked_paid", title, body });
  }

  revalidatePath(`/actions/${actionId}`);
  return { ok: true };
}

/** Winner taps "Confirm Received." Valid from marked_paid or disputed. */
export async function confirmPaymentReceived(actionId: string): Promise<SettlementMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await confirmReceived(actionId, currentUser.id);
  if (!result.ok) return result;

  const admin = createAdminClient();
  const action = await getActionForSettlement(admin, actionId);
  const winnerLoser = action ? getWinnerLoser(action) : null;
  if (winnerLoser?.loser.user_id) {
    const { title, body } = CONFIRMED_COPY.loserNotified(participantDisplayName(winnerLoser.winner));
    await createNotification(admin, { userId: winnerLoser.loser.user_id, actionId, type: "payment_confirmed", title, body });
  }

  revalidatePath(`/actions/${actionId}`);
  return { ok: true };
}

/**
 * Winner taps "Didn't Receive It." Doesn't adjudicate — just flips to
 * disputed, stops automatic reminders, and shows a neutral status to both
 * sides. The winner can still confirm receipt later once it's sorted out.
 */
export async function disputePaymentReceipt(actionId: string): Promise<SettlementMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await disputePayment(actionId, currentUser.id);
  if (!result.ok) return result;

  const admin = createAdminClient();
  const action = await getActionForSettlement(admin, actionId);
  const winnerLoser = action ? getWinnerLoser(action) : null;
  if (winnerLoser?.loser.user_id) {
    const { title, body } = DISPUTED_COPY.loserNotified();
    await createNotification(admin, { userId: winnerLoser.loser.user_id, actionId, type: "payment_disputed", title, body });
  }

  revalidatePath(`/actions/${actionId}`);
  return { ok: true };
}

/** Winner taps "Nudge." Rate-limited to one per 12h per Action, enforced server-side. */
export async function sendNudge(actionId: string): Promise<SettlementMutationResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const result = await recordNudge(actionId, currentUser.id);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "cooldown" ? "You already nudged. Give them a minute." : result.error,
      nextAvailableAt: result.nextAvailableAt,
    };
  }

  const admin = createAdminClient();
  const action = await getActionForSettlement(admin, actionId);
  const winnerLoser = action ? getWinnerLoser(action) : null;
  if (action?.stake_amount && winnerLoser?.loser.user_id) {
    const body = pickNudgeCopy(participantDisplayName(winnerLoser.winner), formatStake(action.stake_amount));
    await createNotification(admin, { userId: winnerLoser.loser.user_id, actionId, type: "payment_reminder", title: "Nudge", body });
  }

  revalidatePath(`/actions/${actionId}`);
  return { ok: true };
}
