import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionWithDetails } from "./types";

const ACTION_SELECT = `
  *,
  game:games(*, home_team:teams!games_home_team_id_fkey(*), away_team:teams!games_away_team_id_fkey(*)),
  participants!participants_action_id_fkey(
  *,
  user:users(id, display_name, cashtag)
)
`;

/**
 * All Actions the signed-in user participates in. RLS scopes this to rows
 * where the caller is a participant — no explicit filter needed here.
 */
export async function getActionsForCurrentUser(): Promise<ActionWithDetails[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("actions")
    .select(ACTION_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ActionWithDetails[];
}

export async function getActionById(actionId: string): Promise<ActionWithDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("actions")
    .select(ACTION_SELECT)
    .eq("id", actionId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as ActionWithDetails | null;
}

/**
 * Reads an Action + its participant by invite token, independent of the
 * viewer's auth/RLS state. Possession of a valid, unexpired signed token is
 * the authorization here — see features/actions/lib/signed-token.ts. Used
 * only by the /invite/[token] page, before/around sign-in.
 */
export async function getInvitePreview(participantId: string, actionId: string) {
  const admin = createAdminClient();

  const { data: participant } = await admin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("action_id", actionId)
    .maybeSingle();

  if (!participant) return null;

  const { data: action } = await admin
    .from("actions")
    .select(ACTION_SELECT)
    .eq("id", actionId)
    .maybeSingle();

  if (!action) return null;

  return { participant, action: action as unknown as ActionWithDetails };
}

export async function getActionStatusHistory(actionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("action_status_history")
    .select("*")
    .eq("action_id", actionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
