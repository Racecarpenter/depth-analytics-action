-- New notification type for the profile-completion nudge (see
-- src/features/auth/mutations.ts / verifyOtp). Its own migration/
-- transaction, same reason every other `alter type ... add value` in this
-- schema is isolated — see 0006_referral_notification.sql.
alter type notification_type add value if not exists 'profile_completion';
