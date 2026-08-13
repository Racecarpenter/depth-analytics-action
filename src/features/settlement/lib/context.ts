import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionWithDetails, ParticipantWithUser } from "@/features/actions/types";
import type { Database } from "@/types/database.types";

// Reuses the exact same participants+user shape as features/actions/queries.ts
// (ActionWithDetails / getWinnerLoser) rather than inventing a parallel read —
// payment settlement needs the same "who's the winner, who's the loser, what
// are their names" answer that the Action detail page already computes.
const SETTLEMENT_SELECT = `
  *,
  game:games(*, home_team:teams!games_home_team_id_fkey(*), away_team:teams!games_away_team_id_fkey(*)),
  participants(*, user:users(id, display_name, cashtag))
`;

export async function getActionForSettlement(
  admin: SupabaseClient<Database>,
  actionId: string,
): Promise<ActionWithDetails | null> {
  const { data } = await admin.from("actions").select(SETTLEMENT_SELECT).eq("id", actionId).maybeSingle();
  return (data as unknown as ActionWithDetails) ?? null;
}

/** Falls back gracefully since display_name is optional. */
export function participantDisplayName(participant: ParticipantWithUser): string {
  return participant.user?.display_name?.trim() || "your opponent";
}
