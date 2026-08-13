-- =============================================================================
-- Payment settlement — deliberately separate from the sports result.
-- actions.status already answers "who won the bet." This migration adds a
-- second, independent axis: "has the loser actually paid the winner yet."
-- ACTION still never touches the money itself — this only tracks what the
-- two participants say happened.
-- =============================================================================

create type payment_settlement_status as enum (
  'not_applicable',
  'owed',
  'marked_paid',
  'settled',
  'disputed'
);

-- Append-only audit trail, mirroring action_status_history's role for the
-- sports result. actions.payment_status is the current-state cache (same
-- relationship actions.status has to action_status_history); this table is
-- the source of truth for timing (when reminders fired, when someone
-- nudged, when paid/confirmed/disputed happened) that a later Rivalry or
-- Action Recap feature needs. No separate timestamp columns are added to
-- `actions` for this — actions.resolved_at already marks the moment
-- payment becomes owed, and every other transition has exactly one event
-- row with its own created_at.
create type payment_settlement_event_type as enum (
  'owed',
  'reminder_6h',
  'reminder_24h',
  'reminder_48h',
  'manual_nudge',
  'marked_paid',
  'confirmed_received',
  'disputed',
  'not_applicable'
);

alter table actions
  add column payment_status payment_settlement_status not null default 'not_applicable';

create index actions_payment_status_idx on actions (payment_status);

create table payment_settlement_events (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions (id) on delete cascade,
  event_type payment_settlement_event_type not null,
  -- null for system-generated events (owed, automatic reminders, not_applicable)
  actor_user_id uuid references users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index payment_settlement_events_action_idx on payment_settlement_events (action_id, created_at);

-- Idempotency: each of these event types can happen at most once per
-- Action. Reminders in particular rely on this — a retried/overlapping
-- cron tick inserting the same level again is a no-op, not a duplicate
-- notification.
create unique index payment_settlement_events_owed_once
  on payment_settlement_events (action_id) where event_type = 'owed';
create unique index payment_settlement_events_not_applicable_once
  on payment_settlement_events (action_id) where event_type = 'not_applicable';
create unique index payment_settlement_events_reminder_6h_once
  on payment_settlement_events (action_id) where event_type = 'reminder_6h';
create unique index payment_settlement_events_reminder_24h_once
  on payment_settlement_events (action_id) where event_type = 'reminder_24h';
create unique index payment_settlement_events_reminder_48h_once
  on payment_settlement_events (action_id) where event_type = 'reminder_48h';

alter table payment_settlement_events enable row level security;

create policy "participants can read payment settlement events on their actions"
  on payment_settlement_events for select
  using (action_id in (select my_action_ids()));

-- -----------------------------------------------------------------------------
-- Transition functions. Every write to payment_status / payment_settlement_events
-- goes through one of these — never a direct insert/update from application
-- code — so the state machine, authorization, and idempotency are enforced
-- in exactly one place per transition. Each takes a per-Action advisory lock
-- so two concurrent calls (e.g. a double-tapped button, or a cron tick
-- overlapping a manual action) can't race past each other's validation.
--
-- State machine:
--   not_applicable                    (default; terminal — pushes/cancels)
--   owed -> marked_paid -> settled    (terminal)
--                 \-> disputed -> settled   (winner can confirm directly
--                                            once resolved off-app)
-- -----------------------------------------------------------------------------

-- System-only (called from the settlement cron right after grading a
-- won/lost Action that has a stake amount).
create or replace function settlement_mark_owed(p_action_id uuid)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status action_status;
  v_stake numeric;
  v_payment_status payment_settlement_status;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_action_id::text));

  select status, stake_amount, payment_status
    into v_status, v_stake, v_payment_status
    from actions
    where id = p_action_id;

  if not found or v_status not in ('won', 'lost') or v_stake is null or v_payment_status <> 'not_applicable' then
    return query select false;
    return;
  end if;

  update actions set payment_status = 'owed' where id = p_action_id;
  insert into payment_settlement_events (action_id, event_type)
    values (p_action_id, 'owed')
    on conflict do nothing;

  return query select true;
end;
$$;

-- System-only (called from the settlement cron on push/cancel/expire).
-- payment_status already defaults to 'not_applicable', so this mostly just
-- logs the event for audit completeness; the defensive update covers the
-- case where grading logic somehow runs twice.
create or replace function settlement_mark_not_applicable(p_action_id uuid)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_action_id::text));

  update actions
    set payment_status = 'not_applicable'
    where id = p_action_id and payment_status <> 'not_applicable';

  insert into payment_settlement_events (action_id, event_type)
    values (p_action_id, 'not_applicable')
    on conflict do nothing
    returning true into v_inserted;

  return query select coalesce(v_inserted, false);
end;
$$;

-- Loser only, from 'owed'.
create or replace function settlement_mark_paid(p_action_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status action_status;
  v_payment_status payment_settlement_status;
  v_creator_id uuid;
  v_opponent_id uuid;
  v_loser_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_action_id::text));

  select a.status, a.payment_status, a.creator_id
    into v_status, v_payment_status, v_creator_id
    from actions a
    where a.id = p_action_id;

  if not found then
    return query select false, 'not_found';
    return;
  end if;

  select p.user_id into v_opponent_id
    from participants p
    where p.action_id = p_action_id and p.role = 'opponent';

  v_loser_id := case
    when v_status = 'won' then v_opponent_id
    when v_status = 'lost' then v_creator_id
    else null
  end;

  if v_loser_id is null or v_loser_id <> p_actor_user_id then
    return query select false, 'not_loser';
    return;
  end if;

  if v_payment_status <> 'owed' then
    return query select false, 'invalid_state';
    return;
  end if;

  update actions set payment_status = 'marked_paid' where id = p_action_id;
  insert into payment_settlement_events (action_id, event_type, actor_user_id)
    values (p_action_id, 'marked_paid', p_actor_user_id);

  return query select true, null::text;
end;
$$;

-- Winner only, from 'marked_paid' or 'disputed' (the second lets the
-- winner confirm receipt later without requiring the loser to re-mark-paid
-- once a dispute is resolved off-app).
create or replace function settlement_confirm_received(p_action_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status action_status;
  v_payment_status payment_settlement_status;
  v_creator_id uuid;
  v_opponent_id uuid;
  v_winner_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_action_id::text));

  select a.status, a.payment_status, a.creator_id
    into v_status, v_payment_status, v_creator_id
    from actions a
    where a.id = p_action_id;

  if not found then
    return query select false, 'not_found';
    return;
  end if;

  select p.user_id into v_opponent_id
    from participants p
    where p.action_id = p_action_id and p.role = 'opponent';

  v_winner_id := case
    when v_status = 'won' then v_creator_id
    when v_status = 'lost' then v_opponent_id
    else null
  end;

  if v_winner_id is null or v_winner_id <> p_actor_user_id then
    return query select false, 'not_winner';
    return;
  end if;

  if v_payment_status not in ('marked_paid', 'disputed') then
    return query select false, 'invalid_state';
    return;
  end if;

  update actions set payment_status = 'settled' where id = p_action_id;
  insert into payment_settlement_events (action_id, event_type, actor_user_id)
    values (p_action_id, 'confirmed_received', p_actor_user_id);

  return query select true, null::text;
end;
$$;

-- Winner only, from 'marked_paid'. Deliberately doesn't adjudicate
-- anything — just flips the status to 'disputed' and stops automatic
-- reminders; the two participants sort it out themselves.
create or replace function settlement_dispute(p_action_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status action_status;
  v_payment_status payment_settlement_status;
  v_creator_id uuid;
  v_opponent_id uuid;
  v_winner_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_action_id::text));

  select a.status, a.payment_status, a.creator_id
    into v_status, v_payment_status, v_creator_id
    from actions a
    where a.id = p_action_id;

  if not found then
    return query select false, 'not_found';
    return;
  end if;

  select p.user_id into v_opponent_id
    from participants p
    where p.action_id = p_action_id and p.role = 'opponent';

  v_winner_id := case
    when v_status = 'won' then v_creator_id
    when v_status = 'lost' then v_opponent_id
    else null
  end;

  if v_winner_id is null or v_winner_id <> p_actor_user_id then
    return query select false, 'not_winner';
    return;
  end if;

  if v_payment_status <> 'marked_paid' then
    return query select false, 'invalid_state';
    return;
  end if;

  update actions set payment_status = 'disputed' where id = p_action_id;
  insert into payment_settlement_events (action_id, event_type, actor_user_id)
    values (p_action_id, 'disputed', p_actor_user_id);

  return query select true, null::text;
end;
$$;

-- System-only (called from the payment-reminders cron). Only ever
-- transitions payment_settlement_events, never actions.payment_status —
-- reminders don't change state, they just nag. Idempotent per level via
-- the partial unique indexes above, so a retried/overlapping cron tick
-- can't send the same level twice; `sent` tells the caller whether this
-- call actually did anything, so it knows whether to dispatch a
-- notification.
create or replace function settlement_record_reminder(p_action_id uuid, p_event_type payment_settlement_event_type)
returns table(sent boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_status payment_settlement_status;
  v_inserted boolean;
begin
  if p_event_type not in ('reminder_6h', 'reminder_24h', 'reminder_48h') then
    raise exception 'settlement_record_reminder: invalid event type %', p_event_type;
  end if;

  perform pg_advisory_xact_lock(hashtext('payment:' || p_action_id::text));

  select payment_status into v_payment_status from actions where id = p_action_id;

  if not found or v_payment_status <> 'owed' then
    return query select false;
    return;
  end if;

  insert into payment_settlement_events (action_id, event_type)
    values (p_action_id, p_event_type)
    on conflict do nothing
    returning true into v_inserted;

  return query select coalesce(v_inserted, false);
end;
$$;

-- Winner only, from 'owed'. Rate-limited to one per 12 hours per Action —
-- returns next_available_at so the UI can show a cooldown message without
-- a second query.
create or replace function settlement_record_nudge(p_action_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text, next_available_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status action_status;
  v_payment_status payment_settlement_status;
  v_creator_id uuid;
  v_opponent_id uuid;
  v_winner_id uuid;
  v_last_nudge timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_action_id::text));

  select a.status, a.payment_status, a.creator_id
    into v_status, v_payment_status, v_creator_id
    from actions a
    where a.id = p_action_id;

  if not found then
    return query select false, 'not_found', null::timestamptz;
    return;
  end if;

  select p.user_id into v_opponent_id
    from participants p
    where p.action_id = p_action_id and p.role = 'opponent';

  v_winner_id := case
    when v_status = 'won' then v_creator_id
    when v_status = 'lost' then v_opponent_id
    else null
  end;

  if v_winner_id is null or v_winner_id <> p_actor_user_id then
    return query select false, 'not_winner', null::timestamptz;
    return;
  end if;

  if v_payment_status <> 'owed' then
    return query select false, 'invalid_state', null::timestamptz;
    return;
  end if;

  select max(created_at) into v_last_nudge
    from payment_settlement_events
    where action_id = p_action_id and event_type = 'manual_nudge';

  if v_last_nudge is not null and v_last_nudge > now() - interval '12 hours' then
    return query select false, 'cooldown', (v_last_nudge + interval '12 hours');
    return;
  end if;

  insert into payment_settlement_events (action_id, event_type, actor_user_id)
    values (p_action_id, 'manual_nudge', p_actor_user_id);

  return query select true, null::text, null::timestamptz;
end;
$$;

revoke execute on function settlement_mark_owed(uuid) from public;
revoke execute on function settlement_mark_not_applicable(uuid) from public;
revoke execute on function settlement_mark_paid(uuid, uuid) from public;
revoke execute on function settlement_confirm_received(uuid, uuid) from public;
revoke execute on function settlement_dispute(uuid, uuid) from public;
revoke execute on function settlement_record_reminder(uuid, payment_settlement_event_type) from public;
revoke execute on function settlement_record_nudge(uuid, uuid) from public;

grant execute on function settlement_mark_owed(uuid) to service_role;
grant execute on function settlement_mark_not_applicable(uuid) to service_role;
grant execute on function settlement_mark_paid(uuid, uuid) to service_role;
grant execute on function settlement_confirm_received(uuid, uuid) to service_role;
grant execute on function settlement_dispute(uuid, uuid) to service_role;
grant execute on function settlement_record_reminder(uuid, payment_settlement_event_type) to service_role;
grant execute on function settlement_record_nudge(uuid, uuid) to service_role;
