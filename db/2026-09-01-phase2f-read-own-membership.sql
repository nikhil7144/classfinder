-- Joining a group failed whenever the row was asked for back.
--
-- The insert passed; sending it without Prefer: return=representation returned
-- 201. The RETURNING clause needs SELECT, and the only SELECT policy on
-- group_members was is_group_member(group_id) — a STABLE function, so it reads
-- the snapshot from the start of the statement and cannot see the very row
-- being inserted. PostgREST asks for the row by default, so joining appeared to
-- fail while actually succeeding.
--
-- This is the third time the same shape has bitten: an INSERT policy that
-- passes, paired with a SELECT policy that does not cover the row just written.
-- Worth stating as a rule — every insertable table needs a SELECT path for the
-- writer's own new row, or PostgREST's default will 403 on a successful write.
--
-- Reading your own membership is correct independently of any of that.
--
-- Run in the Supabase SQL editor. Idempotent.

drop policy if exists "read own membership" on public.group_members;
create policy "read own membership" on public.group_members for select
  using (user_id = auth.uid());
