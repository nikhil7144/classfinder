-- Phase 3Y fix — group_posts was never granted to anybody.
--
-- The phase 3Y file enables RLS on group_posts and writes three policies, and
-- that is only half of what Postgres asks for. A policy narrows a privilege;
-- it does not confer one. With no grant on the table, every role outside the
-- owner is refused before a policy is ever consulted, and the refusal is
-- `42501 permission denied for table group_posts` rather than an empty list —
-- so it reads as a server fault, not as "you cannot see this".
--
-- Confirmed against the live database: anon is denied, and since the table
-- has had no grant in any migration, `authenticated` is denied on the same
-- footing — a new table grants nothing to anyone by default.
--
-- What this broke: the three paths in groups.service.ts that go through
-- `asUser(...).from("group_posts")` — the members' own view of the Posts tab,
-- posting, and the author's visibility toggle. The public showcase was
-- unaffected throughout, because `group_public_posts()` is security definer
-- and runs as the owner, which is exactly the property it was given for.
--
-- Tighter than `space_posts`, which grants all four to anon. anon has no
-- business inserting here: the insert policy wants `author_id = auth.uid()`,
-- and for anon that is null and matches nothing — so the grant would be a
-- privilege that only ever produces a policy violation. Select is the one
-- anon needs, to reach the `group_post_is_public(id)` arm of the read policy.
-- This is the shape phase 3J used for events.
--
-- Run in the Supabase SQL editor. Idempotent.

grant select on public.group_posts to anon;
grant select, insert, update, delete on public.group_posts to authenticated, service_role;
