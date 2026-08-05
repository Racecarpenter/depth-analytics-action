"use server";

import { getSportsDataProvider } from "@/lib/sports-data";
import type { SportsEvent } from "@/lib/sports-data";
import { LEAGUES } from "@/lib/constants";

/**
 * Thin Server Action wrapper so the (server-only) SportsDataProvider can be
 * called from the client-side search box via React Query.
 */
export async function searchGames(query: string): Promise<SportsEvent[]> {
  const provider = getSportsDataProvider();
  return provider.searchEvents(query, { leagues: LEAGUES, limit: 20 });
}
