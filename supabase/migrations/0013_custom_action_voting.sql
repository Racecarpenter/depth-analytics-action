-- =============================================================================
-- Custom Action result resolution: independent, unanimous participant
-- consensus. No majority rule, no creator authority, no arbitration —
-- Action just tallies whether everyone's independent submission agrees.
-- =============================================================================

-- Participant only (must be an accepted participant on this Custom
-- Action). Records one vote for the current round; once every accepted
-- participant has voted this round, checks for unanimity. A self-vote is
-- valid and gets no special treatment — the only rule is that all
-- selections match.
create or replace function submit_custom_action_vote(
  p_action_id uuid,
  p_voter_user_id uuid,
  p_selected_participant_id uuid,
  p_proof_photo_path text default null
)
returns table(
  ok boolean,
  error text,
  all_voted boolean,
  unanimous boolean,
  winner_participant_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_type action_type;
  v_status action_status;
  v_round integer;
  v_voter_participant_id uuid;
  v_accepted_count integer;
  v_round_vote_count integer;
  v_distinct_selections integer;
  v_winner uuid;
begin
  perform pg_advisory_xact_lock(hashtext('vote:' || p_action_id::text));

  select action_type, status, voting_round into v_action_type, v_status, v_round
    from actions where id = p_action_id;

  if v_action_type is null or v_action_type <> 'custom' then
    return query select false, 'not_custom', false, null::boolean, null::uuid;
    return;
  end if;

  if v_status <> 'accepted' then
    return query select false, 'not_open', false, null::boolean, null::uuid;
    return;
  end if;

  select id into v_voter_participant_id
    from participants
    where action_id = p_action_id and user_id = p_voter_user_id and status = 'accepted';

  if v_voter_participant_id is null then
    return query select false, 'not_participant', false, null::boolean, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from participants
    where id = p_selected_participant_id and action_id = p_action_id and status = 'accepted'
  ) then
    return query select false, 'invalid_selection', false, null::boolean, null::uuid;
    return;
  end if;

  -- One submission per participant per round — never revealed to other
  -- voters before they submit their own (this function only ever returns
  -- tallies/aggregates, never another participant's individual selection).
  insert into custom_action_votes (action_id, round, voter_participant_id, selected_participant_id, proof_photo_path)
    values (p_action_id, v_round, v_voter_participant_id, p_selected_participant_id, p_proof_photo_path)
    on conflict (action_id, round, voter_participant_id) do nothing;

  if not found then
    return query select false, 'already_voted', false, null::boolean, null::uuid;
    return;
  end if;

  select count(*) into v_accepted_count from participants where action_id = p_action_id and status = 'accepted';
  select count(*) into v_round_vote_count from custom_action_votes where action_id = p_action_id and round = v_round;

  if v_round_vote_count < v_accepted_count then
    return query select true, null::text, false, null::boolean, null::uuid;
    return;
  end if;

  select count(distinct selected_participant_id) into v_distinct_selections
    from custom_action_votes where action_id = p_action_id and round = v_round;

  if v_distinct_selections = 1 then
    select selected_participant_id into v_winner
      from custom_action_votes where action_id = p_action_id and round = v_round limit 1;

    update actions
      set status = 'resolved', winner_participant_id = v_winner, resolved_at = now()
      where id = p_action_id;

    return query select true, null::text, true, true, v_winner;
    return;
  end if;

  -- Full round, no unanimous agreement: leave the Action open. Nothing
  -- resolves, nobody gets picked for you — see revote_custom_action.
  return query select true, null::text, true, false, null::uuid;
end;
$$;

-- Any accepted participant — no creator-only authority, matching "the
-- creator triggering things must not give them extra say over the
-- outcome." Only callable once the current round is complete and
-- non-unanimous; old rounds are never deleted, so disagreement history
-- stays queryable.
create or replace function revote_custom_action(p_action_id uuid, p_actor_user_id uuid)
returns table(ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_type action_type;
  v_status action_status;
  v_round integer;
  v_is_participant boolean;
  v_accepted_count integer;
  v_round_vote_count integer;
  v_distinct_selections integer;
begin
  perform pg_advisory_xact_lock(hashtext('vote:' || p_action_id::text));

  select action_type, status, voting_round into v_action_type, v_status, v_round
    from actions where id = p_action_id;

  if v_action_type is null or v_action_type <> 'custom' or v_status <> 'accepted' then
    return query select false, 'not_open';
    return;
  end if;

  select exists(
    select 1 from participants where action_id = p_action_id and user_id = p_actor_user_id and status = 'accepted'
  ) into v_is_participant;

  if not v_is_participant then
    return query select false, 'not_participant';
    return;
  end if;

  select count(*) into v_accepted_count from participants where action_id = p_action_id and status = 'accepted';
  select count(*) into v_round_vote_count from custom_action_votes where action_id = p_action_id and round = v_round;

  if v_round_vote_count < v_accepted_count then
    return query select false, 'round_incomplete';
    return;
  end if;

  select count(distinct selected_participant_id) into v_distinct_selections
    from custom_action_votes where action_id = p_action_id and round = v_round;

  if v_distinct_selections <= 1 then
    return query select false, 'already_unanimous';
    return;
  end if;

  update actions set voting_round = voting_round + 1 where id = p_action_id;

  return query select true, null::text;
end;
$$;

revoke execute on function submit_custom_action_vote(uuid, uuid, uuid, text) from public;
revoke execute on function revote_custom_action(uuid, uuid) from public;

grant execute on function submit_custom_action_vote(uuid, uuid, uuid, text) to service_role;
grant execute on function revote_custom_action(uuid, uuid) to service_role;
