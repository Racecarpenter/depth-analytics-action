-- Adds the notification type used when a referral reward is granted
-- (features/actions/mutations.ts, respondToInvite's accept branch).
-- Kept as its own migration/statement because Postgres requires
-- ALTER TYPE ... ADD VALUE to not be used in the same transaction it's
-- added in.
alter type notification_type add value if not exists 'referral_reward_earned';
