-- Two faults in the Groups RLS, both found by exercising it as a real user.
--
-- 1. Infinite recursion (42P17). The SELECT policy on group_members asked
--    "is the caller a member?" by selecting from group_members — which
--    re-invokes the same policy. Postgres refused any insert or read.
--    Fixed with a security-definer helper, the same shape as is_my_provider:
--    the membership lookup runs outside RLS so it cannot re-enter.
--
-- 2. groups_for_provider() ran as INVOKER over RLS-protected tables, and a
--    provider is never a member of a group, so it would have returned nothing
--    to everyone. It has to be SECURITY DEFINER, because the whole point is to
--    expose a deliberately reduced view to matching providers.
--
--    That is safe here precisely because the function is the boundary: it
--    selects a fixed column list that omits society_name and the creator's
--    identity, and it re-checks approved / not-suspended / not-event-planner
--    plus the service and area match itself. A provider still cannot read the
--    underlying groups row — see the test for that.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. membership check that cannot recurse
-- ---------------------------------------------------------------------

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_group_member to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. rewrite the policies that recursed
-- ---------------------------------------------------------------------

drop policy if exists "members read their groups" on public.groups;
create policy "members read their groups" on public.groups for select
  using (public.is_group_member(id));

drop policy if exists "members read membership" on public.group_members;
create policy "members read membership" on public.group_members for select
  using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------
-- 3. the provider-facing view of demand
-- ---------------------------------------------------------------------

drop function if exists public.groups_for_provider(uuid, integer);

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
security definer          -- see the note at the top of this file
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
    -- the caller must actually own this provider; a definer function must
    -- never take the caller's word for whose results these are
    p.user_id = auth.uid()
    and p.approved = true
    and p.is_suspended = false
    and p.provider_type <> 'event_planner'
    -- live: three members, not expired, not closed
    and (select count(*) from public.group_members gm where gm.group_id = g.id) >= 3
    and g.expires_at > now()
    and g.closed_at is null
    -- matched on what they teach and where they can be found
    and p.service_category_ids @> array[g.service_category_id]
    and exists (
      select 1 from public.provider_discoverable_areas pda
      where pda.provider_id = p.id and pda.area_id = g.area_id
    )
  order by g.created_at desc
  limit p_limit;
$$;

grant execute on function public.groups_for_provider to anon, authenticated, service_role;
