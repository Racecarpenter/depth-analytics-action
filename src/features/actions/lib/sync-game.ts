import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderTeam, SportsEvent } from "@/lib/sports-data";
import type { Database, Tables } from "@/types/database.types";

/**
 * Bridges a provider's SportsEvent into our normalized `games`/`teams`
 * tables. Providers are the source of truth for schedule/score data;
 * `games` is a lazily-populated mirror, upserted the moment a user selects
 * an event to build an Action from (and again by the settlement job as
 * scores change). This keeps SportsDataProvider fully DB-agnostic — it
 * never needs to know about Supabase.
 */

async function findOrCreateTeam(
  admin: SupabaseClient<Database>,
  team: ProviderTeam,
): Promise<Tables<"teams">> {
  const { data: existing } = await admin
    .from("teams")
    .select("*")
    .eq("league", team.league)
    .eq("abbreviation", team.abbreviation)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await admin
    .from("teams")
    .insert({ league: team.league, city: team.city, name: team.name, abbreviation: team.abbreviation })
    .select("*")
    .single();

  if (error || !created) throw new Error(`Failed to create team ${team.abbreviation}: ${error?.message}`);
  return created;
}

export async function syncGameFromEvent(
  admin: SupabaseClient<Database>,
  event: SportsEvent,
  providerName: string,
): Promise<Tables<"games">> {
  const [home, away] = await Promise.all([
    findOrCreateTeam(admin, event.homeTeam),
    findOrCreateTeam(admin, event.awayTeam),
  ]);

  const payload = {
    league: event.league,
    provider: providerName,
    external_id: event.id,
    home_team_id: home.id,
    away_team_id: away.id,
    start_time: event.startTime,
    status: event.status,
    home_score: event.homeScore,
    away_score: event.awayScore,
    period: event.period,
  };

  const { data: existingGame } = await admin
    .from("games")
    .select("id")
    .eq("provider", providerName)
    .eq("external_id", event.id)
    .maybeSingle();

  if (existingGame) {
    const { data: updated, error } = await admin
      .from("games")
      .update(payload)
      .eq("id", existingGame.id)
      .select("*")
      .single();
    if (error || !updated) throw new Error(`Failed to update game ${event.id}: ${error?.message}`);
    return updated;
  }

  const { data: created, error } = await admin.from("games").insert(payload).select("*").single();
  if (error || !created) throw new Error(`Failed to create game ${event.id}: ${error?.message}`);
  return created;
}
