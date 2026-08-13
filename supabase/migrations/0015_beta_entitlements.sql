-- =============================================================================
-- Beta tester unlimited-access entitlement.
--
-- Purpose: let specific users create unlimited Sports/Custom Actions during
-- real-world beta testing, before monetization is turned on for them —
-- without hardcoded phone numbers, env-var allowlists, or a client-side
-- `if (beta) return true` bypass sitting outside the atomic authorization
-- boundary. Beta access affects Action-creation entitlement only; it grants
-- no elevated database permissions and no admin capability.
--
-- Modeled as a general-purpose entitlement table rather than a single
-- boolean column on `users`, since the shape (start/expiry/revocation/audit
-- note) is exactly what any future non-monetization entitlement would also
-- need — `entitlement_type` starts with just 'beta_unlimited' but doesn't
-- have to stay that way.
-- =============================================================================

create type entitlement_type as enum ('beta_unlimited');

create table user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  entitlement_type entitlement_type not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  constraint expires_after_starts check (expires_at is null or expires_at > starts_at)
);

create index user_entitlements_user_idx on user_entitlements (user_id);

-- At most one *active* (non-revoked) grant per user per entitlement type —
-- revoked rows are excluded so history is never overwritten, and re-granting
-- after a revoke creates a fresh row rather than resurrecting the old one.
-- This is also the ON CONFLICT target grant_beta_access relies on below to
-- make granting idempotent.
create unique index user_entitlements_one_active_per_type
  on user_entitlements (user_id, entitlement_type)
  where revoked_at is null;

alter table user_entitlements enable row level security;

-- Read-only for the user themselves — enough for a future "you're a beta
-- tester" UI touch, and consistent with every other entitlement-adjacent
-- table in this schema (purchases, action_passes, action_credit_transactions
-- all have the same "read your own" policy). No insert/update/delete policy
-- exists at all, for any role — granting or revoking is only ever possible
-- through the SECURITY DEFINER functions below, run by whoever has direct
-- SQL access to the project (you, via the Supabase SQL editor). A client can
-- never grant this to itself.
create policy "users can read their own entitlements"
  on user_entitlements for select
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Beta administration — grant/revoke/list, phone-keyed for a seconds-not-
-- minutes workflow from the Supabase SQL editor. See README ("Beta testing
-- access") for the documented commands.
-- -----------------------------------------------------------------------------

create or replace function grant_beta_access(
  p_phone text,
  p_note text default null,
  p_expires_at timestamptz default null
)
returns table(user_id uuid, phone text, granted_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row user_entitlements%rowtype;
begin
  select id into v_user_id from users where users.phone = p_phone;

  if v_user_id is null then
    raise exception 'No user found with phone %. Use E.164 format (e.g. +16025551234) and confirm they''ve signed up at least once.', p_phone;
  end if;

  insert into user_entitlements (user_id, entitlement_type, note, expires_at)
    values (v_user_id, 'beta_unlimited', p_note, p_expires_at)
    on conflict (user_id, entitlement_type) where revoked_at is null
    do update set note = excluded.note, expires_at = excluded.expires_at, granted_at = now()
    returning * into v_row;

  return query select v_row.user_id, p_phone, v_row.granted_at, v_row.expires_at;
end;
$$;

create or replace function revoke_beta_access(p_phone text)
returns table(revoked_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  select id into v_user_id from users where users.phone = p_phone;

  if v_user_id is null then
    raise exception 'No user found with phone %.', p_phone;
  end if;

  update user_entitlements
    set revoked_at = now()
    where user_id = v_user_id
      and entitlement_type = 'beta_unlimited'
      and revoked_at is null;
  get diagnostics v_count = row_count;

  return query select v_count;
end;
$$;

create or replace function list_beta_testers()
returns table(phone text, display_name text, granted_at timestamptz, expires_at timestamptz, note text)
language sql
security definer
stable
set search_path = public
as $$
  select u.phone, u.display_name, e.granted_at, e.expires_at, e.note
  from user_entitlements e
  join users u on u.id = e.user_id
  where e.entitlement_type = 'beta_unlimited'
    and e.revoked_at is null
    and e.starts_at <= now()
    and (e.expires_at is null or e.expires_at > now())
  order by e.granted_at desc;
$$;

-- Same posture as every other privileged function in this schema: these
-- trust their arguments completely and must never be reachable from the
-- browser. The Supabase SQL editor runs as a superuser role that bypasses
-- grants entirely, so this revoke/grant pair doesn't affect your ability to
-- call them there — it only blocks PostgREST (anon/authenticated) access.
revoke execute on function grant_beta_access(text, text, timestamptz) from public;
revoke execute on function revoke_beta_access(text) from public;
revoke execute on function list_beta_testers() from public;

grant execute on function grant_beta_access(text, text, timestamptz) to service_role;
grant execute on function revoke_beta_access(text) to service_role;
grant execute on function list_beta_testers() to service_role;

-- -----------------------------------------------------------------------------
-- Wire beta into the single atomic Action-creation authorization gate.
-- Order matches the product spec exactly: beta unlimited, then active pass,
-- then credits, then deny. Both Sports and Custom Action creation already
-- call this same function (features/monetization/lib/credits.ts), so this
-- is the only place beta needs to be taught anything.
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
  v_has_beta boolean;
  v_has_pass boolean;
  v_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'p_amount must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtext('credit:' || p_user_id::text));

  select exists(
    select 1 from user_entitlements
    where user_id = p_user_id
      and entitlement_type = 'beta_unlimited'
      and revoked_at is null
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
  ) into v_has_beta;

  if v_has_beta then
    return query select true, 'beta'::text, null::integer;
    return;
  end if;

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
