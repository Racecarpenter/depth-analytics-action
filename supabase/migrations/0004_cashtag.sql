-- =============================================================================
-- Adds an optional Cash App $cashtag to a user's profile.
--
-- This backs a "pay via Cash App" deep link (cash.app/$cashtag/amount) shown
-- to the losing side of a settled Action — never an actual money transfer.
-- ACTION still never collects, holds, or moves funds; this column only
-- stores a public handle the app uses to build a link to Cash App's own
-- payment flow, which the user still has to open and confirm themselves.
-- =============================================================================

alter table users
  add column cashtag text,
  add constraint cashtag_format check (
    cashtag is null or cashtag ~ '^[A-Za-z][A-Za-z0-9_]{0,19}$'
  );
