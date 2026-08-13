-- =============================================================================
-- SMS consent audit trail, for Twilio A2P 10DLC campaign registration.
--
-- Deliberately an append-only event table, not flat columns on `users`:
-- consent is given the moment someone submits their phone number and taps
-- "Send code" (requestOtp), which happens *before* any account necessarily
-- exists — a brand-new phone number has no `users` row yet at that instant.
-- A nullable `user_id` here (backfilled implicitly for anyone who already
-- has an account, left null for a genuinely new signup) is the only shape
-- that can actually represent "this phone number was submitted through this
-- consent flow at this time under this disclosure version" for both cases.
-- Same posture as `analytics_events`/`stripe_webhook_events`: RLS enabled,
-- zero policies — fully internal, written only by the service-role client
-- from requestOtp.
-- =============================================================================

create table sms_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  phone text not null,
  consent_source text not null default 'web',
  consent_version text not null,
  created_at timestamptz not null default now()
);

create index sms_consent_events_phone_idx on sms_consent_events (phone, created_at desc);
create index sms_consent_events_user_idx on sms_consent_events (user_id, created_at desc);

alter table sms_consent_events enable row level security;
