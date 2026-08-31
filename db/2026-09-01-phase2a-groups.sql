-- Groups: parent-created demand, so coaches have something to respond to.
--
-- ClassFinder is asymmetric — parents search, coaches wait — so an approved
-- coach goes dormant before demand arrives. A group is a stated requirement
-- ("5 kids in this society want badminton"), surfaced to matching providers.
--
-- Plus the 1:1 request -> accept -> chat pipeline a provider uses to reach the
-- creator. There is deliberately no group wall: children and other members
-- stay out of any conversation with a stranger.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. groups
-- ---------------------------------------------------------------------

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,

  -- what they want, and roughly where
  service_category_id uuid not null references public.service_category_master(id),
  area_id uuid not null references public.areas(id),

  -- Identifying detail. Never exposed publicly — see the RLS view below.
  society_name text not null,
  notes text,

  student_count integer not null default 1 check (student_count between 1 and 100),

  -- Opt in, never a default: this is a parent's personal number.
  show_phone boolean not null default false,

  -- Time-boxed. Stale demand poisons provider trust faster than no demand.
  expires_at timestamptz not null default (now() + interval '10 days'),
  closed_at timestamptz,

  created_at timestamptz not null default now(),

  constraint groups_society_len check (length(society_name) between 2 and 120),
  constraint groups_notes_len check (notes is null or length(notes) <= 1000)
);

create index if not exists groups_area_idx on public.groups (area_id);
create index if not exists groups_service_idx on public.groups (service_category_id);
create index if not exists groups_creator_idx on public.groups (creator_id);

-- Members join via a shared link, but must be registered seekers with a
-- COMPLETED profile. An auth account alone is just a verified email address —
-- three throwaway addresses would activate a fake group and the threshold
-- would filter nothing. A completed profile carries a phone number, which is
-- real friction, and matches the rule used everywhere else in the product:
-- browse freely, complete a profile to participate.
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

-- The creator counts as a member, so a new group starts at 1 of 3.
create or replace function public.add_creator_as_member()
returns trigger language plpgsql security definer as $$
begin
  insert into public.group_members (group_id, user_id)
  values (new.id, new.creator_id)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists groups_add_creator on public.groups;
create trigger groups_add_creator after insert on public.groups
  for each row execute function public.add_creator_as_member();

-- ---------------------------------------------------------------------
-- 2. when is a group actually live?
-- ---------------------------------------------------------------------

create or replace view public.active_groups
with (security_invoker = on) as
  select
    g.*,
    m.member_count
  from public.groups g
  join (
    select group_id, count(*) as member_count
    from public.group_members
    group by group_id
  ) m on m.group_id = g.id
  where m.member_count >= 3          -- quality gate and growth loop in one
    and g.expires_at > now()
    and g.closed_at is null;

-- ---------------------------------------------------------------------
-- 3. pitch -> accept -> chat, adapted from MentBridge
--
-- MentBridge asked to connect first and talked after, but there a veteran was
-- approaching a business. Here a coach is approaching a family, and a parent
-- judging a stranger needs to read what they actually said. So the provider's
-- first message IS the request: the parent sees the pitch, then decides
-- whether a conversation opens.
--
-- The safeguards that makes necessary:
--   * the pitch is required and substantive — no bare "hi"
--   * only an approved, unsuspended provider may send one (RLS, below)
--   * one request per provider per group, so a declined coach cannot try again
--
-- Unlike MentBridge this runs under RLS: only the two participants can read a
-- thread, and replies are refused until the parent accepts.
-- ---------------------------------------------------------------------

create table if not exists public.group_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  -- the pitch itself, not an optional note
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (group_id, provider_id),
  constraint group_requests_message_len check (length(message) between 20 and 1000)
);

create index if not exists group_requests_group_idx on public.group_requests (group_id);
create index if not exists group_requests_provider_idx on public.group_requests (provider_id);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.group_requests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint group_messages_body_len check (length(body) between 1 and 4000)
);

create index if not exists group_messages_request_idx
  on public.group_messages (request_id, created_at);

-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- 4. what providers see
--
-- Society name and the creator's identity are NOT in this function's output.
-- A provider gets them only after the creator accepts their request.
-- ---------------------------------------------------------------------

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
as $$
  select
    g.id, g.service_category_id, sc.name, g.area_id, a.name, c.name,
    g.student_count, g.notes, g.member_count, g.expires_at, g.created_at,
    exists (
      select 1 from public.group_requests r
      where r.group_id = g.id and r.provider_id = p_provider_id
    ) as already_requested
  from public.active_groups g
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  join public.cities c on c.id = a.city_id
  -- matched on both what they teach and where they can be found
  join public.providers p on p.id = p_provider_id
  where p.approved = true
    and p.is_suspended = false
    and p.provider_type <> 'event_planner'
    and p.service_category_ids @> array[g.service_category_id]
    and exists (
      select 1 from public.provider_discoverable_areas pda
      where pda.provider_id = p.id and pda.area_id = g.area_id
    )
  order by g.created_at desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_requests enable row level security;
alter table public.group_messages enable row level security;

-- helper: is the current user the provider behind this provider_id?
create or replace function public.is_my_provider(p_provider_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.providers p
    where p.id = p_provider_id and p.user_id = auth.uid()
  );
$$;

-- Groups: a member sees their own group in full. Everyone else goes through
-- groups_for_provider(), which omits the society name entirely.
drop policy if exists "members read their groups" on public.groups;
create policy "members read their groups" on public.groups for select
  using (exists (
    select 1 from public.group_members gm
    where gm.group_id = id and gm.user_id = auth.uid()
  ));

drop policy if exists "seekers create groups" on public.groups;
create policy "seekers create groups" on public.groups for insert
  with check (creator_id = auth.uid());

drop policy if exists "creator manages own group" on public.groups;
create policy "creator manages own group" on public.groups for update
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());

drop policy if exists "creator deletes own group" on public.groups;
create policy "creator deletes own group" on public.groups for delete
  using (creator_id = auth.uid());

-- Membership: you can see who is in a group you're in, and join or leave
-- yourself. Anyone with the link may join, which is the point.
drop policy if exists "members read membership" on public.group_members;
create policy "members read membership" on public.group_members for select
  using (exists (
    select 1 from public.group_members mine
    where mine.group_id = group_id and mine.user_id = auth.uid()
  ));

drop policy if exists "join a group" on public.group_members;
create policy "join a group" on public.group_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'seeker'          -- a group is parent demand
        and p.profile_complete = true  -- so the member count means something
    )
    -- and only into a group that is still open
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.expires_at > now() and g.closed_at is null
    )
  );

drop policy if exists "leave a group" on public.group_members;
create policy "leave a group" on public.group_members for delete
  using (user_id = auth.uid());

-- Requests: visible to the provider who sent it and the group's creator.
drop policy if exists "participants read requests" on public.group_requests;
create policy "participants read requests" on public.group_requests for select
  using (
    public.is_my_provider(provider_id)
    or exists (select 1 from public.groups g where g.id = group_id and g.creator_id = auth.uid())
  );

-- Only an approved, unsuspended provider may pitch a family. Enforced here
-- rather than in the UI, because this message reaches a parent unvetted.
drop policy if exists "provider sends request" on public.group_requests;
create policy "provider sends request" on public.group_requests for insert
  with check (
    exists (
      select 1 from public.providers p
      where p.id = provider_id
        and p.user_id = auth.uid()
        and p.approved = true
        and p.is_suspended = false
        and p.provider_type <> 'event_planner'
    )
    -- and only to a group that is actually live
    and exists (select 1 from public.active_groups g where g.id = group_id)
  );

drop policy if exists "creator answers request" on public.group_requests;
create policy "creator answers request" on public.group_requests for update
  using (exists (select 1 from public.groups g where g.id = group_id and g.creator_id = auth.uid()))
  with check (exists (select 1 from public.groups g where g.id = group_id and g.creator_id = auth.uid()));

-- Messages: only the two participants, and only once accepted.
drop policy if exists "participants read messages" on public.group_messages;
create policy "participants read messages" on public.group_messages for select
  using (exists (
    select 1 from public.group_requests r
    join public.groups g on g.id = r.group_id
    where r.id = request_id
      and (public.is_my_provider(r.provider_id) or g.creator_id = auth.uid())
  ));

drop policy if exists "participants send messages" on public.group_messages;
create policy "participants send messages" on public.group_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.group_requests r
      join public.groups g on g.id = r.group_id
      where r.id = request_id
        and r.status = 'accepted'
        and (public.is_my_provider(r.provider_id) or g.creator_id = auth.uid())
    )
  );

-- Raw-SQL-created tables don't inherit Supabase's default grants.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.groups, public.group_members, public.group_requests, public.group_messages
to anon, authenticated, service_role;
grant select on public.active_groups to anon, authenticated, service_role;
grant execute on function public.groups_for_provider to anon, authenticated, service_role;
grant execute on function public.is_my_provider to anon, authenticated, service_role;
