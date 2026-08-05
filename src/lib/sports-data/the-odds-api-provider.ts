import type { League } from "@/types/database.types";
import type {
  EventMarket,
  GameResult,
  MarketSelection,
  ProviderTeam,
  SearchEventsOptions,
  SportsDataProvider,
  SportsEvent,
} from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";

const SPORT_KEY: Record<League, string> = {
  NFL: "americanfootball_nfl",
  NBA: "basketball_nba",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
};

interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsApiMarket {
  key: "h2h" | "spreads" | "totals";
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  markets: OddsApiMarket[];
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

/** Shape returned by the free /events endpoint — no bookmakers/odds. */
interface OddsApiEventLite {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface OddsApiScoreEntry {
  id: string;
  completed: boolean;
  scores: { name: string; score: string }[] | null;
}

function teamRefFromName(league: League, fullName: string): ProviderTeam {
  const parts = fullName.split(" ");
  const name = parts.pop() ?? fullName;
  const city = parts.join(" ") || fullName;
  return { league, city, name, abbreviation: name.slice(0, 3).toUpperCase() };
}

function toEventMarkets(
  home: string,
  away: string,
  bookmaker: OddsApiBookmaker | undefined,
): EventMarket[] {
  if (!bookmaker) return [];

  const find = (key: OddsApiMarket["key"]) => bookmaker.markets.find((m) => m.key === key);

  const markets: EventMarket[] = [];

  const h2h = find("h2h");
  if (h2h) {
    const selections: MarketSelection[] = h2h.outcomes.map((o) => ({
      key: o.name === home ? "HOME" : "AWAY",
      label: `${o.name} ML`,
      line: null,
      odds: o.price,
    }));
    markets.push({ market: "moneyline", selections });
  }

  const spreads = find("spreads");
  if (spreads) {
    const selections: MarketSelection[] = spreads.outcomes.map((o) => ({
      key: o.name === home ? "HOME" : "AWAY",
      label: `${o.name} ${o.point && o.point > 0 ? "+" : ""}${o.point ?? ""}`,
      line: o.point ?? null,
      odds: o.price,
    }));
    markets.push({ market: "spread", selections });
  }

  const totals = find("totals");
  if (totals) {
    const selections: MarketSelection[] = totals.outcomes.map((o) => ({
      key: o.name.toLowerCase().includes("over") ? "over" : "under",
      label: `${o.name} ${o.point ?? ""}`,
      line: o.point ?? null,
      odds: o.price,
    }));
    markets.push({ market: "total", selections });
  }

  return markets;
}

/**
 * Real-data implementation for https://the-odds-api.com. Implements the
 * exact same SportsDataProvider contract as the mock provider — flipping
 * SPORTS_DATA_PROVIDER=the-odds-api is the only change required anywhere in
 * the app.
 *
 * Notes for whoever wires this up for real:
 *  - `getMarkets` re-fetches a single event's odds rather than trusting a
 *    cached search response, since lines move between search and selection.
 *  - Only the first bookmaker returned is used. For production you'll likely
 *    want to pick a specific book (e.g. "draftkings") or a consensus/median
 *    across a few, since ACTION only needs *a* line to lock in, not the best
 *    line — this is a peer-to-peer app, not a shopping tool.
 *  - The Odds API's `/scores` endpoint only looks back `daysFrom` days
 *    (max 3), which is enough for same-day settlement but means a settlement
 *    job that's been down for a while needs a wider backfill strategy.
 */
export class TheOddsApiProvider implements SportsDataProvider {
  readonly name = "the-odds-api";

  constructor(private readonly apiKey: string) {}

  private async fetchJson<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("apiKey", this.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), { next: { revalidate: 30 } });
    if (!res.ok) {
      throw new Error(`The Odds API request failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  private async fetchEventsForLeague(league: League): Promise<OddsApiEvent[]> {
    return this.fetchJson<OddsApiEvent[]>(`/sports/${SPORT_KEY[league]}/odds`, {
      regions: "us",
      markets: "h2h,spreads,totals",
      oddsFormat: "american",
    });
  }

  /**
   * Free — the /events endpoint never counts against the usage quota. Used
   * anywhere we only need to know a game's schedule/live status (not its
   * odds), which is most of what the settlement cron needs on every tick.
   */
  private async fetchEventLite(league: League, eventId: string): Promise<OddsApiEventLite | null> {
    const events = await this.fetchJson<OddsApiEventLite[]>(`/sports/${SPORT_KEY[league]}/events`, {
      eventIds: eventId,
    });
    return events[0] ?? null;
  }

  private toSportsEvent(league: League, e: OddsApiEvent | OddsApiEventLite): SportsEvent {
    return {
      id: e.id,
      league,
      homeTeam: teamRefFromName(league, e.home_team),
      awayTeam: teamRefFromName(league, e.away_team),
      startTime: e.commence_time,
      status: new Date(e.commence_time) > new Date() ? "scheduled" : "live",
      homeScore: null,
      awayScore: null,
      period: null,
    };
  }

  async searchEvents(query: string, options?: SearchEventsOptions): Promise<SportsEvent[]> {
    const leagues = options?.leagues ?? (Object.keys(SPORT_KEY) as League[]);
    const results = await Promise.all(leagues.map((l) => this.fetchEventsForLeague(l)));

    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const events = leagues.flatMap((league, i) =>
      (results[i] ?? []).map((e) => this.toSportsEvent(league, e)),
    );

    const filtered =
      words.length === 0
        ? events
        : events.filter((e) => {
            const haystack = `${e.league} ${e.homeTeam.city} ${e.homeTeam.name} ${e.awayTeam.city} ${e.awayTeam.name}`.toLowerCase();
            return words.every((w) => haystack.includes(w));
          });

    return filtered
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, options?.limit ?? 25);
  }

  async getEvent(eventId: string, league?: League): Promise<SportsEvent | null> {
    // Uses the free /events endpoint (no odds needed here, just schedule /
    // live status) — this is what the settlement cron calls on every tick
    // for every open Action, so keeping it off the metered /odds endpoint
    // matters a lot. Pass `league` when it's already known (the cron route
    // always has it via the games table) to make this a single free call
    // instead of a 4-league sweep.
    if (league) {
      const match = await this.fetchEventLite(league, eventId);
      return match ? this.toSportsEvent(league, match) : null;
    }
    for (const l of Object.keys(SPORT_KEY) as League[]) {
      const match = await this.fetchEventLite(l, eventId);
      if (match) return this.toSportsEvent(l, match);
    }
    return null;
  }

  async getMarkets(eventId: string, league?: League): Promise<EventMarket[]> {
    const leagues = league ? [league] : (Object.keys(SPORT_KEY) as League[]);
    for (const l of leagues) {
      try {
        const event = await this.fetchJson<OddsApiEvent>(
          `/sports/${SPORT_KEY[l]}/events/${eventId}/odds`,
          { regions: "us", markets: "h2h,spreads,totals", oddsFormat: "american" },
        );
        return toEventMarkets(event.home_team, event.away_team, event.bookmakers?.[0]);
      } catch {
        continue;
      }
    }
    return [];
  }

  async getGameResult(eventId: string, league?: League): Promise<GameResult | null> {
    // Unlike /events, /scores always costs quota (2 credits with daysFrom
    // set) — passing `league` turns this into 1 call instead of up to 4.
    const leagues = league ? [league] : (Object.keys(SPORT_KEY) as League[]);
    for (const l of leagues) {
      const scores = await this.fetchJson<OddsApiScoreEntry[]>(`/sports/${SPORT_KEY[l]}/scores`, {
        daysFrom: "3",
      });
      const match = scores.find((s) => s.id === eventId);
      if (!match) continue;
      if (!match.completed || !match.scores) return null;

      const home = match.scores[0];
      const away = match.scores[1];
      if (!home || !away) return null;

      return {
        eventId,
        status: "final",
        homeScore: Number(home.score),
        awayScore: Number(away.score),
      };
    }
    return null;
  }
}
