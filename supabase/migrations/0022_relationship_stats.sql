-- =============================================================================
-- Relationship/history queries for V1.2 profiles.
--
-- Three SECURITY DEFINER read functions, same posture as every other
-- privileged function in this schema: they trust p_user_id completely, so
-- they're revoked from anon/authenticated and only ever called from server
-- code (features/users/queries.ts) that passes the *caller's own*
-- authenticated id — never a client-supplied one. That's what makes the
-- "no global search, no unrestricted user directory" requirement hold: a
-- client can ask "who have I had Action with," never "who has this other
-- person had Action with."
--
-- Deliberately plain SQL functions (no denormalized counter table) — at
-- this scale a clean query over participants/actions/settlement_obligations
-- is preferable, and it can never drift from the same data Action Recap /
-- Rivalry history / settlement stats already read.
--
-- "Genuinely participated" is defined the same way in all three: both
-- sides of a shared Action must have participants.status = 'accepted'. An
-- invite that was only ever sent, or was declined, never creates a
-- connection — matches the product preference that reusability comes from
-- actually accepting an Action together, not from someone once typing a
-- phone number.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_people_with_action_history
-- Powers both the no-search "recent/frequent" list and the search box on
-- the Sports/Custom Action creation pickers. Ordered by most recent shared
-- Action, then by how many Actions together — a simple blended sort, not a
-- scored ranking system.
-- -----------------------------------------------------------------------------

create or replace function get_people_with_action_history(
  p_user_id uuid,
  p_search text default null,
  p_limit integer default 5
)
returns table(
  user_id uuid,
  display_name text,
  username text,
  avatar_path text,
  actions_together integer,
  last_interaction_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    u.id as user_id,
    u.display_name,
    u.username,
    u.avatar_path,
    count(distinct shared.action_id)::integer as actions_together,
    max(shared.action_created_at) as last_interaction_at
  from (
    select p1.action_id, a.created_at as action_created_at, p2.user_id as other_user_id
    from participants p1
    join participants p2
      on p2.action_id = p1.action_id
      and p2.user_id is not null
      and p2.user_id <> p1.user_id
      and p2.status = 'accepted'
    join actions a on a.id = p1.action_id
    where p1.user_id = p_user_id and p1.status = 'accepted'
  ) shared
  join users u on u.id = shared.other_user_id
  where p_search is null or p_search = ''
     or u.display_name ilike '%' || p_search || '%'
     or u.username ilike '%' || p_search || '%'
  group by u.id, u.display_name, u.username, u.avatar_path
  order by max(shared.action_created_at) desc, count(distinct shared.action_id) desc
  limit p_limit;
$$;

-- -----------------------------------------------------------------------------
-- get_user_action_stats
-- Global record for one user's lightweight profile: wins/losses (only
-- counted once actions.winner_participant_id is set — pushes and
-- still-open Actions contribute to total_actions but not to wins/losses),
-- total_actions (every Action they actually accepted, any status), and
-- settlement reliability computed as debtor-side obligations only — "when
-- I owe money, do I pay" is the trust signal, not "how much I'm owed."
-- -----------------------------------------------------------------------------

create or replace function get_user_action_stats(p_user_id uuid)
returns table(
  wins integer,
  losses integer,
  total_actions integer,
  settled_count integer,
  owed_total_count integer
)
language sql
security definer
stable
set search_path = public
as $$
  with my_participants as (
    select p.id as participant_id, p.action_id
    from participants p
    where p.user_id = p_user_id and p.status = 'accepted'
  ),
  resolved as (
    select mp.participant_id, a.winner_participant_id
    from my_participants mp
    join actions a on a.id = mp.action_id
    where a.winner_participant_id is not null
  )
  select
    (select count(*) from resolved where winner_participant_id = participant_id)::integer as wins,
    (select count(*) from resolved where winner_participant_id <> participant_id)::integer as losses,
    (select count(*) from my_participants)::integer as total_actions,
    (select count(*)
       from settlement_obligations so
       join my_participants mp on mp.participant_id = so.debtor_participant_id
       where so.payment_status = 'settled')::integer as settled_count,
    (select count(*)
       from settlement_obligations so
       join my_participants mp on mp.participant_id = so.debtor_participant_id)::integer as owed_total_count;
$$;

-- -----------------------------------------------------------------------------
-- get_head_to_head_stats
-- Pairwise record + financial relationship between exactly two users.
-- viewer_wins/viewer_losses only count Actions where one of the TWO people
-- being compared actually won — a third party winning a multi-person
-- Custom Action doesn't produce a decisive result for this specific pair
-- (it still counts toward actions_together, just not toward the W-L
-- record). net_amount sums every direct obligation between exactly these
-- two people, in either direction, regardless of payment_status — the "if
-- everything settled today" net, not just the already-settled portion;
-- all_settled separately reports whether that's actually true yet. This is
-- what makes the 4-person-Custom-Action case correct: settlement_obligations
-- already stores one row per debtor->creditor pair, never one row for the
-- whole pot, so a Custom Action Mike wins against three people only ever
-- contributes ONE obligation row to the Race-vs-Mike relationship, not the
-- full pot.
-- -----------------------------------------------------------------------------

create or replace function get_head_to_head_stats(p_user_id uuid, p_other_user_id uuid)
returns table(
  actions_together integer,
  viewer_wins integer,
  viewer_losses integer,
  net_amount numeric,
  obligations_count integer,
  all_settled boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with shared as (
    select p1.action_id, p1.id as viewer_participant_id, p2.id as other_participant_id, a.winner_participant_id
    from participants p1
    join participants p2
      on p2.action_id = p1.action_id
      and p2.user_id = p_other_user_id
      and p2.status = 'accepted'
    join actions a on a.id = p1.action_id
    where p1.user_id = p_user_id and p1.status = 'accepted'
  ),
  obligations_between as (
    select so.amount, so.payment_status, (pc.user_id = p_user_id) as viewer_is_creditor
    from settlement_obligations so
    join participants pd on pd.id = so.debtor_participant_id
    join participants pc on pc.id = so.creditor_participant_id
    where (pd.user_id = p_user_id and pc.user_id = p_other_user_id)
       or (pd.user_id = p_other_user_id and pc.user_id = p_user_id)
  )
  select
    (select count(*) from shared)::integer as actions_together,
    (select count(*) from shared where winner_participant_id = viewer_participant_id)::integer as viewer_wins,
    (select count(*) from shared where winner_participant_id = other_participant_id)::integer as viewer_losses,
    coalesce((select sum(case when viewer_is_creditor then amount else -amount end) from obligations_between), 0) as net_amount,
    (select count(*) from obligations_between)::integer as obligations_count,
    coalesce((select count(*) filter (where payment_status <> 'settled') = 0 from obligations_between), true) as all_settled;
$$;

revoke execute on function get_people_with_action_history(uuid, text, integer) from public;
revoke execute on function get_user_action_stats(uuid) from public;
revoke execute on function get_head_to_head_stats(uuid, uuid) from public;

grant execute on function get_people_with_action_history(uuid, text, integer) to service_role;
grant execute on function get_user_action_stats(uuid) to service_role;
grant execute on function get_head_to_head_stats(uuid, uuid) to service_role;
