-- New action_status value for Custom Actions once unanimous consensus is
-- reached. Sports Actions are unaffected — they keep using won/lost/push
-- exactly as before; 'resolved' is never assigned to a sports Action.
-- Its own statement/migration per the same constraint as 0006/0008: a newly
-- added enum value can't be used in the same transaction that adds it.
alter type action_status add value if not exists 'resolved';
