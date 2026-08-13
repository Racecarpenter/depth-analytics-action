import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionWithDetails, ParticipantWithUser } from "@/features/actions/types";
import type { Database } from "@/types/database.types";

// Reuses the exact same participants+user shape as features/actions/queries.ts
// (ActionWithDetails) rather than inventing a parallel read.
const SETTLEMENT_SELECT = `
  *,
  game:games(*, home_team:teams!games_home_team_id_fkey(*), away_team:teams!games_away_team_id_fkey(*)),
  participants!participants_action_id_fkey(
  *,
  user:users(id, display_name, cashtag)
)
`;

export async function getActionForSettlement(
  admin: SupabaseClient<Database>,
  actionId: string,
): Promise<ActionWithDetails | null> {
  const { data } = await admin.from("actions").select(SETTLEMENT_SELECT).eq("id", actionId).maybeSingle();
  return (data as unknown as ActionWithDetails) ?? null;
}

export interface ObligationContext {
  obligationId: string;
  actionId: string;
  amount: number;
  debtor: ParticipantWithUser;
  creditor: ParticipantWithUser;
}

/**
 * Everything a settlement mutation needs (debtor, creditor, amount, the
 * parent action id for revalidation) from just an obligation id — this is
 * the per-obligation equivalent of getActionForSettlement, and what
 * markActionPaid/confirmPaymentReceived/disputePaymentReceipt/sendNudge
 * actually read after the RPC call succeeds. One obligation always belongs
 * to exactly one Action, so this reuses the same participants+user select
 * rather than a bespoke query shape.
 */
export async function getObligationContext(
  admin: SupabaseClient<Database>,
  obligationId: string,
): Promise<ObligationContext | null> {
  const { data } = await admin
    .from("settlement_obligations")
    .select(`id, action_id, amount, debtor_participant_id, creditor_participant_id, action:actions(
  participants!participants_action_id_fkey(
    *,
    user:users(id, display_name, cashtag)
  )
)`)
    .eq("id", obligationId)
    .maybeSingle();

  if (!data?.action) return null;
  const action = data.action as unknown as Pick<ActionWithDetails, "participants">;
  const debtor = action.participants.find((p) => p.id === data.debtor_participant_id);
  const creditor = action.participants.find((p) => p.id === data.creditor_participant_id);
  if (!debtor || !creditor) return null;

  return { obligationId: data.id, actionId: data.action_id, amount: data.amount, debtor, creditor };
}

/** Falls back gracefully since display_name is optional. */
export function participantDisplayName(participant: ParticipantWithUser): string {
  return participant.user?.display_name?.trim() || "your opponent";
}
