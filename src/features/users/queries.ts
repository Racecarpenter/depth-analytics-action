import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";

export interface PersonSummary {
  userId: string;
  displayName: string | null;
  username: string | null;
  avatarPath: string | null;
  actionsTogether: number;
  lastInteractionAt: string | null;
}

/**
 * "People you've had Action with" — never a global user search. The RPC
 * (supabase/migrations/0022_relationship_stats.sql) only connects two users
 * once both sides have `status = 'accepted'` on a shared Action, and is
 * revoked from every role except service_role — this function is the only
 * sanctioned way to call it, and `callerUserId` must always be the
 * authenticated caller's own id (see searchPreviousOpponents, the one
 * client-reachable entry point, which gets it from the session — never from
 * a parameter a client could override).
 */
export async function getPeopleWithActionHistory(
  callerUserId: string,
  search?: string,
  limit = 5,
): Promise<PersonSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_people_with_action_history", {
    p_user_id: callerUserId,
    p_search: search?.trim() || null,
    p_limit: limit,
  });

  if (error) {
    logError("[getPeopleWithActionHistory] rpc failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    username: row.username,
    avatarPath: row.avatar_path,
    actionsTogether: row.actions_together,
    lastInteractionAt: row.last_interaction_at,
  }));
}

export interface UserActionStats {
  wins: number;
  losses: number;
  totalActions: number;
  settledCount: number;
  owedTotalCount: number;
}

export async function getUserActionStats(userId: string): Promise<UserActionStats | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_user_action_stats", { p_user_id: userId });
  if (error || !data?.[0]) {
    if (error) logError("[getUserActionStats] rpc failed:", error);
    return null;
  }
  const row = data[0];
  return {
    wins: row.wins,
    losses: row.losses,
    totalActions: row.total_actions,
    settledCount: row.settled_count,
    owedTotalCount: row.owed_total_count,
  };
}

export interface HeadToHeadStats {
  actionsTogether: number;
  viewerWins: number;
  viewerLosses: number;
  netAmount: number;
  obligationsCount: number;
  allSettled: boolean;
}

/**
 * `viewerUserId` should always be the authenticated caller — this is
 * "you vs them," not a general pairwise lookup a client could point at two
 * arbitrary strangers.
 */
export async function getHeadToHeadStats(viewerUserId: string, otherUserId: string): Promise<HeadToHeadStats | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_head_to_head_stats", {
    p_user_id: viewerUserId,
    p_other_user_id: otherUserId,
  });
  if (error || !data?.[0]) {
    if (error) logError("[getHeadToHeadStats] rpc failed:", error);
    return null;
  }
  const row = data[0];
  return {
    actionsTogether: row.actions_together,
    viewerWins: row.viewer_wins,
    viewerLosses: row.viewer_losses,
    netAmount: row.net_amount,
    obligationsCount: row.obligations_count,
    allSettled: row.all_settled,
  };
}
