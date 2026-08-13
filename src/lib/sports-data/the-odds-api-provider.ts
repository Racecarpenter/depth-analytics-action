import type { League } from "@/types/domain";
import type { GameResult, ProviderTeam, SearchEventsOptions, SportsDataProvider, SportsEvent } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";

const SPORT_KEY: Record<League, string> = {
  NFL: "americanfootball_nfl",
  NBA: "basketball_nba",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
};

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

/**
 * Real-data implementation for https://the-odds-api.com. Implements the
 * exact same SportsDataProvider contract as the mock provider — flipping
 * SPORTS_DATA_PROVIDER=the-odds-api is the only change required anywhere in
 * the app.
 *
 * Deliberately odds-free: a Sports Action is "who wins," not a sportsbook
 * bet, so this class only ever calls the free `/events` endpoint (schedule,
 * teams, status) and the metered `/scores` endpoint (final results — the one
 * call that's genuinely unavoidable with any provider). It never calls
 * `/odds`, which used to be the bulk of this provider's metered usage
 * (`searchEvents` previously hit `/odds` just to list games, despite never
 * using the odds it got back). See README ("Sports Action simplification")
 * for the full picture.
 *
 * Notes for whoever revisits this:
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

  /**
   * Free — the /events endpoint never counts against the usage quota.
   * Without `eventIds`, returns every upcoming/live event for the league
   * (used by `searchEvents`); with it, filters to specific ids (used by
   * `getEvent`). This is the only endpoint this provider calls for anything
   * other than final scores.
   */
  private async fetchEventsFree(league: League, eventIds?: string): Promise<OddsApiEventLite[]> {
    return this.fetchJson<OddsApiEventLite[]>(
      `/sports/${SPORT_KEY[league]}/events`,
      eventIds ? { eventIds } : {},
    );
  }

  private toSportsEvent(league: League, e: OddsApiEventLite): SportsEvent {
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
    const results = await Promise.all(leagues.map((l) => this.fetchEventsFree(l)));

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
    // This is what the settlement cron calls on every tick for every open
    // Action, so keeping it on the free endpoint matters a lot. Pass
    // `league` when it's already known (the cron route always has it via
    // the games table) to make this a single free call instead of a
    // 4-league sweep.
    if (league) {
      const events = await this.fetchEventsFree(league, eventId);
      return events[0] ? this.toSportsEvent(league, events[0]) : null;
    }
    for (const l of Object.keys(SPORT_KEY) as League[]) {
      const events = await this.fetchEventsFree(l, eventId);
      if (events[0]) return this.toSportsEvent(l, events[0]);
    }
    return null;
  }

  async getGameResult(eventId: string, league?: League): Promise<GameResult | null> {
    // Unlike /events, /scores always costs quota — passing `league` turns
    // this into 1 call instead of up to 4.
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
