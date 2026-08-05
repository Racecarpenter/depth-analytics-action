import "server-only";
import { MockSportsDataProvider } from "./mock-provider";
import { TheOddsApiProvider } from "./the-odds-api-provider";
import type { SportsDataProvider } from "./types";

export type {
  EventMarket,
  GameResult,
  MarketSelection,
  ProviderTeam,
  SearchEventsOptions,
  SportsDataProvider,
  SportsEvent,
} from "./types";

let cached: SportsDataProvider | null = null;

/** Factory — reads SPORTS_DATA_PROVIDER and returns the matching implementation. */
export function getSportsDataProvider(): SportsDataProvider {
  if (cached) return cached;

  const provider = (process.env.SPORTS_DATA_PROVIDER ?? "mock").toLowerCase();

  switch (provider) {
    case "the-odds-api": {
      const apiKey = process.env.THE_ODDS_API_KEY;
      if (!apiKey) {
        throw new Error("SPORTS_DATA_PROVIDER=the-odds-api requires THE_ODDS_API_KEY.");
      }
      cached = new TheOddsApiProvider(apiKey);
      return cached;
    }
    case "mock":
    default:
      cached = new MockSportsDataProvider();
      return cached;
  }
}
