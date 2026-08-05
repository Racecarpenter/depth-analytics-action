import type { League } from "@/types/database.types";

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

export interface MarketSelection {
  /** Team abbreviation for moneyline/spread, or "over" / "under" for totals. */
  key: string;
  /** Human-readable, e.g. "Suns -5.5", "Lakers +5.5", "Over 220.5". */
  label: string;
  line: number | null;
  /** American odds, e.g. -110. Informational display only. */
  odds: number | null;
}

export interface EventMarket {
  market: "moneyline" | "spread" | "total";
  selections: MarketSelection[];
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
  getMarkets(eventId: string, league?: League): Promise<EventMarket[]>;
  getGameResult(eventId: string, league?: League): Promise<GameResult | null>;
}
