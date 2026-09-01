-- Two gaps that would have shipped Groups half-working.
--
-- 1. A parent can opt in to being called, but nothing ever showed the number
--    to the coach they accepted, so the opt-in did nothing.
-- 2. A pitch arriving was invisible unless the parent happened to open the
--    group — the one moment the whole feature depends on had no signal.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. the parent's number, to an accepted coach who was invited to have it
--
-- Every condition must hold: the caller owns the provider on this request,
-- the parent accepted it, and the parent opted in. A coach cannot otherwise
-- read the creator's profile at all, which is why this is a definer function
-- rather than a join in the page.
-- ---------------------------------------------------------------------

create or replace function public.get_request_contact(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'phone', case when g.show_phone then pr.phone else null end,
    'name', s.name,
    'society_name', g.society_name,
    'shared', g.show_phone
  )
  from public.group_requests r
  join public.groups g on g.id = r.group_id
  join public.providers p on p.id = r.provider_id
  join public.profiles pr on pr.id = g.creator_id
  left join public.seekers s on s.user_id = g.creator_id
  where r.id = p_request_id
    and r.status = 'accepted'
    and p.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 2. what is waiting for me
--
-- One cheap call for the badge, rather than pulling every group on every
-- page. Counts only what the caller can act on.
-- ---------------------------------------------------------------------

create or replace function public.my_alerts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- pitches waiting on a decision, for groups I created
    'pending_pitches', (
      select count(*)
      from public.group_requests r
      join public.groups g on g.id = r.group_id
      where g.creator_id = auth.uid() and r.status = 'pending'
    ),
    -- groups I created that coaches cannot see yet
    'groups_needing_members', (
      select count(*)
      from public.groups g
      where g.creator_id = auth.uid()
        and g.closed_at is null
        and g.expires_at > now()
        and (select count(*) from public.group_members m where m.group_id = g.id) < 3
    ),
    -- my pitches a parent has accepted
    'accepted_pitches', (
      select count(*)
      from public.group_requests r
      join public.providers p on p.id = r.provider_id
      where p.user_id = auth.uid() and r.status = 'accepted'
    )
  );
$$;

grant execute on function public.get_request_contact to anon, authenticated, service_role;
grant execute on function public.my_alerts to anon, authenticated, service_role;
