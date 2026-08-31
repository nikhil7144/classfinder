-- Two reads the Groups screens need.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. the invite screen
--
-- RLS hides a group from anyone who isn't a member, which is right — but it
-- means someone following a share link has nothing to look at before deciding
-- to join. This returns just enough to decide, for a holder of the link.
--
-- The society name IS included here, unlike the provider view: the link is
-- shared with neighbours in that society, and knowing which society is the
-- entire point of the invitation. Ids are uuids, so this is not enumerable.
-- The creator's identity and contact are still withheld.
-- ---------------------------------------------------------------------

create or replace function public.get_group_invite(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id,
    'service_name', sc.name,
    'area_name', a.name,
    'city_name', c.name,
    'society_name', g.society_name,
    'student_count', g.student_count,
    'notes', g.notes,
    'member_count', (select count(*) from public.group_members m where m.group_id = g.id),
    'expires_at', g.expires_at,
    'is_open', (g.expires_at > now() and g.closed_at is null),
    'already_member', public.is_group_member(g.id)
  )
  from public.groups g
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  join public.cities c on c.id = a.city_id
  where g.id = p_id;
$$;

-- ---------------------------------------------------------------------
-- 2. the groups I'm in
--
-- Member counts come from group_members, which a member can only read for
-- their own rows plus groups they belong to, so counting client-side would
-- under-report. Done here instead, for the caller's own groups only.
-- ---------------------------------------------------------------------

create or replace function public.my_groups()
returns table (
  id uuid,
  service_name text,
  area_name text,
  city_name text,
  society_name text,
  student_count integer,
  member_count bigint,
  expires_at timestamptz,
  closed_at timestamptz,
  is_creator boolean,
  is_active boolean,
  pending_requests bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id, sc.name, a.name, c.name, g.society_name, g.student_count,
    (select count(*) from public.group_members m where m.group_id = g.id),
    g.expires_at, g.closed_at,
    g.creator_id = auth.uid(),
    public.is_group_active(g.id),
    -- only the creator ever sees a pitch count
    case when g.creator_id = auth.uid() then (
      select count(*) from public.group_requests r
      where r.group_id = g.id and r.status = 'pending'
    ) else 0 end,
    g.created_at
  from public.groups g
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  join public.cities c on c.id = a.city_id
  where exists (
    select 1 from public.group_members m
    where m.group_id = g.id and m.user_id = auth.uid()
  )
  order by g.created_at desc;
$$;

grant execute on function public.get_group_invite to anon, authenticated, service_role;
grant execute on function public.my_groups to anon, authenticated, service_role;
