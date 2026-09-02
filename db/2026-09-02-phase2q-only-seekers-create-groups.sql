-- Phase 2Q — the policy called "seekers create groups" did not check for a seeker.
--
-- Since phase2a it has read, in full:
--
--   with check (creator_id = auth.uid())
--
-- which says only "you may not create a group in someone else's name". Any
-- signed-in account could create one, a coach included — and a coach creating
-- parent demand is either a misunderstanding or an attempt to manufacture a
-- group they can then answer.
--
-- The page has always blocked it (app/groups/new checks the role before
-- showing the form), so nothing was exploited through the app. But the plan's
-- own rule is that the database holds the rule: the mobile app ships the same
-- anon key and would talk to PostgREST directly, where a POST to /groups
-- would have been accepted.
--
-- This makes creating a group carry exactly the same test as joining one,
-- which is where it should have been all along: a registered seeker with a
-- completed profile. An account is a verified email address and nothing more.
--
-- Run in the Supabase SQL editor. Idempotent.

drop policy if exists "seekers create groups" on public.groups;
create policy "seekers create groups" on public.groups for insert
  with check (
    creator_id = auth.uid()
    -- Reading your own profiles row is permitted by the owner-only policy on
    -- profiles, so this subquery is not filtered to nothing — the trap that
    -- phase2f documents. The identical subquery already guards
    -- group_members INSERT.
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'seeker'
        and p.profile_complete = true
    )
  );
