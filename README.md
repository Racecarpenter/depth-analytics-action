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
    actions/new/               Game search + type selector (Sports / Custom)
    actions/new/[gameId]/       Market + side + stake + invite (Sports)
    actions/new/custom/          Title + stake + N invites (Custom)
    actions/[actionId]/         Action detail (immutable once accepted) — branches on action_type
    invite/[token]/             Invite accept/decline (works signed-out)
    api/cron/settle/            Settlement job — grades the sports result (Vercel Cron hits this); Sports Actions only
    api/cron/payment-reminders/  Payment nag job — obligation-scoped, see "Payment settlement" below
    api/webhooks/stripe/        Stripe webhook — the only source of truth for purchase fulfillment

  features/                One folder per domain area. Each owns its queries,
                            mutations (Server Actions), and components.
    auth/                    Phone OTP, session helpers
    games/                    Search wrapper around SportsDataProvider
    actions/                   The core "Action" (challenge) entity — shared by Sports and Custom
    custom-actions/              Custom Action creation, voting/consensus, proof photos — see "Custom Actions" below
    notifications/              In-app notifications
    monetization/                Action credits, referrals, paywall UI, Stripe checkout — see "Monetization" below
    settlement/                  Payment settlement state machine, obligation-scoped — see "Payment settlement" below

  lib/
    supabase/                client.ts (browser) / server.ts (RLS-scoped) / admin.ts (service role)
    sms/                     SmsProvider interface + mock + Twilio implementations
    sports-data/              SportsDataProvider interface + mock + The Odds API implementations
    stripe/                   Cached Stripe client singleton
    monetization/              pricing.ts (single source of truth for all prices/quantities), analytics.ts
    settlement/                 copy.ts (playful reminder/nudge copy bank), reminder-schedule.ts (6h/24h/48h config)
    validations/              Zod schemas
    utils/                    Small, boring helpers (phone, currency, odds, date, cn, compress-image)

  components/               Cross-feature, generic UI (Button, Card, Input, AppHeader, ...)
  types/database.types.ts   Hand-authored types mirroring the Supabase schema
```

**Why two provider interfaces?** `SportsDataProvider` (schedules/odds/results) and `SmsProvider` (sending texts) are the two things this MVP genuinely can't control the shape of long-term — one vendor today might not be the vendor in six months. Everything else talks to those interfaces, never to a concrete implementation, so swapping either one is a one-line env var change (see below).

**Why is `games` a table if there's a provider abstraction?** Providers own schedule/odds/score data; `games`/`teams` are a normalized, lazily-populated mirror of whatever the active provider returns, built the moment someone selects a game (`src/features/actions/lib/sync-game.ts`). Actions reference the DB row, not the provider directly, so an Action's game details stay stable even if a provider's API changes shape later.

**Why does `actions.status` sometimes read backwards for one person?** Status is stored canonically from the creator's point of view (`won` means the creator won). `personalStatus()` in `src/features/actions/types.ts` flips `won`/`lost` for the opponent so every screen can just ask "did I win" — see it used in the home screen grouping and `ActionCard`. Custom Actions never use `won`/`lost` at all — they resolve straight to `resolved` (same value for everyone), so this flip is a no-op for them.

**One discriminator, not scattered branching.** `actions.action_type` (`'sports' | 'custom'`) is the only place the two kinds of Action are distinguished at the schema level. Everything downstream of "who won" — `getResolution()`, the settlement obligations, notifications, `PaymentSettlementCard`/`ObligationList` — reads `actions.winner_participant_id`, which both the sports grading cron and the Custom Action consensus RPC set the same way, and never branches on `action_type` at all. The only files that actually check `action_type` are the ones that have to render genuinely different UI or enforce genuinely different rules: the Action detail page, `ActionCard`, and the two creation RPCs. See "Custom Actions" below.

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

Or simpler, paste these files into the Supabase SQL editor in order, then `supabase/seed.sql`: `0001_init.sql`, `0002_auth_otp.sql`, `0004_cashtag.sql`, `0005_monetization.sql`, `0006_referral_notification.sql`, `0007_payment_settlement.sql`, `0008_payment_notification_types.sql`, `0009_custom_actions.sql`, `0010_custom_action_status.sql`, `0011_settlement_obligations.sql`, `0012_custom_action_storage.sql`, `0013_custom_action_voting.sql`. Skip `0003_fix_rls_recursion.sql` on a fresh project — its fix is already baked into `0001_init.sql`; `0003` only exists to patch a project that was set up before that fix landed.

`0006_referral_notification.sql` and `0008_payment_notification_types.sql` each add enum values (`ALTER TYPE ... ADD VALUE`) and must run as their own statement, not batched with other DDL in the same transaction — running each migration file separately (which both options above already do) satisfies this automatically. `0010_custom_action_status.sql` is split out from `0009_custom_actions.sql` for the same reason (adds the `'resolved'` status value on its own).

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

ACTION never holds or moves money — the hard constraint from day one. It also doesn't facilitate the transfer itself in any way (no deep links, no payment provider integration in the active flow — see "Cash App (dormant)" below for what changed and why). What it tracks instead is a **social settlement status**, deliberately kept separate from the sports/custom result: whether an Action was won is one fact (`actions.status`); whether someone says they've paid is a completely different one, tracked per debtor-creditor pair.

**The settlement unit is an obligation, not an Action.** `settlement_obligations` (`supabase/migrations/0011_settlement_obligations.sql`) holds one row per debtor→creditor relationship — always exactly one for a 2-participant Sports Action, up to seven for an 8-person winner-take-all Custom Action. This is what lets a Custom Action's losers settle, get reminded, and get nudged completely independently: Race paying his $20 never touches Chris's reminder schedule or nudge cooldown, because they're different rows. `actions.payment_status` still exists, but it's now a derived rollup — `not_applicable` if there are no obligations (a push, a cancelled Action, or nothing resolved yet), `settled` only once every obligation is, `disputed`/`marked_paid`/`owed` otherwise — recomputed by `recompute_action_payment_status()` after every obligation transition. Nothing reads it as the source of truth; it exists for the home-screen status pill.

**State machine** (per obligation, `payment_settlement_status`):

```
owed → marked_paid → settled           (terminal)
         ↘ disputed → settled          (winner can confirm directly once resolved off-app)
```

Every transition happens inside a `SECURITY DEFINER` Postgres function that takes a per-obligation advisory lock, checks the caller's role (the debtor can mark paid, only the creditor can confirm/dispute/nudge), checks the current state is valid for that transition, and logs an immutable event row — `payment_settlement_events` (now keyed by `obligation_id`, not `action_id`) is the append-only audit trail this whole feature (and eventually a Rivalry/Recap feature) reads from. Nothing writes to `payment_status` or that table directly from application code.

**The loop, once an Action resolves with a winner:**

1. `settlement_create_obligations(action_id, winner_participant_id)` creates one `owed` obligation per non-winning accepted participant — called from the sports settlement cron (`/api/cron/settle`) after grading, and from `submitCustomActionVote` the moment a Custom Action vote goes unanimous. Each new obligation fires its own "Well, shit, you owe X" / "You got him, X owes you" notification pair.
2. The debtor taps **Mark as Paid** (or **I need a minute** on the full single-obligation card, which does nothing server-side — just a beat of humor) → that obligation becomes `marked_paid`, the creditor is notified.
3. The creditor taps **Confirm Received** (→ `settled`) or **Didn't Receive It** (→ `disputed`, shown as a neutral "Payment not confirmed" to both sides — ACTION doesn't adjudicate; the creditor can still confirm later once it's sorted out between them).

**Two UIs, same mutations.** `PaymentSettlementCard` (`src/features/settlement/components/`) is the full-treatment single-obligation experience — used for Sports Actions, which always have exactly one obligation. `ObligationList`/`ObligationRow` is the compact multi-row list for Custom Actions ("Race — Settled ✓ / Zane — $20 owed / Chris — Marked Paid") — same four mutations (`markActionPaid`, `sendNudge`, `disputePaymentReceipt`, `confirmPaymentReceived`), just lighter per-row UI, with action buttons only shown to whichever participant they actually belong to on that row.

**Automatic reminders**, via a second cron (`/api/cron/payment-reminders`, same 5-minute cadence as `/api/cron/settle` — see `vercel.json`): for every obligation with `payment_status = 'owed'`, sends one playful nudge at 6h, 24h, and 48h after that obligation was created, then stops for good. Each level fires at most once per obligation (enforced by a partial unique index scoped to `obligation_id`, so an overlapping cron run can't double-send) and only the highest threshold crossed goes out on any given run. Change the hours in `src/lib/settlement/reminder-schedule.ts` — nothing else hard-codes them.

**Manual nudges**: the creditor can also tap **Nudge** any time an obligation is owed, rate-limited to one per 12 hours *per obligation* (enforced in `settlement_record_nudge`, not just in the UI) — so in a Custom Action, nudging one loser doesn't put the others on cooldown. On cooldown the button shows "Next nudge available in Xh" instead of erroring silently.

**Copy**: every reminder/nudge line is picked randomly from a small pool in `src/lib/settlement/copy.ts`, along with the "Well, shit"/"You got him" result copy and the mark-paid/confirmed/disputed notification text. Edit or add lines there — nothing settlement-related is hard-coded at any call site. All in-app only for now (uses the existing `notifications` table/bell, not SMS) — the reminder *event* and the delivery *channel* are kept as separate concepts specifically so a later change (e.g. SMS for the 48h level) doesn't require touching any settlement logic.

**Future-proofing**: no reputation/rivalry UI is built yet, but every timestamp a future "Race vs. Mike, 3–1 all-time, all debts settled ✓" feature would need is already being recorded — one `settlement_obligations` row per debtor-creditor pair per Action (so Mike beating three different people nets three separate +$20 relationships, never a single +$60 blob), `payment_settlement_events` per obligation, `actions.resolved_at`. That data can be aggregated later without another migration.

Relevant code: `supabase/migrations/0007_payment_settlement.sql` + `0011_settlement_obligations.sql` (schema + RPCs), `0008_payment_notification_types.sql` (new notification enum values), `src/features/settlement/` (mutations, RPC wrappers, `PaymentSettlementCard`, `ObligationList`), `src/lib/settlement/` (copy bank, reminder schedule config), `src/app/api/cron/payment-reminders/route.ts`.

### Cash App (dormant)

The previous version of this feature deep-linked the loser straight to `cash.app/$cashtag/<amount>` to actually initiate payment. That's been removed from the active flow — Action now only tracks whether participants *say* they've paid, never facilitates the transfer itself. The old code wasn't deleted, since it was already cleanly isolated: `src/lib/utils/cash-app.ts` (the pure link-builder), the `cashtag` column on `users`, and `src/features/account/` (the `updateCashtag` mutation + `CashtagForm` component) are all still in the repo, just no longer called from anywhere. To restore it: re-add the `<CashtagForm>` card to `/account`'s page, and re-add a call to `buildCashAppPayLink()` wherever you want the pay link surfaced again (it previously lived in the settlement cron and on the Action detail page).

If you want real automated transfers instead, see `PATH_TO_PRODUCTION.md` for why that requires becoming a licensed money transmitter (or partnering with one) and is out of scope for this MVP.

---

## Custom Actions

A Custom Action is a winner-take-all group challenge about anything — "Lowest score at Papago wins," $20/person, up to 8 players — resolved by **unanimous participant vote**, not a sports data provider. It reuses everything else an Action already has: invitation, monetization (still exactly 1 credit per Action, regardless of participant count), notifications, and — as of the obligation generalization above — the entire payment settlement system.

**Creating one** (`src/features/custom-actions/mutations.ts`, `createCustomActionAndInvite`): one title, one equal stake per person, 2-8 total participants. Every invited phone lands on the *same* Action row (never separate pairwise Actions) — the creator auto-accepts, everyone else is `invited`, exactly like Sports.

**Activation is all-or-nothing.** The Action shows a visible acceptance checklist ("Race ✓ / Mike ✓ / Zane — Waiting") to everyone while it's `pending`. `respondToInvite` only flips `actions.status` to `accepted` once *every* invitee has accepted — at which point title, stake, and participants are immutable, same as a Sports Action locking after acceptance. If anyone declines before that, the whole Action cancels; there's no partial rebuild in V1.

**Pot vs. profit.** The Action detail page and the create form both show gross pot (`stake × participants`) next to what the eventual winner actually nets (`stake × (participants - 1)`) — kept as two separate numbers on purpose so a future Rivalry/Recap feature can report accurate per-person profit/loss rather than back-deriving it from the pot.

**Voting** (`submit_custom_action_vote` / `revote_custom_action`, `supabase/migrations/0013_custom_action_voting.sql`): opens immediately once the Action is fully active — no separate "start voting" step. Each participant independently submits who they think won; the RPC never returns anyone else's individual pick, only aggregate `all_voted`/`unanimous` — so there is no way for the UI to leak "Race picked Mike" to someone who hasn't voted yet, even in dev tools. Self-votes are valid and get no special treatment.

- **Unanimous** → `actions.status` flips straight to `resolved`, `winner_participant_id` is set, everyone gets a "Results are in / 🏆 Winner" notification, and `settlement_create_obligations` fires — from here it's the identical Pay Up flow described above, just with an `ObligationList` instead of a single `PaymentSettlementCard` once there's more than one loser.
- **Not unanimous** → the round stays open on the Action, and once everyone's voted the app shows a disagreement tally ("Mike — 3 votes, Chris — 1 vote") with a **Revote** button. Any participant can trigger a revote (not creator-privileged) — it bumps `actions.voting_round` and opens a fresh round; every prior round's votes stay in `custom_action_votes` for audit, keyed by `(action_id, round, voter_participant_id)`.

**Proof photos** are optional, one per submission, informational only — they never auto-determine a winner, that's still exclusively unanimous vote. Uploaded to a private Supabase Storage bucket (`custom-action-proof`, `supabase/migrations/0012_custom_action_storage.sql`) at `{actionId}/{participantId}.ext`, downscaled client-side to a max 1600px edge before upload (`src/lib/utils/compress-image.ts` — this is why no server-side image library like `sharp` was added), and re-validated server-side for type/size regardless of what the client claims. Storage RLS restricts read/write to participants on that specific Action, matched against the path segments.

**What's deliberately out of V1**: custom payouts, multiple winners, teams, split pots, odds, unequal stakes, ranked finishes, ties, majority-rule resolution, creator/admin arbitration, groups bigger than 8, public/spectator Actions, in-app chat, video proof. All additive later, not migrations of what's here.

**Why one discriminator instead of `if (action_type === "custom")` everywhere**: see the architecture note above. `winner_participant_id` is the only thing `getResolution()` reads, set identically by the sports cron and `submit_custom_action_vote`; the settlement layer is entirely obligation-based and has never heard of `action_type` at all. The only places that actually branch on it are the two creation flows and the Action detail page / `ActionCard`, because those two truly do need different UI (matchup + market vs. title + participant list).

Relevant code: `supabase/migrations/0009_custom_actions.sql` (schema), `0010_custom_action_status.sql` (`resolved` status), `0012_custom_action_storage.sql` (Storage bucket + RLS), `0013_custom_action_voting.sql` (voting RPCs), `src/features/custom-actions/` (mutations, RPC wrappers, queries, voting/acceptance/reveal components), `src/app/actions/new/custom/`.

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

`0009_custom_actions.sql` adds `action_type`, `title`, `winner_participant_id`, and `voting_round` to `actions` (and drops the old 2-participant-only constraints/NOT NULLs that assumed every Action was a sports matchup), plus the `custom_action_votes` table — see "Custom Actions" above. `0010_custom_action_status.sql` adds the `resolved` status value on its own, per the enum-value-needs-its-own-transaction rule above. `0011_settlement_obligations.sql` is the big one: adds `settlement_obligations` (one row per debtor→creditor pair, replacing the old assumption that an Action has exactly one loser), backfills it from every existing `actions.payment_status`/`payment_settlement_events` row, and rewrites all six settlement RPCs to be obligation-scoped instead of Action-scoped — see "Payment settlement" above. `0012_custom_action_storage.sql` creates the private `custom-action-proof` Storage bucket + RLS policies. `0013_custom_action_voting.sql` adds the two voting RPCs.

RLS is enabled on every table. Reads from Server Components go through the RLS-scoped client (`src/lib/supabase/server.ts`) and are limited to rows the signed-in user is actually a participant on. Writes that need to reach across users (e.g. creating a participant row for a phone number with no account yet, or the settlement cron updating someone else's Action) go through the service-role client (`src/lib/supabase/admin.ts`) from trusted server code that does its own authorization checks first — that client is marked `server-only` so it can't accidentally end up in a browser bundle.

---

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket and import it in Vercel.
2. Add all the environment variables from `.env.example` in Project Settings → Environment Variables (use production values — a production Supabase project, `SMS_PROVIDER=twilio` if you're ready, a real `NEXT_PUBLIC_APP_URL`, live-mode Stripe keys/price IDs).
3. `vercel.json` already defines both cron jobs — settlement grading (`/api/cron/settle`) and payment reminders (`/api/cron/payment-reminders`), both every 5 minutes. Once `CRON_SECRET` is set as an env var, Vercel automatically sends it as each cron request's `Authorization` header — no extra setup.
4. Run the migration files against your production Supabase project, in order — `0001_init.sql`, `0002_auth_otp.sql`, `0004_cashtag.sql`, `0005_monetization.sql`, `0006_referral_notification.sql`, `0007_payment_settlement.sql`, `0008_payment_notification_types.sql`, `0009_custom_actions.sql`, `0010_custom_action_status.sql`, `0011_settlement_obligations.sql`, `0012_custom_action_storage.sql`, `0013_custom_action_voting.sql` (SQL editor or `supabase db push`), then `supabase/seed.sql` for team reference data. Only run `0003_fix_rls_recursion.sql` too if this project was already migrated before that fix landed in `0001`.
5. Create the Stripe webhook endpoint (see "Monetization" → "Webhook setup" above) pointing at your production domain, and set `STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret.
6. Deploy.

---

## Extending this without a rewrite

The schema and provider interfaces were deliberately kept normalized/generic so these don't require restructuring what's here:

- **Player props** — add a `player` scope to `EventMarket`/`MarketSelection` in the provider layer; `actions.market` already stores an opaque string, so it just needs a new allowed value plus a `players` table.
- **Group Actions / public challenges** — done for private groups as Custom Actions (see above); `participants` was already a table keyed by `action_id`, not two FK columns on `actions`, which is exactly what made 2→8 participants additive rather than a rewrite. A `visibility` flag on `actions` plus relaxing the "everyone must accept" RLS/status logic is what's left for fully public/spectator Actions.
- **Custom payouts / multiple winners / split pots / unequal stakes** — `settlement_obligations` already supports arbitrary debtor→creditor amounts (it's not hard-coded to `stake_amount` split evenly), so most of this is a Custom Action creation-form and consensus-RPC change, not a settlement-layer one.
- **Parlays** — a `parlay_legs` table referencing multiple `(game, market, line)` combinations per Action; `gradeSelection()` in `src/features/actions/lib/settlement.ts` is already a pure function per-leg, so a parlay just aggregates several calls to it.
- **League chat, friend system, leaderboards, wallet/escrow, AI-generated Actions** — none of these are touched by the current schema, so they're new tables/features layered alongside it, not migrations of existing ones.

## Known MVP simplifications

- No automated test suite is included — `gradeSelection()` and the invite token signing/verification are the two places most worth unit-testing first if you add one.
- `createActionAndInvite` / `createCustomActionAndInvite` perform several sequential inserts rather than a single database transaction (Supabase's JS client doesn't expose multi-statement transactions directly). For production hardening, consider moving that sequence into a Postgres function called via RPC.
- The mock sports data provider's "live" scores are a simple linear interpolation toward the seeded final score, purely for demo purposes.
- Custom Action proof photos are attached to a submission but never surfaced back in the UI after the reveal — they're stored and retrievable (`getProofPhotoUrl`), just not wired into a gallery view yet. Add one to the resolved-Action view if you want them visible after the fact.
- Declining a Custom Action invite cancels the whole Action (no partial rebuild/backfill of a replacement participant) — same simplicity trade-off as a 2-person Sports Action, just more consequential the more people are already in.