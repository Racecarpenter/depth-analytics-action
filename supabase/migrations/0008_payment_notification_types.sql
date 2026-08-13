-- New notification types for the payment settlement feature
-- (0007_payment_settlement.sql). Each is its own ALTER TYPE ... ADD VALUE
-- statement, none of them used elsewhere in this file — Postgres allows
-- multiple additions in one transaction as long as none of the new values
-- are read/compared against in that same transaction, which none are here.
alter type notification_type add value if not exists 'payment_owed';
alter type notification_type add value if not exists 'payment_reminder';
alter type notification_type add value if not exists 'payment_marked_paid';
alter type notification_type add value if not exists 'payment_confirmed';
alter type notification_type add value if not exists 'payment_disputed';
