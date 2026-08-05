-- =============================================================================
-- Phone OTP support infrastructure.
--
-- This is intentionally NOT one of the seven domain tables — it exists only
-- so the app can run its own phone-verification flow (and therefore its own
-- SmsProvider abstraction, see src/lib/sms) without requiring a Twilio
-- integration to be configured inside Supabase Auth itself. Only ever
-- accessed by server code using the service-role client; RLS is enabled
-- with zero policies, which denies all access via the anon/authenticated
-- keys by default.
-- =============================================================================

create table auth_otp_codes (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table auth_otp_codes enable row level security;
