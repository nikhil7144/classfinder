-- my_alerts() still hardcoded the old three-member threshold.
--
-- The 2i migration moved the threshold in the three places it knew about, but
-- my_alerts had been written just before it and carried a fourth copy. The
-- result: every group with two members — now perfectly live and visible to
-- coaches — was still being reported to its creator as "needs more members".
--
-- Fixed by asking is_group_active() rather than counting again, so there is
-- one definition of live and this cannot drift a fifth time.
--
-- Run in the Supabase SQL editor. Idempotent.

create or replace function public.my_alerts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pending_pitches', (
      select count(*)
      from public.group_requests r
      join public.groups g on g.id = r.group_id
      where g.creator_id = auth.uid() and r.status = 'pending'
    ),
    -- open, but not yet live: the creator still has people to invite
    'groups_needing_members', (
      select count(*)
      from public.groups g
      where g.creator_id = auth.uid()
        and g.closed_at is null
        and g.expires_at > now()
        and not public.is_group_active(g.id)
    ),
    'accepted_pitches', (
      select count(*)
      from public.group_requests r
      join public.providers p on p.id = r.provider_id
      where p.user_id = auth.uid() and r.status = 'accepted'
    )
  );
$$;

grant execute on function public.my_alerts to anon, authenticated, service_role;
