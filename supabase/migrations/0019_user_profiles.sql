-- =============================================================================
-- Lightweight user profiles (V1.2).
--
-- Two new columns on `users`, nothing else — no bio, no links, no gallery.
-- Phone numbers remain the authentication/invitation identity; display_name
-- (already existed) + username + avatar_path together are what the app
-- displays instead of a phone number once someone has set them. See
-- src/features/users/lib/identity.ts for the fallback logic that reads
-- these — nothing about historical Actions changes here, since Actions and
-- participants have only ever referenced user_id, never a copied name.
-- =============================================================================

alter table users add column if not exists username text;
alter table users add column if not exists avatar_path text;

-- Format: lowercase letters/numbers/underscore, must start with a letter,
-- 3-20 characters total. Mirrors the cashtag_format constraint's shape
-- (0004_cashtag.sql) for consistency. Application code normalizes to
-- lowercase before insert (see src/lib/validations/profile.ts) — this
-- constraint is what actually enforces it regardless of what calls the
-- database directly.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'username_format') then
    alter table users
      add constraint username_format check (
        username is null or username ~ '^[a-z][a-z0-9_]{2,19}$'
      );
  end if;
end $$;

-- Case-insensitive uniqueness at the database level. A plain unique index
-- on `username` would still allow "Mike" and "mike" as two different rows;
-- indexing lower(username) instead makes that impossible regardless of what
-- inserts it. No citext extension — this is a self-contained index, no new
-- dependency, and matches how every other uniqueness rule in this schema is
-- enforced (unique index, not a special column type).
create unique index if not exists users_username_lower_idx
  on users (lower(username))
  where username is not null;

-- display_name already existed (0001_init.sql) with no length limit —
-- adding one now that it's a primary-identity field, not just optional
-- flavor text.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'display_name_length') then
    alter table users
      add constraint display_name_length check (
        display_name is null or char_length(display_name) between 1 and 40
      );
  end if;
end $$;
