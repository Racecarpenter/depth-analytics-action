-- =============================================================================
-- Fix: "infinite recursion detected in policy for relation participants"
-- (Postgres error 42P17)
--
-- Several SELECT policies from 0001_init.sql determine access by checking
-- "does this row's action_id appear among the current user's participant
-- rows" — which means querying `participants` from inside a policy defined
-- on `participants` itself (and, transitively, from policies on `actions`,
-- `action_status_history`, and `users` that do the same subquery). Postgres
-- re-applies the participants policy to evaluate that inner subquery, which
-- needs to evaluate the policy again, forever.
--
-- Fix: two SECURITY DEFINER helper functions. Because they're owned by the
-- migration-running role (which owns these tables), they bypass RLS for
-- their own internal query — same standard trick Supabase's own docs use
-- for this exact situation — so referencing them from a policy no longer
-- re-triggers that policy.
-- =============================================================================

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

drop policy if exists "participants can read rows on their own actions" on participants;
create policy "participants can read rows on their own actions"
  on participants for select
  using (action_id in (select my_action_ids()));

drop policy if exists "participants can read their actions" on actions;
create policy "participants can read their actions"
  on actions for select
  using (id in (select my_action_ids()));

drop policy if exists "participants can read status history on their actions" on action_status_history;
create policy "participants can read status history on their actions"
  on action_status_history for select
  using (action_id in (select my_action_ids()));

drop policy if exists "users can read co-participants' basic info" on users;
create policy "users can read co-participants' basic info"
  on users for select
  using (id in (select my_co_participant_user_ids()));
