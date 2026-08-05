# Path to Production

Steps to take ACTION from "working on my laptop with mock providers" to "real games, real texts, real people testing it." Written in the order you'd actually do them — each section assumes the previous one is done.

---

## 1. Real sports data: The Odds API

1. Sign up at [the-odds-api.com](https://the-odds-api.com) and grab an API key. The free tier is 500 requests/month — fine for testing with a handful of Actions, but know how usage is counted before you rely on it (see "Watching your quota" below).
2. Set `SPORTS_DATA_PROVIDER=the-odds-api` and `THE_ODDS_API_KEY=...` in your Vercel project's environment variables.
3. Read `src/lib/sports-data/the-odds-api-provider.ts` before flipping this on — the comments there flag two decisions that are currently simplified for the mock and need a real answer:
   - **Which bookmaker's line to use.** The provider currently just takes whichever bookmaker the API returns first. Pick one deliberately (DraftKings and FanDuel are the most consistently available) so lines are predictable.
   - **Settlement backfill window.** The Odds API's `/scores` endpoint only looks back a few days. If the cron job is ever down for longer than that, games that finished during the outage won't have a result to grade against. Decide what "we missed it" should do — flag it for manual review is the safe default — and add that path.
4. Test with a handful of real, currently-scheduled games before opening it up: create an Action against a real upcoming game, let it go live, let it finish, confirm the cron job grades it correctly. Do this for at least one moneyline, one spread, and one total, since the grading math (`src/features/actions/lib/settlement.ts`) is the part you most want to trust before anyone has real money-adjacent expectations riding on it.
5. Compare a few real lines against what you'd see on a sportsbook site, just as a sanity check that the moneyline → probability → spread math in the mock isn't the only thing you've ever tested against.

**Watching your quota.** The Odds API meters usage as `markets × regions` credits per call, except the `/events` endpoint (schedule/status only, no odds), which is always free. The settlement cron (`src/app/api/cron/settle/route.ts`) runs on every tick for every open Action, so it's built to stay cheap there: `getEvent()` — checking whether a game has gone live — only ever calls the free `/events` endpoint. `getGameResult()` — checking the final score — does cost credits (`/scores` is metered), but only runs once per Action, on the tick where it detects the game is final, and only for that Action's own league (both `getEvent` and `getGameResult` accept a `league` hint so they hit one league-scoped call instead of sweeping all four). The one remaining hot spot is `searchEvents()`, used by the create-Action search box — each keystroke, if unthrottled, costs `3 markets × 1 region` = 3 credits per league searched. Debounce that search input (or add a minimum-character threshold) before you open the create flow up to real users; it's the only place left that scales with usage instead of with open Actions.

## 2. Real SMS: Twilio

1. Create a Twilio account and buy a phone number.
2. **Register for A2P 10DLC before you send a single real text.** This is the part that trips people up: US carriers now require "Application-to-Person" traffic on long-code numbers to go through Twilio's A2P 10DLC registration (brand + campaign), or your messages get filtered/blocked with no clear error. Approval can take anywhere from same-day to a couple of weeks depending on carrier review. Start this **before** you need it, not the day you want to launch. Alternative: a Twilio Toll-Free number, which has a lighter (but still real) verification process and can be faster to stand up for a small-scale launch.
3. Set `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in Vercel.
4. `src/lib/sms/twilio.ts` is already wired to the same `SmsProvider` interface as the mock, so no app code changes — but send yourself a handful of test invites and OTP codes first, from a couple of different real carriers if you can (Verizon/AT&T/T-Mobile filter differently), before trusting it for other people.
5. **Add rate limiting before this goes live.** Right now `requestOtp` (`src/features/auth/mutations.ts`) will send a code to literally any phone number, as often as it's asked, with no cooldown. That's fine against the mock provider (it just logs to console) but turns into a real cost and abuse vector — someone could SMS-bomb an arbitrary number — the moment it's wired to Twilio. Minimum viable fix: a per-phone cooldown (e.g. one request per 60 seconds) enforced against the `auth_otp_codes` table you already have, plus a coarser per-IP limit if you're worried about scripted abuse. This is worth doing before step 2 above, not after.

## 3. Production hardening

- **Secrets.** Generate fresh `INVITE_TOKEN_SECRET` and `CRON_SECRET` values for production — don't reuse whatever you used locally. `openssl rand -hex 32` for both, set them directly in Vercel's environment variables (not committed anywhere).
- **Supabase project.** Use a separate Supabase project for production, not the one you've been developing against — you don't want dev testing data (or the auth users you created while debugging) showing up in front of real users. Re-run the three migration files and the team seed against the fresh project.
- **RLS review.** The RLS recursion bug you already hit and fixed (migration `0003`) is a good reminder to actually exercise these policies as a non-admin user before launch, not just trust they're right. Worth a quick pass: sign in as two different real accounts, confirm each can only see their own Actions and can't read the other's phone-adjacent data beyond what's intended.
- **Cron monitoring.** Vercel Cron doesn't retry failed runs by default and its logs roll off — if the settlement job silently fails for a few days, Actions just sit in "live" forever with no alert. Worth wiring up something that pages you if `/api/cron/settle` starts erroring (a simple approach: have the route report its own summary to a Slack webhook or similar on every run).
- **Error tracking.** Something like Sentry (or Vercel's own observability) wired into both the app and the cron route, so a failure shows up somewhere other than "a user tells you it's broken."
- **Domain.** The brief specs `depthanalytics.action` — `.action` is a real gTLD, but double check it's actually registerable/available and that your registrar supports it before you build marketing/README references around it.

## 4. Real-world beta

- Start with a closed group — five to ten people you know, on real phone numbers, betting on real games happening that week. This is small enough that you can watch every Action move through its lifecycle by hand.
- Specifically watch for the schedule edge cases the mock provider doesn't have to deal with: doubleheaders, postponed/rained-out games, games that go to overtime past when you expected `getGameResult` to have an answer, and the actual behavior of the OTP flow on real phones with real carrier SMS delays (occasionally several minutes, not always instant).
- Get a **Terms of Service and Privacy Policy** live before real people's phone numbers touch this — you're now storing and texting real PII, which is a different bar than a personal dev database. This applies regardless of whether you build the payment feature discussed below.
- **Talk to a lawyer before this goes wider than a closed beta with people you know**, specifically about how "Users agree on a stake amount, ACTION tracks who won" is treated in the states you expect users to be in. The current product deliberately never touches money, which is the right instinct — but "peer-to-peer challenge on a sports outcome with an agreed dollar stake" is close enough to the legal definition of a wager in a number of states that it's worth a real opinion before scaling past friends-testing-a-side-project, independent of anything below.

---

## A note on the payment feature

You asked about wiring up a real payment app (Cash App or similar) so a transaction happens automatically once an Action settles. That's a bigger decision than an API integration — see the separate conversation on this, since it changes the legal shape of the product (see the lawyer note above) and Cash App specifically doesn't expose the kind of API this would need. Worth resolving that direction before this document's steps above matter much, since "real-world testing" means something different depending on whether money is moving.
