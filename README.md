# ACTION — by Depth Analytics

A peer-to-peer sports challenge tracker. One friend challenges another on a game outcome, the friend gets a text, they accept, and ACTION automatically tracks who won after the game finishes.

**ACTION never handles money.** It doesn't collect deposits, hold balances, or pay out winners. Stakes are informational text agreed on between two people — the app just tracks the outcome.

---

## Stack

- Next.js 15 (App Router, Server Actions)
- TypeScript (strict)
- Tailwind CSS
- Supabase (Postgres, Auth, RLS)
- Zod validation
- TanStack React Query (client-side game search only)
- Deployed on Vercel, settlement runs as a Vercel Cron job

## Design language

Dark mode only. Charcoal background, a single green accent, a barely-there grid texture as the only "terminal" reference, generous spacing, and almost no iconography. It's built to sit next to Depth Analytics, not next to a sportsbook — no odds tickers, no flashing lines, no casino chrome. See `tailwind.config.ts` (`colors.bg`, `colors.ink`, `colors.accent`) and `src/app/globals.css` for the whole system in one place.

---

## Architecture

```
src/
  app/                     Routes only. Thin — pages fetch data and compose feature components.
    page.tsx                 Home (Pending / Accepted / Live / Settled)
    login/                    Phone auth
    actions/new/               Game search
    actions/new/[gameId]/       Market + side + stake + invite
    actions/[actionId]/         Action detail (immutable once accepted)
    invite/[token]/             Invite accept/decline (works signed-out)
    api/cron/settle/            Settlement job (Vercel Cron hits this)

  features/                One folder per domain area. Each owns its queries,
                            mutations (Server Actions), and components.
    auth/                    Phone OTP, session helpers
    games/                    Search wrapper around SportsDataProvider
    actions/                   The core "Action" (challenge) entity
    notifications/              In-app notifications

  lib/
    supabase/                client.ts (browser) / server.ts (RLS-scoped) / admin.ts (service role)
    sms/                     SmsProvider interface + mock + Twilio implementations
    sports-data/              SportsDataProvider interface + mock + The Odds API implementations
    validations/              Zod schemas
    utils/                    Small, boring helpers (phone, currency, odds, date, cn)

  components/               Cross-feature, generic UI (Button, Card, Input, AppHeader, ...)
  types/database.types.ts   Hand-authored types mirroring the Supabase schema
```

**Why two provider interfaces?** `SportsDataProvider` (schedules/odds/results) and `SmsProvider` (sending texts) are the two things this MVP genuinely can't control the shape of long-term — one vendor today might not be the vendor in six months. Everything else talks to those interfaces, never to a concrete implementation, so swapping either one is a one-line env var change (see below).

**Why is `games` a table if there's a provider abstraction?** Providers own schedule/odds/score data; `games`/`teams` are a normalized, lazily-populated mirror of whatever the active provider returns, built the moment someone selects a game (`src/features/actions/lib/sync-game.ts`). Actions reference the DB row, not the provider directly, so an Action's game details stay stable even if a provider's API changes shape later.

**Why does `actions.status` sometimes read backwards for one person?** Status is stored canonically from the creator's point of view (`won` means the creator won). `personalStatus()` in `src/features/actions/types.ts` flips `won`/`lost` for the opponent so every screen can just ask "did I win" — see it used in the home screen grouping and `ActionCard`.

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then either:

**Option A — Supabase CLI (recommended for local dev)**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # runs supabase/migrations/*.sql
psql "$(npx supabase db remote-commit-url 2>/dev/null || true)" # optional
```

Or simpler, paste `supabase/migrations/0001_init.sql`, `0002_auth_otp.sql`, and `0004_cashtag.sql` (in that order) into the Supabase SQL editor, then `supabase/seed.sql`. Skip `0003_fix_rls_recursion.sql` on a fresh project — its fix is already baked into `0001_init.sql`; `0003` only exists to patch a project that was set up before that fix landed.

**Option B — Supabase SQL editor**

Run the files above, in order, directly in the dashboard's SQL editor.

### 3. Enable the Phone auth provider

Authentication → Providers → **Phone** → enable. This is off by default on new Supabase projects. ACTION runs its own OTP flow (see "How phone auth actually works" below) and never calls Supabase's own SMS-sending path, so if the dashboard asks you to pick an SMS vendor before it lets you save, any selection with placeholder values is fine — only the provider toggle itself matters.

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API. Use the bare project URL (`https://<ref>.supabase.co`) — **do not** append `/rest/v1` or any other path; the client library adds its own paths internally. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (**server-only, never expose**) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally |
| `INVITE_TOKEN_SECRET` | Run `openssl rand -hex 32` and paste the **output** — not the command itself. |
| `CRON_SECRET` | Same as above — also matched automatically by Vercel Cron in production. |
| `SMS_PROVIDER` | `mock` for local dev (default) |
| `SPORTS_DATA_PROVIDER` | `mock` for local dev (default) |
| `SITE_PASSWORD` / `SITE_GATE_SECRET` | Optional. Leave both blank locally. See "Site-wide password gate" below. |

### 5. Run it

```bash
npm run dev
```

Open `http://localhost:3000`. Enter any phone number, and watch your terminal — the mock SMS provider logs the OTP code and, later, invite links straight to the console instead of sending real texts. No Twilio account needed to develop the entire flow, including inviting a "friend": open the logged invite link in a second browser/incognito window and go through the same phone flow with a different number.

### 6. Try the settlement job

The mock sports data provider seeds two already-final games per league so you can see settlement work immediately:

```bash
curl http://localhost:3000/api/cron/settle
```

(In development, this route skips the `CRON_SECRET` check. In production it requires `Authorization: Bearer $CRON_SECRET`, which Vercel sets automatically when `CRON_SECRET` is defined as a project env var.)

---

## Swapping providers

### SMS: mock → Twilio

1. Set `SMS_PROVIDER=twilio`
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

Nothing else changes — `src/lib/sms/index.ts` is the only place that reads `SMS_PROVIDER`.

### Sports data: mock → The Odds API

1. Set `SPORTS_DATA_PROVIDER=the-odds-api`
2. Set `THE_ODDS_API_KEY` (from [the-odds-api.com](https://the-odds-api.com))

`src/lib/sports-data/the-odds-api-provider.ts` implements the exact same `SportsDataProvider` interface as the mock. No call site elsewhere in the app changes. Worth reading the comments in that file before flipping it on in production — it documents a couple of product decisions (which bookmaker's line to use, settlement backfill window) that are currently simplified for MVP.

---

## Settling up (Cash App)

ACTION never holds or moves money — the hard constraint from day one. What it does instead: each user can optionally save a Cash App `$cashtag` on their `/account` page. Once an Action settles, the Action detail page (and, if a phone number is on file, a settlement text) shows the losing side a **"Pay via Cash App"** button that deep-links to `https://cash.app/$cashtag/<amount>` with the stake pre-filled. Tapping it opens Cash App itself — the user reviews and confirms the payment there. ACTION's role stops at generating that link; it never sees the transaction, never touches an API key for money movement, and needs no money-transmitter license because of it.

Relevant code:

- `src/lib/utils/cash-app.ts` — builds the deep link from a cashtag + amount.
- `src/features/account/` — the `/account` page and `updateCashtag` server action, validated by `src/lib/validations/account.ts` (`$` prefix, 1–20 alphanumeric/underscore characters, per Cash App's own `$cashtag` rules).
- `src/app/actions/[actionId]/page.tsx` — the "Settle up" card shown once an Action has a winner and loser.
- `src/app/api/cron/settle/route.ts` — after grading an Action, if the winner has a cashtag and the loser has a phone on file, texts the loser the pay link through the same `SmsProvider` abstraction used for invites (best-effort — a failed text never blocks settlement itself).

If you want real automated transfers instead of a tap-to-confirm link, see `PATH_TO_PRODUCTION.md` for why that requires becoming a licensed money transmitter (or partnering with one) and is out of scope for this MVP.

---

## Site-wide password gate

Independent of the phone-auth system above — this is a single shared password for the *whole app*, meant for keeping a live domain private before it's ready for real users. When both `SITE_PASSWORD` and `SITE_GATE_SECRET` are set, `middleware.ts` redirects every request (except `/coming-soon` itself and the settlement cron) to a `/coming-soon` page until the visitor enters the password, at which point it sets a signed, expiring cookie (`src/lib/utils/site-gate.ts`) and lets them through to the normal phone-auth-gated app.

**To turn it on**: set `SITE_PASSWORD` (any string) and `SITE_GATE_SECRET` (`openssl rand -hex 32`) in Vercel's environment variables, then redeploy.

**To turn it off later**: delete both variables in Vercel and redeploy — the gate is skipped entirely whenever either one is unset, no code changes needed. Don't forget to actually do this before a real launch; it's easy to leave in place by accident.

---

## How phone auth actually works

ACTION runs its **own** OTP flow (`src/features/auth/mutations.ts`) instead of Supabase Auth's built-in phone provider, specifically so the SMS provider stays swappable without touching Supabase project settings. The short version:

1. `requestOtp` generates a 6-digit code, stores its hash in `auth_otp_codes` (a small support table, not one of the seven domain tables), and sends it through the active `SmsProvider`.
2. `verifyOtp` checks the code, then finds-or-creates a Supabase Auth user for that phone number, sets a one-time random password on it server-side, and immediately exchanges it for a real session via `signInWithPassword`. The password never leaves that function or reaches the client.

This means the **Phone** provider must be turned on for your Supabase project — it is **not** on by default. In the dashboard: Authentication → Providers → Phone → enable. If the UI asks you to pick an SMS vendor before it lets you save, any selection is fine (e.g. Twilio with placeholder values) — ACTION never calls Supabase's own `signInWithOtp` send path, so those credentials are never actually used. Only the provider toggle itself matters. You do **not** need to configure a real Twilio integration inside Supabase.

---

## Database

Seven domain tables (`supabase/migrations/0001_init.sql`): `users`, `teams`, `games`, `actions`, `participants`, `action_status_history`, `notifications`. One supporting table (`0002_auth_otp.sql`): `auth_otp_codes`, used only by the phone-auth flow above. `0004_cashtag.sql` adds a nullable `cashtag` column to `users` for the settle-up feature below.

RLS is enabled on every table. Reads from Server Components go through the RLS-scoped client (`src/lib/supabase/server.ts`) and are limited to rows the signed-in user is actually a participant on. Writes that need to reach across users (e.g. creating a participant row for a phone number with no account yet, or the settlement cron updating someone else's Action) go through the service-role client (`src/lib/supabase/admin.ts`) from trusted server code that does its own authorization checks first — that client is marked `server-only` so it can't accidentally end up in a browser bundle.

---

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket and import it in Vercel.
2. Add all the environment variables from `.env.example` in Project Settings → Environment Variables (use production values — a production Supabase project, `SMS_PROVIDER=twilio` if you're ready, a real `NEXT_PUBLIC_APP_URL`).
3. `vercel.json` already defines the settlement cron (`/api/cron/settle`, every 5 minutes). Once `CRON_SECRET` is set as an env var, Vercel automatically sends it as the cron request's `Authorization` header — no extra setup.
4. Run the migration files against your production Supabase project — `0001_init.sql`, `0002_auth_otp.sql`, `0004_cashtag.sql` (SQL editor or `supabase db push`), then `supabase/seed.sql` for team reference data. Only run `0003_fix_rls_recursion.sql` too if this project was already migrated before that fix landed in `0001`.
5. Deploy.

---

## Extending this without a rewrite

The schema and provider interfaces were deliberately kept normalized/generic so these don't require restructuring what's here:

- **Player props** — add a `player` scope to `EventMarket`/`MarketSelection` in the provider layer; `actions.market` already stores an opaque string, so it just needs a new allowed value plus a `players` table.
- **Group Actions / public challenges** — `participants` is already a table keyed by `action_id`, not two FK columns on `actions`. Supporting more than two participants and a `visibility` flag on `actions` is additive.
- **Parlays** — a `parlay_legs` table referencing multiple `(game, market, line)` combinations per Action; `gradeSelection()` in `src/features/actions/lib/settlement.ts` is already a pure function per-leg, so a parlay just aggregates several calls to it.
- **League chat, friend system, leaderboards, wallet/escrow, AI-generated Actions** — none of these are touched by the current schema, so they're new tables/features layered alongside it, not migrations of existing ones.

## Known MVP simplifications

- No automated test suite is included — `gradeSelection()` and the invite token signing/verification are the two places most worth unit-testing first if you add one.
- `createActionAndInvite` performs several sequential inserts rather than a single database transaction (Supabase's JS client doesn't expose multi-statement transactions directly). For production hardening, consider moving that sequence into a Postgres function called via RPC.
- The mock sports data provider's "live" scores are a simple linear interpolation toward the seeded final score, purely for demo purposes.