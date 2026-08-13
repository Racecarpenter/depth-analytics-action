import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";
import type { ReminderEventType } from "@/lib/settlement/reminder-schedule";

/**
 * Thin wrappers around the SECURITY DEFINER RPCs in
 * supabase/migrations/0007_payment_settlement.sql. Every actual state
 * transition and every authorization rule ("only the loser can mark paid,"
 * "only the winner can confirm," rate limiting, idempotency) lives in
 * those Postgres functions, not here — these wrappers exist so the calling
 * code (mutations.ts, the two cron routes) doesn't repeat `admin.rpc(...)`
 * boilerplate and error handling five times over. Not "use server" — these
 * are server-to-server helpers only, and both RPCs are revoked from
 * anon/authenticated at the database level regardless.
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
      return "This Action's payment status already changed.";
    case "not_found":
      return "This Action no longer exists.";
    default:
      return "Something went wrong. Try again.";
  }
}

/** System-only — called right after grading a won/lost Action with a stake. */
export async function markActionOwed(actionId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_mark_owed", { p_action_id: actionId });
  if (error) {
    logError("[markActionOwed] RPC failed:", error);
    return false;
  }
  return data?.[0]?.ok ?? false;
}

/** System-only — called on push/cancel/expire. */
export async function markActionNotApplicable(actionId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_mark_not_applicable", { p_action_id: actionId });
  if (error) {
    logError("[markActionNotApplicable] RPC failed:", error);
    return false;
  }
  return data?.[0]?.ok ?? false;
}

/** Loser only. */
export async function markPaid(actionId: string, actorUserId: string): Promise<SettlementActionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_mark_paid", {
    p_action_id: actionId,
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

/** Winner only. */
export async function confirmReceived(actionId: string, actorUserId: string): Promise<SettlementActionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_confirm_received", {
    p_action_id: actionId,
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

/** Winner only. */
export async function disputePayment(actionId: string, actorUserId: string): Promise<SettlementActionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_dispute", {
    p_action_id: actionId,
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

/** System-only — called from the payment-reminders cron. Returns whether this call actually sent something (false if that level already went out). */
export async function recordReminder(actionId: string, eventType: ReminderEventType): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_record_reminder", {
    p_action_id: actionId,
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

/** Winner only, rate-limited to one per 12h per Action (enforced in the RPC). */
export async function recordNudge(actionId: string, actorUserId: string): Promise<NudgeResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("settlement_record_nudge", {
    p_action_id: actionId,
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
