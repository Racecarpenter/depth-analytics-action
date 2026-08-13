-- =============================================================================
-- ACTION monetization: Action credits, 30-Day Passes, referral rewards, and
-- Stripe purchase history.
--
-- Hard boundary, unchanged from the rest of this schema: none of this is
-- wager money. It is exclusively about paying for access to *create*
-- Actions. Accepting, viewing, and settling Actions remains free and
-- untouched by anything in this file.
--
-- Design notes (see also the architecture doc discussed with the user before
-- this migration was written):
--   - There is no `actions_remaining` counter anywhere. Balance is always
--     `sum(amount)` over action_credit_transactions for a user — an
--     append-only ledger, never a mutable column that can drift from the
--     truth. `action_credit_transactions_one_starter_grant` below is the one
--     integrity constraint enforced at the database level (everything else
--     is enforced by the two RPC functions being the only write path).
--   - action_passes has no `status` column on purpose — "active" is always
--     `expires_at > now()`, which can never go stale independently of the
--     timestamp itself.
--   - consume_action_credit_or_pass() and grant_referral_reward_if_eligible()
--     are SECURITY DEFINER and take an advisory lock on the affected user
--     before reading+writing, so concurrent requests from the same user
--     serialize instead of racing. Both are explicitly revoked from
--     anon/authenticated at the bottom of this file — they must only ever be
--     called from server code via the service-role client, never directly
--     from the browser, since they trust their arguments completely (a
--     client-callable version would let anyone pass an arbitrary p_user_id).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type credit_transaction_type as enum (
  'starter_grant',
  'referral_reward',
  'action_pack_purchase',
  'action_created',
  'admin_adjustment'
);

create type purchase_kind as enum ('action_pack', 'action_pass');

create type purchase_status as enum ('completed', 'refunded');

-- -----------------------------------------------------------------------------
-- purchases
-- One row per confirmed Stripe payment. Rows are only ever written from the
-- webhook handler after Stripe confirms the payment — never from the
-- checkout-success redirect, which is not trusted for fulfillment.
-- -----------------------------------------------------------------------------

create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind purchase_kind not null,
  status purchase_status not null default 'completed',
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  amount_cents integer not null,
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchases_user_idx on purchases (user_id, created_at desc);

create trigger purchases_set_updated_at
  before update on purchases
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- action_passes
-- A 30-Day Pass entitlement. "Active" is always derived as
-- `expires_at > now()`, never stored — see design note at the top of this
-- file. Buying another pass while one is active just adds another row;
-- whichever has the latest expires_at is what's shown to the user.
-- -----------------------------------------------------------------------------

create table action_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  purchase_id uuid references purchases (id),
  created_at timestamptz not null default now(),
  constraint expires_after_start check (expires_at > started_at)
);

create index action_passes_user_idx on action_passes (user_id, expires_at desc);

-- -----------------------------------------------------------------------------
-- action_credit_transactions
-- The Action credit ledger. This is the entire source of truth for how many
-- Actions a user can create — balance is `sum(amount)`, always computed, so
-- there is no cached counter anywhere that could drift from this history.
-- -----------------------------------------------------------------------------

create table action_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  type credit_transaction_type not null,
  amount integer not null,
  -- Polymorphic pointer at whatever caused this row — an action, a purchase,
  -- or a referral. No FK constraint (it can't point at one specific table),
  -- reference_type documents which table reference_id belongs to.
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now(),
  constraint amount_nonzero check (amount <> 0),
  constraint amount_sign_matches_type check (
    (type in ('starter_grant', 'referral_reward', 'action_pack_purchase') and amount > 0)
    or (type = 'action_created' and amount < 0)
    or (type = 'admin_adjustment')
  )
);

create index action_credit_transactions_user_idx on action_credit_transactions (user_id, created_at desc);

-- Enforced at the database level, not just in application code: a user can
-- never end up with more than one starter grant, no matter how many times
-- signup logic is retried or called from an unexpected code path.
create unique index action_credit_transactions_one_starter_grant
  on action_credit_transactions (user_id)
  where type = 'starter_grant';

-- -----------------------------------------------------------------------------
-- referrals
-- Attribution for the "invite a new user, they accept their first Action,
-- you earn 1 free Action" mechanic. invitee_phone is unique — this single
-- constraint is what makes "repeated invites to the same phone number can't
-- generate multiple rewards" true at the database level: whoever invites a
-- not-yet-registered phone *first* is the only one who can ever be credited
-- for it, enforced by `on conflict (invitee_phone) do nothing` at insert time
-- (see createActionAndInvite).
-- -----------------------------------------------------------------------------

create table referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references users (id) on delete cascade,
  invitee_phone text not null unique,
  invitee_user_id uuid references users (id) on delete set null,
  triggering_action_id uuid references actions (id) on delete set null,
  reward_transaction_id uuid references action_credit_transactions (id) on delete set null,
  reward_granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_self_referral check (inviter_user_id is distinct from invitee_user_id)
);

create index referrals_inviter_idx on referrals (inviter_user_id);
create index referrals_invitee_user_idx on referrals (invitee_user_id);

create trigger referrals_set_updated_at
  before update on referrals
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- stripe_webhook_events
-- Dedup guard for webhook delivery itself, independent of any business
-- logic. A replayed event (Stripe explicitly documents that deliveries can
-- repeat) is a no-op the moment its event id already exists here.
-- -----------------------------------------------------------------------------

create table stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  payload jsonb,
  received_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- analytics_events
-- Lightweight, append-only product-analytics log — deliberately separate
-- from the financial ledger above so "what happened" and "what's owed"
-- never share a table. event_name is plain text (not an enum) specifically
-- so new event types can be added without a migration.
-- -----------------------------------------------------------------------------

create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references users (id) on delete set null,
  action_id uuid references actions (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index analytics_events_name_idx on analytics_events (event_name, created_at desc);
create index analytics_events_user_idx on analytics_events (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table purchases enable row level security;
alter table action_passes enable row level security;
alter table action_credit_transactions enable row level security;
alter table referrals enable row level security;
alter table stripe_webhook_events enable row level security;
alter table analytics_events enable row level security;

create policy "users can read their own purchases"
  on purchases for select
  using (auth.uid() = user_id);

create policy "users can read their own passes"
  on action_passes for select
  using (auth.uid() = user_id);

create policy "users can read their own credit transactions"
  on action_credit_transactions for select
  using (auth.uid() = user_id);

create policy "users can read referrals they sent"
  on referrals for select
  using (auth.uid() = inviter_user_id);

-- stripe_webhook_events and analytics_events: RLS enabled, zero policies —
-- fully internal, same pattern as auth_otp_codes in 0002_auth_otp.sql. Only
-- the service-role client (which bypasses RLS) ever touches these.

-- -----------------------------------------------------------------------------
-- consume_action_credit_or_pass
-- The single authorization + spend gate for creating an Action. Checks for
-- an active pass first (zero cost); otherwise atomically checks and spends
-- one credit. The advisory lock means two concurrent calls for the same
-- user with one credit between them can never both succeed.
--
-- p_action_id is the client-generated id of the Action about to be created
-- (crypto.randomUUID() in application code, inserted into `actions` with
-- that same id immediately after this call succeeds) — passing it in here
-- lets the resulting ledger row reference the right Action without needing
-- the Action to exist yet.
-- -----------------------------------------------------------------------------

create or replace function consume_action_credit_or_pass(
  p_user_id uuid,
  p_action_id uuid,
  p_amount integer default 1
)
returns table(allowed boolean, method text, balance_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_pass boolean;
  v_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'p_amount must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtext('credit:' || p_user_id::text));

  select exists(
    select 1 from action_passes
    where user_id = p_user_id and expires_at > now()
  ) into v_has_pass;

  if v_has_pass then
    return query select true, 'pass'::text, null::integer;
    return;
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from action_credit_transactions
  where user_id = p_user_id;

  if v_balance >= p_amount then
    insert into action_credit_transactions (user_id, type, amount, reference_type, reference_id, note)
    values (p_user_id, 'action_created', -p_amount, 'action', p_action_id, 'Action created');

    return query select true, 'credit'::text, (v_balance - p_amount);
    return;
  end if;

  return query select false, 'denied'::text, v_balance;
end;
$$;

-- -----------------------------------------------------------------------------
-- grant_referral_reward_if_eligible
-- Called right after an invite is accepted. Grants the inviter their reward
-- exactly once, only if this was the accepting user's first-ever accepted
-- Action and a matching, not-yet-rewarded referral row exists for their
-- phone number. The `reward_granted_at is null` guard in the UPDATE is
-- itself the idempotency check — a duplicate call is a safe no-op.
-- -----------------------------------------------------------------------------

create or replace function grant_referral_reward_if_eligible(
  p_user_id uuid,
  p_action_id uuid,
  p_reward_amount integer
)
returns table(granted boolean, inviter_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accepted_count integer;
  v_phone text;
  v_referral_id uuid;
  v_inviter uuid;
  v_tx_id uuid;
begin
  if p_reward_amount <= 0 then
    raise exception 'p_reward_amount must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtext('referral:' || p_user_id::text));

  select count(*) into v_accepted_count
  from participants
  where user_id = p_user_id and status = 'accepted';

  -- Must be exactly 1: this function is called right after the accept
  -- update, so a count of 1 means this was their first-ever accepted Action.
  if v_accepted_count <> 1 then
    return query select false, null::uuid;
    return;
  end if;

  select phone into v_phone from users where id = p_user_id;
  if v_phone is null then
    return query select false, null::uuid;
    return;
  end if;

  update referrals
  set reward_granted_at = now(),
      invitee_user_id = p_user_id,
      triggering_action_id = p_action_id
  where invitee_phone = v_phone
    and reward_granted_at is null
  returning id, referrals.inviter_user_id into v_referral_id, v_inviter;

  if v_referral_id is null then
    return query select false, null::uuid;
    return;
  end if;

  insert into action_credit_transactions (user_id, type, amount, reference_type, reference_id, note)
  values (v_inviter, 'referral_reward', p_reward_amount, 'referral', v_referral_id, 'Referral reward')
  returning id into v_tx_id;

  update referrals set reward_transaction_id = v_tx_id where id = v_referral_id;

  return query select true, v_inviter;
end;
$$;

-- Both functions trust their arguments completely (that's what makes them
-- usable as an atomic gate at all) — they must never be callable with a
-- caller-supplied p_user_id from the browser.
revoke execute on function consume_action_credit_or_pass(uuid, uuid, integer) from public;
grant execute on function consume_action_credit_or_pass(uuid, uuid, integer) to service_role;

revoke execute on function grant_referral_reward_if_eligible(uuid, uuid, integer) from public;
grant execute on function grant_referral_reward_if_eligible(uuid, uuid, integer) to service_role;
