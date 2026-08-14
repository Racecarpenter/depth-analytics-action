-- =============================================================================
-- Storage for profile avatars.
--
-- PUBLIC bucket, unlike custom-action-proof (0012_custom_action_storage.sql),
-- which is private. Deliberate difference, not an oversight:
--   - Proof photos are tied to one specific Action's outcome and are only
--     ever meant to be seen by that Action's participants — private +
--     signed URLs is the right call there.
--   - Avatars are the opposite: they're meant to render everywhere a
--     participant's identity shows up (Home cards, Action detail,
--     notifications-adjacent UI), on potentially many participants per
--     page. Signed URLs would mean a per-avatar signing round trip (or a
--     batch of them) on every page render — exactly the N+1 pattern this
--     feature is explicitly asked to avoid. A public bucket with a plain,
--     predictable object path lets the app construct the URL as a pure
--     string (see src/features/users/lib/identity.ts) with zero extra
--     network calls, and avatars aren't sensitive data — nothing about an
--     Action's terms, money, or outcome lives in this bucket.
--
-- Object path convention: `{user_id}/avatar.{ext}`, upserted on replace —
-- "replace existing photo" falls out of the path being deterministic per
-- user, same trick proof photos use for "one photo per participant."
-- Uploads/deletes go through server code with the service-role client
-- (never direct browser-to-storage), so the RLS policies below are
-- defense-in-depth, same posture as every other Storage policy in this
-- schema: if anything ever does call the Storage API directly with a
-- user's own session, these rules still hold, and a user can never
-- overwrite or delete another user's avatar.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']);

create policy "anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can remove their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
