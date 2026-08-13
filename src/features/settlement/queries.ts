import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PaymentSettlementStatus } from "@/types/domain";

/** RLS-scoped — participants can read their own Action's settlement events. */
export async function getLastNudgeAt(obligationId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_settlement_events")
    .select("created_at")
    .eq("obligation_id", obligationId)
    .eq("event_type", "manual_nudge")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<{ created_at: string }[]>()
    .maybeSingle();
  return data?.created_at ?? null;
}

export interface ObligationSummary {
  id: string;
  amount: number;
  paymentStatus: PaymentSettlementStatus;
  debtorParticipantId: string;
  creditorParticipantId: string;
}

/** All settlement obligations on an Action — one for sports, up to 7 for Custom. RLS-scoped. */
export async function getObligationsForAction(actionId: string): Promise<ObligationSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settlement_obligations")
    .select("id, amount, payment_status, debtor_participant_id, creditor_participant_id")
    .eq("action_id", actionId)
    .order("created_at", { ascending: true })
    .returns<
      {
        id: string;
        amount: number;
        payment_status: PaymentSettlementStatus;
        debtor_participant_id: string;
        creditor_participant_id: string;
      }[]
    >();

  return (data ?? []).map((row) => ({
    id: row.id,
    amount: row.amount,
    paymentStatus: row.payment_status,
    debtorParticipantId: row.debtor_participant_id,
    creditorParticipantId: row.creditor_participant_id,
  }));
}
