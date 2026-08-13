-- =============================================================================
-- Generalizes payment settlement from "one payment_status per Action" to
-- "one settlement_obligations row per loser->winner relationship." A
-- 2-participant sports Action always had exactly one loser, so the two
-- models are behaviorally identical there — this migration is what makes
-- Custom Actions (up to 7 losers, each with independent payment state:
-- "Race paid, Chris still owes, nudging Chris doesn't touch Race") actually
-- correct, rather than building a second, parallel settlement system for
-- them. actions.payment_status stays as a column, but becomes a derived
-- rollup recomputed after every obligation transition (see
-- recompute_action_payment_status below) rather than the thing being
-- written to directly.
--
-- No production data exists yet for this project, but the backfill below
-- is still written correctly: any existing Action with a payment_status
-- beyond 'not_applicable' gets exactly one settlement_obligations row, and
-- its existing payment_settlement_events rows are re-pointed at it so no
-- history is lost.
-- =============================================================================

create table settlement_obligations (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions (id) on delete cascade,
  debtor_participant_id uuid not null references participants (id),
  creditor_participant_id uuid not null references participants (id),
  amount numeric(10, 2) not null,
  payment_status payment_settlement_status not null default 'owed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_obligations_amount_positive check (amount > 0),
  constraint settlement_obligations_distinct_parties check (debtor_participant_id <> creditor_participant_id),
  unique (action_id, debtor_participant_id)
);

create index settlement_obligations_action_idx on settlement_obligations (action_id);
create index settlement_obligations_debtor_idx on settlement_obligations (debtor_participant_id);
create index settlement_obligations_creditor_idx on settlement_obligations (creditor_participant_id);

create trigger settlement_obligations_set_updated_at
  before update on settlement_obligations
  for each row execute function set_updated_at();

alter table settlement_obligations enable row level security;

create policy "participants can read settlement obligations on their actions"
  on settlement_obligations for select
  using (action_id in (select my_action_ids()));

-- Every settlement event now belongs to a specific obligation (owed,
-- marked_paid, confirmed_received, disputed, reminders, nudges) except
-- 'not_applicable', which stays action-level since nothing was ever owed.
alter table payment_settlement_events add column obligation_id uuid references settlement_obligations (id) on delete cascade;
create index payment_settlement_events_obligation_idx on payment_settlement_events (obligation_id);

-- -----------------------------------------------------------------------------
-- Backfill: pre-existing Actions with real payment history
-- -----------------------------------------------------------------------------

do $$
declare
  v_action record;
  v_creator_participant_id uuid;
  v_opponent_participant_id uuid;
  v_winner_participant_id uuid;
  v_loser_participant_id uuid;
  v_obligation_id uuid;
begin
  for v_action in
    select id, status, stake_amount, payment_status from actions where payment_status <> 'not_applicable'
  loop
    select id into v_creator_participant_id from participants where action_id = v_action.id and role = 'creator';
    select id into v_opponent_participant_id from participants where action_id = v_action.id and role = 'opponent';

    if v_creator_participant_id is null or v_opponent_participant_id is null or v_action.stake_amount is null then
      continue;
    end if;

    if v_action.status = 'won' then
      v_winner_participant_id := v_creator_participant_id;
      v_loser_participant_id := v_opponent_participant_id;
    elsif v_action.status = 'lost' then
      v_winner_participant_id := v_opponent_participant_id;
      v_loser_participant_id := v_creator_participant_id;
    else
      continue;
    end if;

    insert into settlement_obligations (action_id, debtor_participant_id, creditor_participant_id, amount, payment_status)
      values (v_action.id, v_loser_participant_id, v_winner_participant_id, v_action.stake_amount, v_action.payment_status)
      returning id into v_obligation_id;

    update payment_settlement_events
      set obligation_id = v_obligation_id
      where action_id = v_action.id
        and event_type in ('owed', 'marked_paid', 'confirmed_received', 'disputed', 'reminder_6h', 'reminder_24h', 'reminder_48h', 'manual_nudge');
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Idempotency indexes move from per-Action to per-obligation. A sports
-- Action still only ever has one obligation, so behavior there is
-- unchanged; a Custom Action's obligations are now independently guarded.
-- -----------------------------------------------------------------------------

drop index payment_settlement_events_owed_once;
drop index payment_settlement_events_reminder_6h_once;
drop index payment_settlement_events_reminder_24h_once;
drop index payment_settlement_events_reminder_48h_once;

create unique index payment_settlement_events_owed_once
  on payment_settlement_events (obligation_id) where event_type = 'owed';
create unique index payment_settlement_events_reminder_6h_once
  on payment_settlement_events (obligation_id) where event_type = 'reminder_6h';
create unique index payment_settlement_events_reminder_24h_once
  on payment_settlement_events (obligation_id) where event_type = 'reminder_24h';
create unique index payment_settlement_events_reminder_48h_once
  on payment_settlement_events (obligation_id) where event_type = 'reminder_48h';

-- -----------------------------------------------------------------------------
-- Rollup: actions.payment_status becomes derived, not directly written.
-- Called at the end of every obligation-mutating function below.
-- -----------------------------------------------------------------------------

create or replace function recompute_action_payment_status(p_action_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_settled integer;
  v_disputed integer;
  v_marked_paid integer;
  v_new_status payment_settlement_status;
begin
  select
    count(*),
    count(*) filter (where payment_status = 'settled'),
    count(*) filter (where payment_status = 'disputed'),
    count(*) filter (where payment_status = 'marked_paid')
    into v_total, v_settled, v_disputed, v_marked_paid
    from settlement_obligations
    where action_id = p_action_id;

  v_new_status := case
    when v_total = 0 then 'not_applicable'
    when v_settled = v_total then 'settled'
    when v_disputed > 0 then 'disputed'
    when v_marked_paid > 0 then 'marked_paid'
    else 'owed'
  end;

  update actions set payment_status = v_new_status where id = p_action_id and payment_status <> v_new_status;
end;
$$;

-- -----------------------------------------------------------------------------
-- Drop the old action-scoped functions (signature is changing from
-- p_action_id to p_obligation_id on five of these — create or replace can't
-- change an argument list, so the old ones have to go first).
-- -----------------------------------------------------------------------------

drop function settlement_mark_owed(uuid);
drop function settlement_mark_paid(uuid, uuid);
drop function settlement_confirm_received(uuid, uuid);
drop function settlement_dispute(uuid, uuid);
drop function settlement_record_reminder(uuid, payment_settlement_event_type);
drop function settlement_record_nudge(uuid, uuid);

-- System-only. Replaces settlement_mark_owed: called once a winner is
-- determined (sports grading or unanimous custom consensus), creates one
-- obligation per non-winning accepted participant. For a 2-participant
-- sports Action this creates exactly one row, identical in effect to the
-- old single-obligation behavior.
create or replace function settlement_create_obligations(p_action_id uuid, p_winner_participant_id uuid)
returns table(ok boolean, obligations_created integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stake numeric;
  v_created integer;
  v_obligation record;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_action_id::text));

  if exists (select 1 from settlement_obligations where action_id = p_action_id) then
    return query select false, 0;
    return;
  end if;

  select stake_amount into v_stake from actions where id = p_action_id;
  if v_stake is null then
    return query select false, 0;
    return;
  end if;

  v_created := 0;
  for v_obligation in
    select p.id as debtor_participant_id
    from participants p
    where p.action_id = p_action_id and p.status = 'accepted' and p.id <> p_winner_participant_id
  loop
    declare
      v_obligation_id uuid;
    begin
      insert into settlement_obligations (action_id, debtor_participant_id, creditor_participant_id, amount, payment_status)
        values (p_action_id, v_obligation.debtor_participant_id, p_winner_participant_id, v_stake, 'owed')
        returning id into v_obligation_id;

      insert into payment_settlement_events (action_id, obligation_id, event_type)
        values (p_action_id, v_obligation_id, 'owed');

      v_created := v_created + 1;
    end;
  end loop;

  perform recompute_action_payment_status(p_action_id);

  return query select v_created > 0, v_created;
end;
$$;

-- Debtor only, from 'owed'.
create or replace function settlement_mark_paid(p_obligation_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_status payment_settlement_status;
  v_debtor_user_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('obligation:' || p_obligation_id::text));

  select o.action_id, o.payment_status, p.user_id
    into v_action_id, v_status, v_debtor_user_id
    from settlement_obligations o
    join participants p on p.id = o.debtor_participant_id
    where o.id = p_obligation_id;

  if v_action_id is null then
    return query select false, 'not_found';
    return;
  end if;

  if v_debtor_user_id is null or v_debtor_user_id <> p_actor_user_id then
    return query select false, 'not_loser';
    return;
  end if;

  if v_status <> 'owed' then
    return query select false, 'invalid_state';
    return;
  end if;

  update settlement_obligations set payment_status = 'marked_paid' where id = p_obligation_id;
  insert into payment_settlement_events (action_id, obligation_id, event_type, actor_user_id)
    values (v_action_id, p_obligation_id, 'marked_paid', p_actor_user_id);

  perform recompute_action_payment_status(v_action_id);

  return query select true, null::text;
end;
$$;

-- Creditor only, from 'marked_paid' or 'disputed'.
create or replace function settlement_confirm_received(p_obligation_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_status payment_settlement_status;
  v_creditor_user_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('obligation:' || p_obligation_id::text));

  select o.action_id, o.payment_status, p.user_id
    into v_action_id, v_status, v_creditor_user_id
    from settlement_obligations o
    join participants p on p.id = o.creditor_participant_id
    where o.id = p_obligation_id;

  if v_action_id is null then
    return query select false, 'not_found';
    return;
  end if;

  if v_creditor_user_id is null or v_creditor_user_id <> p_actor_user_id then
    return query select false, 'not_winner';
    return;
  end if;

  if v_status not in ('marked_paid', 'disputed') then
    return query select false, 'invalid_state';
    return;
  end if;

  update settlement_obligations set payment_status = 'settled' where id = p_obligation_id;
  insert into payment_settlement_events (action_id, obligation_id, event_type, actor_user_id)
    values (v_action_id, p_obligation_id, 'confirmed_received', p_actor_user_id);

  perform recompute_action_payment_status(v_action_id);

  return query select true, null::text;
end;
$$;

-- Creditor only, from 'marked_paid'.
create or replace function settlement_dispute(p_obligation_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_status payment_settlement_status;
  v_creditor_user_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('obligation:' || p_obligation_id::text));

  select o.action_id, o.payment_status, p.user_id
    into v_action_id, v_status, v_creditor_user_id
    from settlement_obligations o
    join participants p on p.id = o.creditor_participant_id
    where o.id = p_obligation_id;

  if v_action_id is null then
    return query select false, 'not_found';
    return;
  end if;

  if v_creditor_user_id is null or v_creditor_user_id <> p_actor_user_id then
    return query select false, 'not_winner';
    return;
  end if;

  if v_status <> 'marked_paid' then
    return query select false, 'invalid_state';
    return;
  end if;

  update settlement_obligations set payment_status = 'disputed' where id = p_obligation_id;
  insert into payment_settlement_events (action_id, obligation_id, event_type, actor_user_id)
    values (v_action_id, p_obligation_id, 'disputed', p_actor_user_id);

  perform recompute_action_payment_status(v_action_id);

  return query select true, null::text;
end;
$$;

-- System-only (cron). Idempotent per (obligation, level) via the unique
-- indexes above.
create or replace function settlement_record_reminder(p_obligation_id uuid, p_event_type payment_settlement_event_type)
returns table(sent boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_status payment_settlement_status;
  v_inserted boolean;
begin
  if p_event_type not in ('reminder_6h', 'reminder_24h', 'reminder_48h') then
    raise exception 'settlement_record_reminder: invalid event type %', p_event_type;
  end if;

  perform pg_advisory_xact_lock(hashtext('obligation:' || p_obligation_id::text));

  select action_id, payment_status into v_action_id, v_status from settlement_obligations where id = p_obligation_id;

  if v_action_id is null or v_status <> 'owed' then
    return query select false;
    return;
  end if;

  insert into payment_settlement_events (action_id, obligation_id, event_type)
    values (v_action_id, p_obligation_id, p_event_type)
    on conflict do nothing
    returning true into v_inserted;

  return query select coalesce(v_inserted, false);
end;
$$;

-- Creditor only, from 'owed'. Rate-limited to one per 12h per obligation —
-- independent per loser, which is the whole point for multi-participant
-- Custom Actions.
create or replace function settlement_record_nudge(p_obligation_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text, next_available_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_status payment_settlement_status;
  v_creditor_user_id uuid;
  v_last_nudge timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('obligation:' || p_obligation_id::text));

  select o.action_id, o.payment_status, p.user_id
    into v_action_id, v_status, v_creditor_user_id
    from settlement_obligations o
    join participants p on p.id = o.creditor_participant_id
    where o.id = p_obligation_id;

  if v_action_id is null then
    return query select false, 'not_found', null::timestamptz;
    return;
  end if;

  if v_creditor_user_id is null or v_creditor_user_id <> p_actor_user_id then
    return query select false, 'not_winner', null::timestamptz;
    return;
  end if;

  if v_status <> 'owed' then
    return query select false, 'invalid_state', null::timestamptz;
    return;
  end if;

  select max(created_at) into v_last_nudge
    from payment_settlement_events
    where obligation_id = p_obligation_id and event_type = 'manual_nudge';

  if v_last_nudge is not null and v_last_nudge > now() - interval '12 hours' then
    return query select false, 'cooldown', (v_last_nudge + interval '12 hours');
    return;
  end if;

  insert into payment_settlement_events (action_id, obligation_id, event_type, actor_user_id)
    values (v_action_id, p_obligation_id, 'manual_nudge', p_actor_user_id);

  return query select true, null::text, null::timestamptz;
end;
$$;

revoke execute on function recompute_action_payment_status(uuid) from public;
revoke execute on function settlement_create_obligations(uuid, uuid) from public;
revoke execute on function settlement_mark_paid(uuid, uuid) from public;
revoke execute on function settlement_confirm_received(uuid, uuid) from public;
revoke execute on function settlement_dispute(uuid, uuid) from public;
revoke execute on function settlement_record_reminder(uuid, payment_settlement_event_type) from public;
revoke execute on function settlement_record_nudge(uuid, uuid) from public;

grant execute on function recompute_action_payment_status(uuid) to service_role;
grant execute on function settlement_create_obligations(uuid, uuid) to service_role;
grant execute on function settlement_mark_paid(uuid, uuid) to service_role;
grant execute on function settlement_confirm_received(uuid, uuid) to service_role;
grant execute on function settlement_dispute(uuid, uuid) to service_role;
grant execute on function settlement_record_reminder(uuid, payment_settlement_event_type) to service_role;
grant execute on function settlement_record_nudge(uuid, uuid) to service_role;

-- settlement_mark_not_applicable(uuid) is unchanged — pushes/cancels never
-- create obligations in the first place (grading into 'push'/'cancelled'
-- and grading into 'won'/'lost' are mutually exclusive), so there's nothing
-- for it to touch in settlement_obligations. Its existing grant stands.
