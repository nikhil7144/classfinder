-- A group activates at 2 members, not 3, and asks for at least 2 students.
--
-- Two neighbours splitting a coach is already a group, and already a better
-- deal for both sides than one family alone. Requiring a third made the
-- commonest real case — two friends in the same society — impossible to post.
--
-- The threshold lives in four places, all of which must move together or a
-- group becomes visible in one view and invisible in another.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. a group is for two or more students
-- ---------------------------------------------------------------------

-- Any existing single-student group predates this rule; nudge it up rather
-- than letting the new constraint fail on it.
update public.groups set student_count = 2 where student_count < 2;

alter table public.groups drop constraint if exists groups_student_count_check;
alter table public.groups
  add constraint groups_student_count_check check (student_count between 2 and 100);

-- ---------------------------------------------------------------------
-- 2. two members makes it live
-- ---------------------------------------------------------------------

create or replace view public.active_groups
with (security_invoker = on) as
  select g.*, m.member_count
  from public.groups g
  join (
    select group_id, count(*) as member_count
    from public.group_members
    group by group_id
  ) m on m.group_id = g.id
  where m.member_count >= 2
    and g.expires_at > now()
    and g.closed_at is null;

create or replace function public.is_group_active(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.expires_at > now()
      and g.closed_at is null
      and (select count(*) from public.group_members m where m.group_id = g.id) >= 2
  );
$$;

-- groups_for_provider carries its own copy of the liveness test, because it
-- is security definer and cannot lean on the view's RLS.
create or replace function public.groups_for_provider(
  p_provider_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  service_category_id uuid,
  service_name text,
  area_id uuid,
  area_name text,
  city_name text,
  student_count integer,
  notes text,
  member_count bigint,
  expires_at timestamptz,
  created_at timestamptz,
  already_requested boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id, g.service_category_id, sc.name, g.area_id, a.name, c.name,
    g.student_count, g.notes,
    (select count(*) from public.group_members gm where gm.group_id = g.id),
    g.expires_at, g.created_at,
    exists (
      select 1 from public.group_requests r
      where r.group_id = g.id and r.provider_id = p_provider_id
    )
  from public.groups g
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  join public.cities c on c.id = a.city_id
  join public.providers p on p.id = p_provider_id
  where
    p.user_id = auth.uid()
    and p.approved = true
    and p.is_suspended = false
    and p.provider_type <> 'event_planner'
    and (select count(*) from public.group_members gm where gm.group_id = g.id) >= 2
    and g.expires_at > now()
    and g.closed_at is null
    and p.service_category_ids @> array[g.service_category_id]
    and exists (
      select 1 from public.provider_discoverable_areas pda
      where pda.provider_id = p.id and pda.area_id = g.area_id
    )
  order by g.created_at desc
  limit p_limit;
$$;

grant execute on function public.is_group_active to anon, authenticated, service_role;
grant execute on function public.groups_for_provider to anon, authenticated, service_role;
grant select on public.active_groups to anon, authenticated, service_role;
