-- =============================================================================
-- New ledger transaction type for the temporary beta free-credit paywall
-- option (see 0018_beta_paywall_credits.sql for what actually uses it).
--
-- Its own migration/transaction on purpose, same reason
-- 0006_referral_notification.sql and 0008_payment_notification_types.sql
-- each isolate a single `alter type ... add value`: a new enum value can't
-- be referenced (in a CHECK constraint, a function body, anything) in the
-- same transaction it's added in — Postgres raises "unsafe use of new value
-- of enum type" if you try.
-- =============================================================================

alter type credit_transaction_type add value if not exists 'beta_grant';
