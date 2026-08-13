import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";
import type { ReminderEventType } from "@/lib/settlement/reminder-schedule";

/**
 * Thin wrappers around the SECURITY DEFINER RPCs in
 * supabase/migrations/0007_payment_settlement.sql and
 * 0011_settlement_obligations.sql. Every actual state transition and every
 * authorization rule lives in those Postgres functions, not here. Not
 * "use server" — these are server-to-server helpers only, and every RPC is
 * revoked from anon/authenticated at the database level regardless.
 *
 * Settlement is obligation-scoped, not Action-scoped: a 2-participant
 * sports Action always has exactly one obligation (so behaves identically
 * to the pre-Custom-Action design), but a Custom Action can have up to 7,
 * each independently owed/paid/confirmed/disputed/nudged/reminded.
 */

export interface SettlementActionResult {
  ok: boolean;
  error?: string;
}

function mapRpcError(code?: string | null): string {
  switch (code) {
    case "not_loser":
      return "Only the person who owes can mark this paid.";
    case "not_winner":
      return "Only the person who's owed can do that.";
    case "invalid_state":
      return "This obligation's payment status already changed.";
    case "not_found":
      return "This isn't there anymore.";
    default:
      return "Something went wrong. Try again.";
  }
}

/**
 * System-only — called once a winner is determined (sports grading or
 * unanimous custom consensus). Creates one obligation per non-winning
 * accepted participant. Idempotent: a second call for the same Action is a
 * no-op (returns ok: false) since obligations already exist.
 */
export async function createObligations(
  actionId: string,
  winnerParticipantId: string,
): Promise<{ ok: boolean; obligationsCreated: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_create_obligations", {
    p_action_id: actionId,
    p_winner_participant_id: winnerParticipantId,
  });
  if (error) {
    logError("[createObligations] RPC failed:", error);
    return { ok: false, obligationsCreated: 0 };
  }
  const result = data?.[0];
  return { ok: result?.ok ?? false, obligationsCreated: result?.obligations_created ?? 0 };
}

/** System-only — called on push/cancel/expire/decline. */
export async function markActionNotApplicable(actionId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_mark_not_applicable", { p_action_id: actionId });
  if (error) {
    logError("[markActionNotApplicable] RPC failed:", error);
    return false;
  }
  return data?.[0]?.ok ?? false;
}

/** Debtor only. */
export async function markPaid(obligationId: string, actorUserId: string): Promise<SettlementActionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_mark_paid", {
    p_obligation_id: obligationId,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    logError("[markPaid] RPC failed:", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  const result = data?.[0];
  if (!result?.ok) return { ok: false, error: mapRpcError(result?.error) };
  return { ok: true };
}

/** Creditor only. */
export async function confirmReceived(obligationId: string, actorUserId: string): Promise<SettlementActionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_confirm_received", {
    p_obligation_id: obligationId,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    logError("[confirmReceived] RPC failed:", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  const result = data?.[0];
  if (!result?.ok) return { ok: false, error: mapRpcError(result?.error) };
  return { ok: true };
}

/** Creditor only. */
export async function disputePayment(obligationId: string, actorUserId: string): Promise<SettlementActionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_dispute", {
    p_obligation_id: obligationId,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    logError("[disputePayment] RPC failed:", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  const result = data?.[0];
  if (!result?.ok) return { ok: false, error: mapRpcError(result?.error) };
  return { ok: true };
}

/** System-only — called from the payment-reminders cron. Returns whether this call actually sent something. */
export async function recordReminder(obligationId: string, eventType: ReminderEventType): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_record_reminder", {
    p_obligation_id: obligationId,
    p_event_type: eventType,
  });
  if (error) {
    logError("[recordReminder] RPC failed:", error);
    return false;
  }
  return data?.[0]?.sent ?? false;
}

export interface NudgeResult {
  ok: boolean;
  error?: string;
  nextAvailableAt?: string;
}

/** Creditor only, rate-limited to one per 12h per obligation (enforced in the RPC). */
export async function recordNudge(obligationId: string, actorUserId: string): Promise<NudgeResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_record_nudge", {
    p_obligation_id: obligationId,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    logError("[recordNudge] RPC failed:", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  const result = data?.[0];
  if (!result?.ok) {
    return {
      ok: false,
      error: result?.error === "cooldown" ? "cooldown" : mapRpcError(result?.error),
      nextAvailableAt: result?.next_available_at ?? undefined,
    };
  }
  return { ok: true };
}
