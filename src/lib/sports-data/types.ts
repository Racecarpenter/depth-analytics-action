import type { League } from "@/types/domain";

export interface ProviderTeam {
  league: League;
  city: string;
  name: string;
  abbreviation: string;
}

export type ProviderGameStatus = "scheduled" | "live" | "final" | "postponed" | "cancelled";

export interface SportsEvent {
  /** Stable id, unique within a given provider. Not a UUID — providers own their own id format. */
  id: string;
  league: League;
  homeTeam: ProviderTeam;
  awayTeam: ProviderTeam;
  startTime: string; // ISO 8601
  status: ProviderGameStatus;
  homeScore: number | null;
  awayScore: number | null;
  period: string | null;
}

export interface GameResult {
  eventId: string;
  status: "final" | "postponed" | "cancelled";
  homeScore: number;
  awayScore: number;
}

export interface SearchEventsOptions {
  leagues?: League[];
  limit?: number;
}

/**
 * Everything the rest of the app knows about sports data. Swapping providers
 * (mock -> The Odds API -> anything else) means writing one new class that
 * implements this interface and flipping SPORTS_DATA_PROVIDER — no call
 * sites in features/ change.
 *
 * Deliberately schedule/score only — no odds/markets. A Sports Action is
 * "who wins," not a sportsbook bet, so this interface only needs to answer:
 * what games exist, what are the teams, and who won. See README ("Sports
 * Action simplification") for why `getMarkets()` was removed rather than
 * left unused.
 */
export interface SportsDataProvider {
  readonly name: string;
  searchEvents(query: string, options?: SearchEventsOptions): Promise<SportsEvent[]>;
  /**
   * `league` is optional but should be passed whenever the caller already
   * knows it (e.g. from the `games` row) — real providers can use it to hit
   * one league-scoped endpoint instead of sweeping every league, which
   * matters a lot for usage-quota-metered providers when this is called on
   * every cron tick for every open Action.
   */
  getEvent(eventId: string, league?: League): Promise<SportsEvent | null>;
  getGameResult(eventId: string, league?: League): Promise<GameResult | null>;
}
