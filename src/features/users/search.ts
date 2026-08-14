"use server";

import { getCurrentUser } from "@/features/auth/session";
import { getPeopleWithActionHistory, type PersonSummary } from "./queries";

/**
 * The one client-reachable entry point into "people you've had Action
 * with" — used by both the Sports Action and Custom Action pickers. Always
 * scopes to the signed-in caller's own history; there is no parameter a
 * client could pass to search anyone else's connections or the wider user
 * table. Empty query returns the recent/frequent short list (RPC's own
 * `order by last_interaction desc, actions_together desc`); a non-empty
 * query filters by name/username within that same connected set.
 */
export async function searchPreviousOpponents(query: string): Promise<PersonSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const trimmed = query.trim();
  return getPeopleWithActionHistory(user.id, trimmed || undefined, trimmed ? 10 : 5);
}
