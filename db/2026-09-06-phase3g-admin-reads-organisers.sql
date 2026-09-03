-- Phase 3G — an admin can read the organisers they are meant to approve.
--
-- 3E gave organisers two select policies: public-when-approved, and
-- owner-reads-own. An admin is neither, so the approval queue would have been
-- a page that lists nothing — every row it exists to show is unapproved, and
-- unapproved is exactly what those two policies hide.
--
-- 3A already learned this for Spaces and posts, where every read policy ends
-- with `or exists (... role = 'admin')`. 3E did not, which is the sort of
-- omission that only shows up when the screen gets built.
--
-- Worth doing as a policy rather than a service-role route. app/api/admin/
-- providers exists precisely because providers has no admin policy: the admin
-- screens read through the anon client, saw zero rows, and their approve
-- updates matched nothing while returning 200. Fixing that shape here means
-- the admin console reads organisers as itself, and the only privileged write
-- stays set_organiser_approval, which already checks the role.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3e.

drop policy if exists "admins read organisers" on public.organisers;
create policy "admins read organisers" on public.organisers for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
