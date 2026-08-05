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

// -----------------------------------------------------------------------------
// Deterministic pseudo-randomness. No Math.random anywhere in this file — the
// same eventId always produces the same teams, line, and score, which is what
// "smart but deterministic" search and stable settlement grading require.
// -----------------------------------------------------------------------------

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic float in [0, 1) derived from a string seed. */
function seededUnit(seed: string): number {
  return hashString(seed) / 4294967296;
}

/** Deterministic float in [min, max] derived from a string seed. */
function seededRange(seed: string, min: number, max: number): number {
  return min + seededUnit(seed) * (max - min);
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

// -----------------------------------------------------------------------------
// Seed data: eight recognizable teams per league, paired into four matchups.
// -----------------------------------------------------------------------------

const LEAGUE_TEAMS: Record<League, ProviderTeam[]> = {
  NFL: [
    { league: "NFL", city: "Kansas City", name: "Chiefs", abbreviation: "KC" },
    { league: "NFL", city: "Buffalo", name: "Bills", abbreviation: "BUF" },
    { league: "NFL", city: "San Francisco", name: "49ers", abbreviation: "SF" },
    { league: "NFL", city: "Dallas", name: "Cowboys", abbreviation: "DAL" },
    { league: "NFL", city: "Philadelphia", name: "Eagles", abbreviation: "PHI" },
    { league: "NFL", city: "Baltimore", name: "Ravens", abbreviation: "BAL" },
    { league: "NFL", city: "Detroit", name: "Lions", abbreviation: "DET" },
    { league: "NFL", city: "Miami", name: "Dolphins", abbreviation: "MIA" },
  ],
  NBA: [
    { league: "NBA", city: "Boston", name: "Celtics", abbreviation: "BOS" },
    { league: "NBA", city: "Los Angeles", name: "Lakers", abbreviation: "LAL" },
    { league: "NBA", city: "Golden State", name: "Warriors", abbreviation: "GSW" },
    { league: "NBA", city: "Denver", name: "Nuggets", abbreviation: "DEN" },
    { league: "NBA", city: "Milwaukee", name: "Bucks", abbreviation: "MIL" },
    { league: "NBA", city: "Phoenix", name: "Suns", abbreviation: "PHX" },
    { league: "NBA", city: "New York", name: "Knicks", abbreviation: "NYK" },
    { league: "NBA", city: "Dallas", name: "Mavericks", abbreviation: "DAL" },
  ],
  MLB: [
    { league: "MLB", city: "New York", name: "Yankees", abbreviation: "NYY" },
    { league: "MLB", city: "Los Angeles", name: "Dodgers", abbreviation: "LAD" },
    { league: "MLB", city: "Atlanta", name: "Braves", abbreviation: "ATL" },
    { league: "MLB", city: "Houston", name: "Astros", abbreviation: "HOU" },
    { league: "MLB", city: "Philadelphia", name: "Phillies", abbreviation: "PHI" },
    { league: "MLB", city: "San Diego", name: "Padres", abbreviation: "SD" },
    { league: "MLB", city: "Texas", name: "Rangers", abbreviation: "TEX" },
    { league: "MLB", city: "San Francisco", name: "Giants", abbreviation: "SF" },
  ],
  NHL: [
    { league: "NHL", city: "Boston", name: "Bruins", abbreviation: "BOS" },
    { league: "NHL", city: "Edmonton", name: "Oilers", abbreviation: "EDM" },
    { league: "NHL", city: "Colorado", name: "Avalanche", abbreviation: "COL" },
    { league: "NHL", city: "Toronto", name: "Maple Leafs", abbreviation: "TOR" },
    { league: "NHL", city: "Vegas", name: "Golden Knights", abbreviation: "VGK" },
    { league: "NHL", city: "New York", name: "Rangers", abbreviation: "NYR" },
    { league: "NHL", city: "Dallas", name: "Stars", abbreviation: "DAL" },
    { league: "NHL", city: "Florida", name: "Panthers", abbreviation: "FLA" },
  ],
};

// Hours-from-now for each of the six seeded events per league. Status is a
// pure function of these offsets vs. wall-clock time, so the "schedule"
// always looks current and naturally progresses scheduled -> live -> final
// the way a real feed would, with zero background jobs required.
const EVENT_OFFSET_HOURS = [-30, -5, -0.75, 3, 26, 72];

const GAME_DURATION_HOURS: Record<League, number> = {
  NFL: 3.25,
  NBA: 2.5,
  MLB: 3.17,
  NHL: 2.75,
};

const TOTAL_BASELINE: Record<League, number> = {
  NFL: 44.5,
  NBA: 228.5,
  MLB: 8.5,
  NHL: 6.5,
};

const TOTAL_VARIANCE: Record<League, number> = {
  NFL: 6,
  NBA: 10,
  MLB: 1.5,
  NHL: 1.5,
};

const SPREAD_SCALE: Record<League, number> = {
  NFL: 1,
  NBA: 1,
  MLB: 0.2,
  NHL: 0.18,
};

const SPREAD_CAP: Record<League, number> = {
  NFL: 16.5,
  NBA: 16.5,
  MLB: 2.5,
  NHL: 2.5,
};

function eventIdFor(league: League, index: number) {
  return `mock-${league.toLowerCase()}-${index}`;
}

function statusForOffset(offsetHours: number, durationHours: number): {
  status: "scheduled" | "live" | "final";
  progressHours: number;
} {
  if (offsetHours > 0) return { status: "scheduled", progressHours: 0 };
  const elapsed = -offsetHours;
  if (elapsed >= durationHours) return { status: "final", progressHours: durationHours };
  return { status: "live", progressHours: elapsed };
}

function buildEvent(league: League, index: number, now: Date): SportsEvent {
  const teams = LEAGUE_TEAMS[league];
  const home = teams[(index * 2) % teams.length]!;
  const away = teams[(index * 2 + 1) % teams.length]!;
  const id = eventIdFor(league, index);
  const offsetHours = EVENT_OFFSET_HOURS[index % EVENT_OFFSET_HOURS.length]!;
  const startTime = new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
  const { status, progressHours } = statusForOffset(offsetHours, GAME_DURATION_HOURS[league]);

  // Deterministic "power gap": positive favors the home team.
  const gap = seededRange(`${id}:gap`, -12, 12);

  let homeScore: number | null = null;
  let awayScore: number | null = null;
  let period: string | null = null;

  if (status !== "scheduled") {
    const baseline = league === "MLB" ? 4.5 : league === "NHL" ? 3 : league === "NBA" ? 112 : 23;
    const swing = league === "MLB" ? 3 : league === "NHL" ? 2 : league === "NBA" ? 14 : 10;
    const homeFinal = Math.max(0, Math.round(baseline + gap * 0.15 + seededRange(`${id}:hs`, -swing, swing)));
    const awayFinal = Math.max(0, Math.round(baseline - gap * 0.15 + seededRange(`${id}:as`, -swing, swing)));

    if (status === "final") {
      homeScore = homeFinal;
      awayScore = awayFinal;
    } else {
      // Live: scale the final line down by how far through the game we are.
      const fraction = Math.min(0.95, progressHours / GAME_DURATION_HOURS[league]);
      homeScore = Math.round(homeFinal * fraction);
      awayScore = Math.round(awayFinal * fraction);
      period = league === "NFL" || league === "NHL" ? "2" : league === "NBA" ? "3" : "5";
    }
  }

  return {
    id,
    league,
    homeTeam: home,
    awayTeam: away,
    startTime: startTime.toISOString(),
    status,
    homeScore,
    awayScore,
    period,
  };
}

function americanOddsFromGap(gap: number): { home: number; away: number } {
  // Simple Elo-style win probability from the power gap.
  const pHome = 1 / (1 + Math.pow(10, -gap / 8));
  const toAmerican = (p: number) => {
    const clamped = Math.min(0.97, Math.max(0.03, p));
    return clamped >= 0.5
      ? Math.round((-100 * clamped) / (1 - clamped))
      : Math.round((100 * (1 - clamped)) / clamped);
  };
  return { home: toAmerican(pHome), away: toAmerican(1 - pHome) };
}

function buildMarkets(event: SportsEvent): EventMarket[] {
  const gap = seededRange(`${event.id}:gap`, -12, 12);
  const { home: homeML, away: awayML } = americanOddsFromGap(gap);

  const rawSpread = gap * SPREAD_SCALE[event.league];
  const cap = SPREAD_CAP[event.league];
  const homeSpread = Math.max(-cap, Math.min(cap, roundToHalf(-rawSpread)));
  const awaySpread = -homeSpread;

  const total = roundToHalf(
    TOTAL_BASELINE[event.league] + seededRange(`${event.id}:total`, -TOTAL_VARIANCE[event.league], TOTAL_VARIANCE[event.league]),
  );

  const moneyline: MarketSelection[] = [
    { key: event.homeTeam.abbreviation, label: `${event.homeTeam.name} ML`, line: null, odds: homeML },
    { key: event.awayTeam.abbreviation, label: `${event.awayTeam.name} ML`, line: null, odds: awayML },
  ];

  const spread: MarketSelection[] = [
    {
      key: event.homeTeam.abbreviation,
      label: `${event.homeTeam.name} ${homeSpread > 0 ? "+" : ""}${homeSpread}`,
      line: homeSpread,
      odds: -110,
    },
    {
      key: event.awayTeam.abbreviation,
      label: `${event.awayTeam.name} ${awaySpread > 0 ? "+" : ""}${awaySpread}`,
      line: awaySpread,
      odds: -110,
    },
  ];

  const totalMarket: MarketSelection[] = [
    { key: "over", label: `Over ${total}`, line: total, odds: -110 },
    { key: "under", label: `Under ${total}`, line: total, odds: -110 },
  ];

  return [
    { market: "moneyline", selections: moneyline },
    { market: "spread", selections: spread },
    { market: "total", selections: totalMarket },
  ];
}

function allEvents(now: Date, leagues: League[]): SportsEvent[] {
  const events: SportsEvent[] = [];
  for (const league of leagues) {
    for (let i = 0; i < EVENT_OFFSET_HOURS.length; i++) {
      events.push(buildEvent(league, i, now));
    }
  }
  return events;
}

function matchesQuery(event: SportsEvent, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = [
    event.league,
    event.homeTeam.city,
    event.homeTeam.name,
    event.homeTeam.abbreviation,
    event.awayTeam.city,
    event.awayTeam.name,
    event.awayTeam.abbreviation,
    `${event.homeTeam.name} vs ${event.awayTeam.name}`,
    `${event.awayTeam.name} at ${event.homeTeam.name}`,
  ]
    .join(" ")
    .toLowerCase();

  return words.every((word) => haystack.includes(word));
}

/**
 * Deterministic, dependency-free SportsDataProvider for local development
 * and demos. Six events per league (NFL/NBA/MLB/NHL): two final, one live,
 * three upcoming, all anchored to wall-clock "now" so the app feels alive
 * without any external API or seeded database rows.
 */
export class MockSportsDataProvider implements SportsDataProvider {
  readonly name = "mock";

  async searchEvents(query: string, options?: SearchEventsOptions): Promise<SportsEvent[]> {
    const leagues = options?.leagues ?? (["NFL", "NBA", "MLB", "NHL"] as League[]);
    const events = allEvents(new Date(), leagues)
      .filter((e) => matchesQuery(e, query))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return events.slice(0, options?.limit ?? 25);
  }

  async getEvent(eventId: string): Promise<SportsEvent | null> {
    const match = eventId.match(/^mock-([a-z]+)-(\d+)$/);
    if (!match) return null;
    const league = match[1]!.toUpperCase() as League;
    const index = Number(match[2]);
    if (!LEAGUE_TEAMS[league] || Number.isNaN(index)) return null;
    return buildEvent(league, index, new Date());
  }

  async getMarkets(eventId: string): Promise<EventMarket[]> {
    const event = await this.getEvent(eventId);
    if (!event) return [];
    return buildMarkets(event);
  }

  async getGameResult(eventId: string): Promise<GameResult | null> {
    const event = await this.getEvent(eventId);
    if (!event) return null;
    if (event.status !== "final") return null;
    return {
      eventId,
      status: "final",
      homeScore: event.homeScore ?? 0,
      awayScore: event.awayScore ?? 0,
    };
  }
}