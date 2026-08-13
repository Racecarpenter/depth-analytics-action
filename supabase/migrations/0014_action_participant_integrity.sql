-- =============================================================================
-- Closes a gap introduced by Custom Actions: actions.winner_participant_id
-- and settlement_obligations.debtor_participant_id/creditor_participant_id
-- were plain `references participants (id)` — valid as long as the
-- referenced row exists *anywhere*, but with nothing stopping it from
-- pointing at a participant on a completely different Action.
--
-- In practice every write path already scopes these correctly in
-- application code (settlement_create_obligations only selects from
-- `participants where action_id = p_action_id`; submit_custom_action_vote
-- validates the selected participant the same way; the sports cron derives
-- winner_participant_id from the same action's own participants). This
-- migration makes that guarantee a database-level fact instead of only an
-- application-level one, using Postgres's standard trick for "this column
-- must reference a row that also matches one of my own other columns":
-- a composite foreign key against a composite unique constraint.
--
-- Not applied to custom_action_votes.voter_participant_id /
-- selected_participant_id — those are only ever written by
-- submit_custom_action_vote, which already validates action membership
-- for both columns before insert, and the table has no other write path
-- (no insert/update RLS policy). Adding the same constraint there would be
-- pure ceremony with no case it could ever actually catch. Documented as
-- Future cleanup if that RPC's validation is ever loosened.
-- =============================================================================

-- id is already globally unique (primary key), so this composite unique
-- constraint is free — it doesn't restrict anything new about participants
-- itself, it just gives the two foreign keys below something to point at.
alter table participants
  add constraint participants_id_action_id_unique unique (id, action_id);

-- A NULL winner_participant_id (the common case before an Action resolves)
-- never triggers a composite FK check under Postgres's default MATCH SIMPLE
-- semantics, so this doesn't affect any existing row.
alter table actions
  add constraint actions_winner_participant_same_action
  foreign key (winner_participant_id, id) references participants (id, action_id);

alter table settlement_obligations
  add constraint settlement_obligations_debtor_same_action
  foreign key (debtor_participant_id, action_id) references participants (id, action_id),
  add constraint settlement_obligations_creditor_same_action
  foreign key (creditor_participant_id, action_id) references participants (id, action_id);
