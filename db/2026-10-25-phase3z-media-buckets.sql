-- Phase 3Z — the two post buckets, created rather than assumed.
--
-- SPACE-MEDIA NEVER EXISTED
--
-- Phase 3A only pinned the limits of 'space-media' and left the bucket itself
-- to be made by hand in the Storage UI. It was made as 'space_media' — an
-- underscore, no policies, any MIME type — so the update matched nothing and
-- a coach posting a photo to their Space was told "Bucket not found". The
-- underscore bucket is unused by any code and can be deleted from the
-- Storage UI once this has run. An update that does nothing when
-- its row is missing is exactly the silent failure phase 3K warned about: a
-- bucket that arrives after the form that writes to it is a form that fails in
-- production. It is created here, with policies, so the migration is the whole
-- story.
--
-- The path shape is the one web and mobile already write and cannot change
-- without a release: `<space id>/<file>`. So the write policy checks that the
-- first folder segment is a Space the caller owns, rather than the caller's
-- own id the photo buckets use.
--
-- GROUP-MEDIA IS NEW
--
-- Phase 3Y shipped group posts with a "photo link" box, which asks a parent to
-- host a picture of their child somewhere else first and paste the address —
-- asking most of them not to post at all. Group photos are uploaded now, the
-- same way event posters are.
--
-- Path: `<uploader id>/<group id>/<file>`. The first segment being the
-- uploader's own id is the phase 1 shape, and it is all the bucket checks.
-- Whether that person may post to the group is the group_posts insert policy's
-- job, which already requires membership of a live group; a file uploaded by
-- someone who then cannot post is an orphan, not a leak.
--
-- Both are public read, like every other image here. A members-only post's
-- file is reachable by anybody holding its address, and its address is a
-- random uuid only members are shown. The privacy page says so.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. space-media
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('space-media', 'space-media', true)
on conflict (id) do nothing;

update storage.buckets
   set public = true,
       file_size_limit = 5242880,  -- 5 MB, the same ceiling as every other image
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'space-media';

drop policy if exists "public read space media" on storage.objects;
create policy "public read space media" on storage.objects
  for select using (bucket_id = 'space-media');

drop policy if exists "coach uploads to own space" on storage.objects;
create policy "coach uploads to own space" on storage.objects
  for insert with check (
    bucket_id = 'space-media'
    and exists (
      select 1
      from public.spaces s
      join public.providers p on p.id = s.provider_id
      where s.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "coach updates own space media" on storage.objects;
create policy "coach updates own space media" on storage.objects
  for update using (
    bucket_id = 'space-media'
    and exists (
      select 1
      from public.spaces s
      join public.providers p on p.id = s.provider_id
      where s.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "coach deletes own space media" on storage.objects;
create policy "coach deletes own space media" on storage.objects
  for delete using (
    bucket_id = 'space-media'
    and exists (
      select 1
      from public.spaces s
      join public.providers p on p.id = s.provider_id
      where s.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 2. group-media
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('group-media', 'group-media', true)
on conflict (id) do nothing;

update storage.buckets
   set public = true,
       file_size_limit = 5242880,  -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'group-media';

drop policy if exists "public read group media" on storage.objects;
create policy "public read group media" on storage.objects
  for select using (bucket_id = 'group-media');

drop policy if exists "owner uploads own group media" on storage.objects;
create policy "owner uploads own group media" on storage.objects
  for insert with check (
    bucket_id = 'group-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owner updates own group media" on storage.objects;
create policy "owner updates own group media" on storage.objects
  for update using (
    bucket_id = 'group-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owner deletes own group media" on storage.objects;
create policy "owner deletes own group media" on storage.objects
  for delete using (
    bucket_id = 'group-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
