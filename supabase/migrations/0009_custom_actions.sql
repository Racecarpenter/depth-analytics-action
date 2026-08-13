-- =============================================================================
-- Custom Actions — winner-take-all Actions resolved by unanimous participant
-- consensus instead of a sports data provider. action_type is the single
-- discriminator the rest of the app dispatches on. Sports Actions keep
-- working exactly as before: action_type defaults to 'sports', and
-- game_id/market stay effectively required for that type via the check
-- constraint below (they're now nullable at the column level only so
-- Custom Actions, which have neither, can omit them).
-- =============================================================================

create type action_type as enum ('sports', 'custom');

alter table actions
  add column action_type action_type not null default 'sports',
  add column title text,
  add column winner_participant_id uuid references participants (id),
  add column voting_round integer not null default 1;

alter table actions alter column game_id drop not null;
alter table actions alter column market drop not null;

alter table actions
  add constraint action_type_fields_match check (
    (action_type = 'sports' and game_id is not null and market is not null and title is null)
    or
    (action_type = 'custom' and game_id is null and market is null and title is not null)
  );

comment on column actions.winner_participant_id is
  'Set once an Action is resolved (sports grading or unanimous custom consensus). Source of truth for who won, replacing the old "flip won/lost by role" approach for anything beyond two participants.';
comment on column actions.voting_round is
  'Custom Actions only. Increments on Revote; custom_action_votes rows are scoped to a round so disagreement history is retained, not overwritten.';

-- -----------------------------------------------------------------------------
-- participants: relax the old 2-participant-only constraint
-- -----------------------------------------------------------------------------

-- Auto-generated name from the original unnamed `unique (action_id, role)`
-- table constraint in 0001_init.sql. Dropped without IF EXISTS on purpose —
-- if this name is ever wrong, the migration should fail loudly rather than
-- silently leave the 2-participant ceiling in place.
alter table participants drop constraint participants_action_id_role_key;

-- selection/side_label are sports-specific (which side of the market this
-- participant picked) and don't apply to Custom Actions — there's no
-- market to pick a side of. Nullable rather than placeholder strings.
alter table participants alter column selection drop not null;
alter table participants alter column side_label drop not null;

-- At most one creator per Action (unchanged intent, now enforced without
-- also capping non-creator participants at one).
create unique index participants_one_creator_per_action
  on participants (action_id) where role = 'creator';

-- No inviting the same phone number twice into one Action.
alter table participants add constraint participants_action_phone_unique unique (action_id, phone);

-- Max participant count (2-8, including creator) is enforced in application
-- code at creation time — a plain CHECK constraint can't express a cross-row
-- count, and this matches how other quantity limits (e.g. stake bounds) are
-- already validated in this codebase via Zod + mutation-level checks rather
-- than novel SQL.

-- -----------------------------------------------------------------------------
-- custom_action_votes
-- Independent, per-round winner submissions. Never read back to a voter
-- before they've submitted their own — enforced in the RPC layer
-- (submit_custom_action_vote), not here.
-- -----------------------------------------------------------------------------

create table custom_action_votes (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions (id) on delete cascade,
  round integer not null,
  voter_participant_id uuid not null references participants (id),
  selected_participant_id uuid not null references participants (id),
  proof_photo_path text,
  created_at timestamptz not null default now(),
  unique (action_id, round, voter_participant_id)
);

create index custom_action_votes_action_idx on custom_action_votes (action_id, round);

alter table custom_action_votes enable row level security;

create policy "participants can read votes on their actions"
  on custom_action_votes for select
  using (action_id in (select my_action_ids()));

-- No insert/update policy: votes are written only through the
-- submit_custom_action_vote SECURITY DEFINER RPC (0011), which enforces
-- "only accepted participants, one vote per round" server-side.
