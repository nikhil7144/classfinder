-- Phase 2O — realtime conversations.
--
-- Until now a thread refetched every message every 15 seconds, which is fine
-- for "a coach replied this afternoon" and visibly poor for two people
-- actually talking. MentBridge did this properly and ClassFinder inherited
-- the polling placeholder instead.
--
-- The difference here is RLS. MentBridge ran with RLS off throughout, so its
-- channel had nothing to satisfy; these tables are protected, and Realtime
-- only respects that if the table is in the publication AND the client
-- subscribes with the user's own JWT (supabase-js does the latter for us).
-- Get it wrong in the permissive direction and message rows — families
-- arranging where their children will be — broadcast to anyone who can guess
-- a thread id.
--
-- So: publish exactly three tables, and nothing else. Not group_requests,
-- not enquiries, not notifications.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2l and phase2m.

do $$
declare
  t text;
begin
  foreach t in array array['group_messages', 'enquiry_messages', 'trial_classes']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- A trial is the one of the three that changes after it is written — proposed
-- then confirmed — and an UPDATE only carries the columns in the replica
-- identity for the old row. Without this, Realtime cannot evaluate the RLS
-- policy against the old record and quietly withholds the event, which would
-- look exactly like the feature not working.
alter table public.trial_classes replica identity full;

-- Belt and braces: these three are the whole broadcast surface, and each is
-- readable only through the policies set in phase2a, 2l and 2m. Realtime
-- applies the same SELECT policy per subscriber per row, so a coach cannot
-- listen to another coach's thread even knowing its id.
--
-- Verify after running, as the caller — not with the service role, which
-- bypasses all of it:
--
--   select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' and schemaname = 'public';
--
-- Three rows. If anything else appears, take it out.
