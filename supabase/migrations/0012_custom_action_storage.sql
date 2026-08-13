-- =============================================================================
-- Storage for Custom Action proof photos. Private bucket — proof is
-- informational only (never auto-determines a winner, never bypasses
-- unanimous consensus), and only visible to participants on that specific
-- Action.
--
-- Uploads and downloads in this app go through server code (a Server
-- Action using the service-role client for upload; short-lived signed URLs
-- generated server-side for display) rather than direct browser-to-storage
-- calls, so application code is the primary gate. The policies below are
-- still defense-in-depth: if anything ever does call the Storage API
-- directly with a user's own session, these same rules still apply.
-- Object path convention: `{action_id}/{participant_id}.jpg`.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('custom-action-proof', 'custom-action-proof', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "participants can view proof photos on their actions"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'custom-action-proof'
    and (storage.foldername(name))[1]::uuid in (select my_action_ids())
  );

create policy "participants can upload their own proof photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'custom-action-proof'
    and (storage.foldername(name))[1]::uuid in (select my_action_ids())
    and split_part(storage.filename(name), '.', 1)::uuid in (
      select id from participants
      where action_id = (storage.foldername(name))[1]::uuid and user_id = auth.uid()
    )
  );

create policy "participants can replace their own proof photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'custom-action-proof'
    and split_part(storage.filename(name), '.', 1)::uuid in (
      select id from participants
      where action_id = (storage.foldername(name))[1]::uuid and user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'custom-action-proof'
    and split_part(storage.filename(name), '.', 1)::uuid in (
      select id from participants
      where action_id = (storage.foldername(name))[1]::uuid and user_id = auth.uid()
    )
  );
