-- =============================================================================
-- ACTION by Depth Analytics — initial schema
-- Peer-to-peer sports challenge tracking. No money is ever collected, held,
-- or transferred by this schema or any application code built on top of it.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type league as enum ('NFL', 'NBA', 'MLB', 'NHL');

create type game_status as enum ('scheduled', 'live', 'final', 'postponed', 'cancelled');

create type market_type as enum ('moneyline', 'spread', 'total');

-- Overall lifecycle of an Action, tracked from the creator's perspective.
-- Pending -> Accepted -> Live -> (Won | Lost | Push) | Declined | Cancelled | Expired
create type action_status as enum (
  'pending',
  'accepted',
  'declined',
  'live',
  'won',
  'lost',
  'push',
  'cancelled',
  'expired'
);

create type participant_role as enum ('creator', 'opponent');

create type participant_status as enum ('invited', 'accepted', 'declined');

create type notification_type as enum (
  'invite_received',
  'action_accepted',
  'action_declined',
  'action_live',
  'action_settled',
  'action_cancelled'
);

create type changed_by_actor as enum ('system', 'creator', 'opponent');

-- -----------------------------------------------------------------------------
-- updated_at helper
-- -----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- users
-- One row per authenticated person. Mirrors auth.users 1:1, keyed by the same id.
-- -----------------------------------------------------------------------------

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique,
  display_name text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- Auto-provision a public.users row whenever Supabase Auth creates a new user
-- via phone OTP sign-in.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, phone, phone_verified_at)
  values (new.id, coalesce(new.phone, ''), case when new.phone_confirmed_at is not null then now() else null end)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- teams
-- -----------------------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  league league not null,
  city text not null,
  name text not null,
  abbreviation text not null,
  primary_color text,
  created_at timestamptz not null default now(),
  unique (league, abbreviation)
);

create index teams_league_idx on teams (league);

-- -----------------------------------------------------------------------------
-- games
-- -----------------------------------------------------------------------------

create table games (
  id uuid primary key default gen_random_uuid(),
  league league not null,
  provider text not null default 'mock',
  external_id text not null,
  home_team_id uuid not null references teams (id),
  away_team_id uuid not null references teams (id),
  start_time timestamptz not null,
  status game_status not null default 'scheduled',
  home_score integer,
  away_score integer,
  period text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index games_league_start_idx on games (league, start_time);
create index games_status_idx on games (status);

create trigger games_set_updated_at
  before update on games
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- actions
-- The shared, lockable terms of a challenge: game, market, line, stake.
-- Individual picks live on participants.
-- -----------------------------------------------------------------------------

create table actions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references users (id) on delete cascade,
  game_id uuid not null references games (id),
  market market_type not null,
  line numeric(6, 2),
  status action_status not null default 'pending',
  stake_amount numeric(10, 2),
  stake_currency text not null default 'USD',
  stake_note text not null default 'This amount is informational only. ACTION does not hold or transfer funds.',
  locked_at timestamptz,
  resolved_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stake_amount_positive check (stake_amount is null or stake_amount > 0)
);

create index actions_creator_idx on actions (creator_id);
create index actions_game_idx on actions (game_id);
create index actions_status_idx on actions (status);

create trigger actions_set_updated_at
  before update on actions
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- participants
-- Exactly two rows per MVP action (creator + opponent), each with their own
-- side of the market. Modeled as a table (not two FK columns on actions) so
-- group Actions can be added later without a schema migration.
-- -----------------------------------------------------------------------------

create table participants (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions (id) on delete cascade,
  user_id uuid references users (id) on delete set null,
  phone text not null,
  role participant_role not null,
  status participant_status not null default 'invited',
  selection text not null,
  side_label text not null,
  invite_token text unique,
  invite_expires_at timestamptz,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (action_id, role)
);

create index participants_action_idx on participants (action_id);
create index participants_user_idx on participants (user_id);
create index participants_phone_idx on participants (phone);
create index participants_invite_token_idx on participants (invite_token);

-- -----------------------------------------------------------------------------
-- action_status_history
-- -----------------------------------------------------------------------------

create table action_status_history (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions (id) on delete cascade,
  from_status action_status,
  to_status action_status not null,
  changed_by changed_by_actor not null default 'system',
  note text,
  created_at timestamptz not null default now()
);

create index action_status_history_action_idx on action_status_history (action_id);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  action_id uuid references actions (id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Server code performs authorization in application logic and generally uses
-- the service-role client for privileged writes (e.g. creating a participant
-- row for a phone number with no account yet, or settling an Action from the
-- cron job). These policies are defense-in-depth for the anon/authenticated
-- keys and are what the browser client is bound by directly.
-- -----------------------------------------------------------------------------

alter table users enable row level security;
alter table teams enable row level security;
alter table games enable row level security;
alter table actions enable row level security;
alter table participants enable row level security;
alter table action_status_history enable row level security;
alter table notifications enable row level security;

-- Several policies below need to answer "does this row belong to an action
-- the current user participates in" — which means querying `participants`
-- from inside a policy defined on `participants` itself (and, transitively,
-- from policies on `actions`/`action_status_history`/`users` that ask the
-- same question). A plain subquery against participants() from within its
-- own policy causes Postgres to re-apply that policy to evaluate the
-- subquery, which needs to evaluate the policy again, forever ("infinite
-- recursion detected in policy for relation participants", 42P17).
--
-- SECURITY DEFINER functions sidestep this: owned by the role that runs
-- this migration (which owns these tables), they bypass RLS for their own
-- internal query, so referencing them from a policy doesn't re-trigger it.
create or replace function my_action_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select action_id from participants where user_id = auth.uid();
$$;

create or replace function my_co_participant_user_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select p2.user_id
  from participants p1
  join participants p2 on p2.action_id = p1.action_id
  where p1.user_id = auth.uid() and p2.user_id is not null;
$$;

-- users
create policy "users can read their own row"
  on users for select
  using (auth.uid() = id);

create policy "users can read co-participants' basic info"
  on users for select
  using (id in (select my_co_participant_user_ids()));

create policy "users can update their own row"
  on users for update
  using (auth.uid() = id);

-- teams / games: read-only reference data
create policy "authenticated users can read teams"
  on teams for select
  to authenticated
  using (true);

create policy "authenticated users can read games"
  on games for select
  to authenticated
  using (true);

-- actions
create policy "participants can read their actions"
  on actions for select
  using (id in (select my_action_ids()));

create policy "creators can insert their own actions"
  on actions for insert
  with check (auth.uid() = creator_id);

-- participants
create policy "participants can read rows on their own actions"
  on participants for select
  using (action_id in (select my_action_ids()));

-- action_status_history
create policy "participants can read status history on their actions"
  on action_status_history for select
  using (action_id in (select my_action_ids()));

-- notifications
create policy "users can read their own notifications"
  on notifications for select
  using (auth.uid() = user_id);

create policy "users can mark their own notifications read"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
