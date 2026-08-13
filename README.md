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
    api/cron/settle/            Settlement job — grades the sports result (Vercel Cron hits this)
    api/cron/payment-reminders/  Payment nag job — separate from settlement, see "Payment settlement" below
    api/webhooks/stripe/        Stripe webhook — the only source of truth for purchase fulfillment

  features/                One folder per domain area. Each owns its queries,
                            mutations (Server Actions), and components.
    auth/                    Phone OTP, session helpers
    games/                    Search wrapper around SportsDataProvider
    actions/                   The core "Action" (challenge) entity
    notifications/              In-app notifications
    monetization/                Action credits, referrals, paywall UI, Stripe checkout — see "Monetization" below
    settlement/                  Payment settlement state machine, PaymentSettlementCard — see "Payment settlement" below

  lib/
    supabase/                client.ts (browser) / server.ts (RLS-scoped) / admin.ts (service role)
    sms/                     SmsProvider interface + mock + Twilio implementations
    sports-data/              SportsDataProvider interface + mock + The Odds API implementations
    stripe/                   Cached Stripe client singleton
    monetization/              pricing.ts (single source of truth for all prices/quantities), analytics.ts
    settlement/                 copy.ts (playful reminder/nudge copy bank), reminder-schedule.ts (6h/24h/48h config)
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

Or simpler, paste `supabase/migrations/0001_init.sql`, `0002_auth_otp.sql`, `0004_cashtag.sql`, `0005_monetization.sql`, `0006_referral_notification.sql`, `0007_payment_settlement.sql`, and `0008_payment_notification_types.sql` (in that order) into the Supabase SQL editor, then `supabase/seed.sql`. Skip `0003_fix_rls_recursion.sql` on a fresh project — its fix is already baked into `0001_init.sql`; `0003` only exists to patch a project that was set up before that fix landed.

`0006_referral_notification.sql` and `0008_payment_notification_types.sql` each add enum values (`ALTER TYPE ... ADD VALUE`) and must run as their own statement, not batched with other DDL in the same transaction — running each migration file separately (which both options above already do) satisfies this automatically.

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
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys. Use a test-mode key locally. |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks (production) or printed by `stripe listen` (local). See "Monetization" below. |
| `STRIPE_PRICE_ACTION_PACK` / `STRIPE_PRICE_ACTION_PASS` | Price IDs from Stripe → Product catalog. See "Monetization" below. |

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

## Payment settlement

ACTION never holds or moves money — the hard constraint from day one. As of this feature, it also doesn't facilitate the transfer itself in any way (no deep links, no payment provider integration in the active flow — see "Cash App (dormant)" below for what changed and why). What it tracks instead is a **social settlement status**, deliberately kept separate from the sports result: whether the bet won is one fact (`actions.status`); whether the loser says they've paid is a completely different one (`actions.payment_status`). A push or a cancelled Action always has `payment_status = 'not_applicable'` — nobody owes anything, so no reminders ever fire for it.

**State machine** (`payment_settlement_status`):

```
not_applicable                         (default; terminal — pushes/cancels/expires)
owed → marked_paid → settled           (terminal)
              ↘ disputed → settled     (winner can confirm directly once resolved off-app)
```

Every transition happens inside a `SECURITY DEFINER` Postgres function (`supabase/migrations/0007_payment_settlement.sql`) that takes a per-Action advisory lock, checks the caller's role (loser can mark paid, only the winner can confirm/dispute/nudge), checks the current state is valid for that transition, and logs an immutable event row — `payment_settlement_events` is the append-only audit trail this whole feature (and eventually a Rivalry/Recap feature) reads from. Nothing writes to `payment_status` or that table directly from application code.

**The loop, once an Action resolves with a winner and loser:**

1. The settlement cron (`/api/cron/settle`) grades the sports result as before, then calls `settlement_mark_owed` if there's a stake — this fires a "Well, shit, you owe X" / "You got him, X owes you" notification pair, separate from the existing win/loss result notification.
2. The loser taps **Mark as Paid** (or **I need a minute**, which does nothing server-side — just a beat of humor) → `payment_status` becomes `marked_paid`, winner is notified.
3. The winner taps **Confirm Received** (→ `settled`) or **Didn't Receive It** (→ `disputed`, shown as a neutral "Payment not confirmed" to both sides — ACTION doesn't adjudicate; the winner can still confirm later once it's sorted out between them).

**Automatic reminders**, via a second cron (`/api/cron/payment-reminders`, same 5-minute cadence as `/api/cron/settle` — see `vercel.json`): while `payment_status = 'owed'`, sends one playful nudge at 6h, 24h, and 48h after the Action resolved, then stops for good. Each level fires at most once per Action (enforced by a partial unique index, so an overlapping cron run can't double-send) and only the highest threshold crossed goes out on any given run, so a missed run doesn't burst-send several at once. Change the hours in `src/lib/settlement/reminder-schedule.ts` — nothing else hard-codes them.

**Manual nudges**: the winner can also tap **Nudge** any time payment is owed, rate-limited to one per 12 hours per Action (enforced in `settlement_record_nudge`, not just in the UI). On cooldown the button shows "Next nudge available in Xh" instead of erroring silently.

**Copy**: every reminder/nudge line is picked randomly from a small pool in `src/lib/settlement/copy.ts`, along with the "Well, shit"/"You got him" result copy and the mark-paid/confirmed/disputed notification text. Edit or add lines there — nothing settlement-related is hard-coded at any call site. All in-app only for now (uses the existing `notifications` table/bell, not SMS) — the reminder *event* and the delivery *channel* are kept as separate concepts specifically so a later change (e.g. SMS for the 48h level) doesn't require touching any settlement logic.

**Future-proofing**: no reputation/rivalry UI is built yet, but every timestamp a future "Race vs. Mike, 42–37, all debts settled ✓" feature would need is already being recorded — `payment_settlement_events` per Action, `actions.resolved_at` as the "became owed" moment, `actions.status` + `stake_amount` for win/loss/amount math. That data can be aggregated later without another migration.

Relevant code: `supabase/migrations/0007_payment_settlement.sql` (schema + RPCs), `0008_payment_notification_types.sql` (new notification enum values), `src/features/settlement/` (mutations, RPC wrappers, the `PaymentSettlementCard` component), `src/lib/settlement/` (copy bank, reminder schedule config), `src/app/api/cron/payment-reminders/route.ts`.

### Cash App (dormant)

The previous version of this feature deep-linked the loser straight to `cash.app/$cashtag/<amount>` to actually initiate payment. That's been removed from the active flow — Action now only tracks whether participants *say* they've paid, never facilitates the transfer itself. The old code wasn't deleted, since it was already cleanly isolated: `src/lib/utils/cash-app.ts` (the pure link-builder), the `cashtag` column on `users`, and `src/features/account/` (the `updateCashtag` mutation + `CashtagForm` component) are all still in the repo, just no longer called from anywhere. To restore it: re-add the `<CashtagForm>` card to `/account`'s page, and re-add a call to `buildCashAppPayLink()` wherever you want the pay link surfaced again (it previously lived in the settlement cron and on the Action detail page).

If you want real automated transfers instead, see `PATH_TO_PRODUCTION.md` for why that requires becoming a licensed money transmitter (or partnering with one) and is out of scope for this MVP.

---

## Monetization (Action credits, referrals, Stripe)

**Accepting an Action is always free.** The only thing ACTION ever charges for is *creating* a new Action — receiving, accepting, declining, and viewing Actions never cost anything and never check entitlement. This is a completely separate concept from the Cash App settle-up flow above: Stripe payments here buy access to the app itself, never a stake, and ACTION still never holds, moves, or escrows wager money.

### How it works

- **Free tier** — every new user gets 3 free Action creations for life (not monthly), granted once on signup (`verifyOtp` in `src/features/auth/mutations.ts`).
- **Referrals** — invite someone who isn't on ACTION yet; once they create an account and accept their *first* Action (any Action, not necessarily the one they were invited to), the inviter gets +1 free Action. First-touch attribution: whoever invites a phone number first keeps it, enforced by a unique constraint, not app logic.
- **Action Pack** — one-time purchase, +5 Action credits, no expiration.
- **30-Day Action Pass** — one-time purchase, unlimited Action creation for 30 days. Not a subscription — no auto-renewal, no recurring charge. While active, creating Actions doesn't touch stored credits.
- **Ledger, not a counter** — `action_credit_transactions` is an append-only table (`starter_grant`, `referral_reward`, `action_pack_purchase`, `action_created`, `admin_adjustment`); the current balance is always `sum(amount)`, never a stored/mutable field. This is deliberate, for auditability — you can always reconstruct exactly why a user has the balance they have.
- **Authorization is server-side and race-safe** — every Action creation calls the `consume_action_credit_or_pass` Postgres function (`supabase/migrations/0005_monetization.sql`), which takes an advisory lock per user before checking for an active pass or spending a credit. Two simultaneous requests from a user with exactly one credit cannot both succeed.
- **Stripe is fulfillment-by-webhook only** — reaching the Checkout success URL never grants anything by itself; only a verified `checkout.session.completed` webhook event does (`src/app/api/webhooks/stripe/route.ts`). Both an event-id dedup table and a unique constraint on the Checkout Session ID make replayed webhooks safe to re-deliver.

### Changing pricing later

Everything — free-tier size, referral reward, pack size/price, pass duration/price — lives in one file: `src/lib/monetization/pricing.ts`. Change a number there and the paywall UI, checkout amounts (once you also update the matching Stripe Price, see below), and copy all follow. Nothing else in the codebase hard-codes these values.

Note that changing `priceCents` in `pricing.ts` alone does **not** change what Stripe actually charges — Stripe Prices are immutable once created. To change an amount, create a new Price on the existing Product in Stripe, update `STRIPE_PRICE_ACTION_PACK`/`STRIPE_PRICE_ACTION_PASS` to the new Price ID, and update `priceDisplay`/`priceCents` in `pricing.ts` to match (the display value isn't read from Stripe — keep the two in sync by hand).

### Stripe setup

1. Create a Stripe account (or use an existing one) and switch to **test mode** for development.
2. Developers → API keys → copy the **Secret key** into `STRIPE_SECRET_KEY`.
3. Product catalog → create two products, each with one one-time (not recurring) Price:
   - "5 Actions" — $1.99 USD, one-time.
   - "30-Day Action Pass" — $3.99 USD, one-time.
4. Copy each Price's ID (`price_...`, not the Product ID) into `STRIPE_PRICE_ACTION_PACK` and `STRIPE_PRICE_ACTION_PASS`.
5. Repeat steps 3–4 in **live mode** with real prices before taking real payments, and use live-mode keys/price IDs in Vercel's production environment variables.

### Webhook setup

**Local development** — use the Stripe CLI to forward events to your dev server:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` prints a webhook signing secret (`whsec_...`) each time it starts — copy that into `STRIPE_WEBHOOK_SECRET` in `.env.local` and restart `npm run dev`. Trigger a test purchase end to end with Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

**Production (Vercel)** — Stripe dashboard → Developers → Webhooks → Add endpoint:
- Endpoint URL: `https://<your-domain>/api/webhooks/stripe`
- Events to send: `checkout.session.completed`

After creating it, copy that endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET` as a Vercel production environment variable, then redeploy.

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

Seven domain tables (`supabase/migrations/0001_init.sql`): `users`, `teams`, `games`, `actions`, `participants`, `action_status_history`, `notifications`. One supporting table (`0002_auth_otp.sql`): `auth_otp_codes`, used only by the phone-auth flow above. `0004_cashtag.sql` adds a nullable `cashtag` column to `users`, now dormant (see "Cash App (dormant)" above). `0005_monetization.sql` adds six more: `purchases`, `action_passes`, `action_credit_transactions`, `referrals`, `stripe_webhook_events`, `analytics_events` — see "Monetization" above. `0006_referral_notification.sql` adds one enum value for the referral-reward notification. `0007_payment_settlement.sql` adds `actions.payment_status` and the `payment_settlement_events` table — see "Payment settlement" above. `0008_payment_notification_types.sql` adds five enum values for payment notifications.

RLS is enabled on every table. Reads from Server Components go through the RLS-scoped client (`src/lib/supabase/server.ts`) and are limited to rows the signed-in user is actually a participant on. Writes that need to reach across users (e.g. creating a participant row for a phone number with no account yet, or the settlement cron updating someone else's Action) go through the service-role client (`src/lib/supabase/admin.ts`) from trusted server code that does its own authorization checks first — that client is marked `server-only` so it can't accidentally end up in a browser bundle.

---

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket and import it in Vercel.
2. Add all the environment variables from `.env.example` in Project Settings → Environment Variables (use production values — a production Supabase project, `SMS_PROVIDER=twilio` if you're ready, a real `NEXT_PUBLIC_APP_URL`, live-mode Stripe keys/price IDs).
3. `vercel.json` already defines both cron jobs — settlement grading (`/api/cron/settle`) and payment reminders (`/api/cron/payment-reminders`), both every 5 minutes. Once `CRON_SECRET` is set as an env var, Vercel automatically sends it as each cron request's `Authorization` header — no extra setup.
4. Run the migration files against your production Supabase project, in order — `0001_init.sql`, `0002_auth_otp.sql`, `0004_cashtag.sql`, `0005_monetization.sql`, `0006_referral_notification.sql`, `0007_payment_settlement.sql`, `0008_payment_notification_types.sql` (SQL editor or `supabase db push`), then `supabase/seed.sql` for team reference data. Only run `0003_fix_rls_recursion.sql` too if this project was already migrated before that fix landed in `0001`.
5. Create the Stripe webhook endpoint (see "Monetization" → "Webhook setup" above) pointing at your production domain, and set `STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret.
6. Deploy.

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