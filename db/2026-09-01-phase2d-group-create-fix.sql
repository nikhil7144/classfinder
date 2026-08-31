-- Creating a group failed with 42501, even though the INSERT policy was fine.
--
-- The insert itself succeeded: sending it without Prefer: return=representation
-- returned 201 and the row landed. The failure was the RETURNING clause, which
-- requires SELECT — and the only SELECT policy asked "are you a member of this
-- group?". Membership is added by an AFTER INSERT trigger, which has not fired
-- when RETURNING is evaluated, so the creator could not read back the row they
-- had just written. PostgREST asks for the row by default, so this broke group
-- creation for everyone.
--
-- The fix is also simply correct on its own terms: a creator should be able to
-- read their own group whether or not the membership row exists yet. Permissive
-- policies are OR'd, so this sits alongside the membership rule rather than
-- widening it.
--
-- Run in the Supabase SQL editor. Idempotent.

drop policy if exists "creator reads own group" on public.groups;
create policy "creator reads own group" on public.groups for select
  using (creator_id = auth.uid());
