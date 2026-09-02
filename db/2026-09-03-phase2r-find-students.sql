-- Phase 2R — the other half of the marketplace: coaches find students.
--
-- ClassFinder has been one-directional since Phase 1. A parent searches, a
-- coach waits. Groups (2A) were the first crack in that: demand a coach could
-- answer. But a group needs two families who already know each other, which
-- is the rarer case, and the commonest one — a single parent who has told us
-- exactly what they want — was recorded nowhere. The seeker profile asked for
-- a name, a number and an area, and stopped.
--
-- Three things follow, and this migration does all three:
--
--   1. A parent states a REQUIREMENT — what, for whom, at what level, where,
--      when, and roughly what they'd pay. Groups are asked the same questions
--      in the same words, because a group is a requirement several families
--      share, not a different object.
--
--   2. A coach browses that demand. groups_for_provider already did this for
--      groups; students_for_provider does it for both kinds at once, because
--      a coach looking for work does not care which feature produced the row.
--
--   3. A coach can approach a parent — which inverts the consent direction
--      the enquiry table was built for, so the parent must accept before a
--      word is exchanged. Rather than a second messaging pipeline, enquiries
--      gain a direction and a pending state: everything downstream
--      (my_threads, trials, notifications, the contact reveal) already
--      works and keeps working.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2n.

-- ---------------------------------------------------------------------
-- 1. what a parent is looking for
--
-- On seekers rather than a requirements table. A parent looking for tennis
-- for one child and maths for another is a real case, but a second table
-- means a second "which requirement is this thread about?" everywhere, and
-- looking_for being an array covers it at a fraction of the cost. If
-- per-child requirements ever earn their own screen, that is the migration
-- that should introduce the table.
--
-- open_to_offers is the consent switch and nothing else reads as one. It is
-- asked in plain words in the form; it defaults true only because a parent
-- who has just typed out what they want has, in the ordinary meaning of it,
-- asked to be found. Turning it off hides them from students_for_provider
-- entirely, immediately.
-- ---------------------------------------------------------------------

alter table public.seekers
  add column if not exists looking_for uuid[] not null default '{}',
  add column if not exists learner_age integer,
  add column if not exists level text,
  add column if not exists preferred_modes text[] not null default '{}',
  add column if not exists preferred_days text[] not null default '{}',
  add column if not exists preferred_time text,
  add column if not exists budget_min integer,
  add column if not exists budget_max integer,
  add column if not exists budget_period text,
  add column if not exists requirement_notes text,
  add column if not exists open_to_offers boolean not null default true,
  add column if not exists requirement_updated_at timestamptz;

do $$ begin
  alter table public.seekers add constraint seekers_level_chk
    check (level is null or level in ('beginner','improver','advanced','exam_prep'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.seekers add constraint seekers_pref_time_chk
    check (preferred_time is null or preferred_time in
      ('weekday_morning','weekday_afternoon','weekday_evening','weekend','flexible'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.seekers add constraint seekers_budget_period_chk
    check (budget_period is null or budget_period in
      ('per_hour','per_session','per_month','per_course'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.seekers add constraint seekers_learner_age_chk
    check (learner_age is null or learner_age between 2 and 99);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.seekers add constraint seekers_budget_range_chk
    check (budget_min is null or budget_max is null or budget_max >= budget_min);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.seekers add constraint seekers_req_notes_len
    check (requirement_notes is null or length(requirement_notes) <= 1000);
exception when duplicate_object then null; end $$;

-- Every read a coach makes is "who wants this, near here" — the array is the
-- selective half.
create index if not exists seekers_looking_for_idx on public.seekers using gin (looking_for);
create index if not exists seekers_open_area_idx on public.seekers (area_id) where open_to_offers;

-- ---------------------------------------------------------------------
-- 2. a group is asked the same questions
--
-- Deliberately the same column names and the same value sets. The group form
-- and the parent form render from one component in the app, and a coach
-- reading a feed of both should not be able to tell which questionnaire a
-- row came from.
-- ---------------------------------------------------------------------

alter table public.groups
  add column if not exists learner_age integer,
  add column if not exists level text,
  add column if not exists preferred_modes text[] not null default '{}',
  add column if not exists preferred_days text[] not null default '{}',
  add column if not exists preferred_time text,
  add column if not exists budget_min integer,
  add column if not exists budget_max integer,
  add column if not exists budget_period text;

do $$ begin
  alter table public.groups add constraint groups_level_chk
    check (level is null or level in ('beginner','improver','advanced','exam_prep'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.groups add constraint groups_pref_time_chk
    check (preferred_time is null or preferred_time in
      ('weekday_morning','weekday_afternoon','weekday_evening','weekend','flexible'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.groups add constraint groups_budget_period_chk
    check (budget_period is null or budget_period in
      ('per_hour','per_session','per_month','per_course'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.groups add constraint groups_learner_age_chk
    check (learner_age is null or learner_age between 2 and 99);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.groups add constraint groups_budget_range_chk
    check (budget_min is null or budget_max is null or budget_max >= budget_min);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. the LLM usage log
--
-- app/admin/api-usage has read this table since Phase 1 and nothing ever
-- created it — the page was carried over whole from MentBridge along with
-- lib/gemini, and ClassFinder had no AI call to log until now. Created here
-- because section 6 is the first one.
-- ---------------------------------------------------------------------

create table if not exists public.llm_usage_log (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  -- Whichever row the call was made for. No FK: purposes come and go, and a
  -- usage log should never be the thing that blocks a delete.
  related_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_log_created_idx on public.llm_usage_log (created_at desc);

alter table public.llm_usage_log enable row level security;

-- Written by the service role only (lib/gemini uses supabaseServerAdmin, which
-- bypasses RLS). Read by admins, which is all the page needs.
drop policy if exists "admins read llm usage" on public.llm_usage_log;
create policy "admins read llm usage" on public.llm_usage_log for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

grant select on public.llm_usage_log to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. an enquiry gets a direction
--
-- phase2l argued at length for enquiries being separate from group_requests,
-- and every word of that still holds: the two are governed in opposite
-- directions. What it did not anticipate is the same inversion arriving
-- inside enquiries themselves — a coach approaching a parent.
--
-- The alternative was a third table with its own messages, its own read
-- model, its own notification triggers and its own entry in THREAD_API: three
-- copies of machinery that already exists, to record one fact — who spoke
-- first. So enquiries carry that as a column, and gain the one state the
-- seeker-initiated direction never needed: 'pending', meaning a coach has
-- written and the parent has not yet agreed to hear it.
--
-- The consent rule is the group rule, restated: a stranger approaching a
-- family gets nothing until the family says yes. While pending —
--   * the coach cannot send a second message — enquiry_messages has always
--     required an open enquiry, and 'pending' is the first status that is
--     neither open nor dead
--   * the coach is not told the parent's name, nor shown their photo
--   * the phone is not shared, and cannot be until the parent accepts
-- ---------------------------------------------------------------------

alter table public.enquiries
  add column if not exists initiated_by text not null default 'seeker';

do $$ begin
  alter table public.enquiries add constraint enquiries_initiated_by_chk
    check (initiated_by in ('seeker','provider'));
exception when duplicate_object then null; end $$;

alter table public.enquiries drop constraint if exists enquiries_status_check;
alter table public.enquiries add constraint enquiries_status_check
  check (status in ('pending','open','declined'));

-- Only a coach's cold approach may be pending, and it must never start life
-- already open. Both directions are pinned here rather than left to the
-- policies, because a bug that let a provider insert status 'open' would skip
-- consent altogether.
do $$ begin
  alter table public.enquiries add constraint enquiries_direction_status_chk
    check (
      (initiated_by = 'seeker' and status in ('open','declined'))
      or (initiated_by = 'provider' and status in ('pending','open','declined'))
    );
exception when duplicate_object then null; end $$;

-- A cold approach must be substantive, for the reason a group pitch must be:
-- the parent is judging a stranger on this paragraph alone. A parent's own
-- question stays welcome at ten characters — phase2l's reasoning, unchanged.
do $$ begin
  alter table public.enquiries add constraint enquiries_approach_len
    check (initiated_by <> 'provider' or length(message) >= 20);
exception when duplicate_object then null; end $$;

create index if not exists enquiries_pending_idx
  on public.enquiries (seeker_id) where status = 'pending';

-- One approach per coach per family, ever. phase2l let a declined enquiry be
-- re-sent, and gave the reason: the group rule against a stranger trying
-- again exists to stop a family being pestered, "and that reasoning does not
-- run in this direction". In this direction it does — so it applies. A parent
-- who says no to a coach has said it once and for good; the parent may still
-- go and enquire themselves later, which is a row with the other direction.
create unique index if not exists enquiries_one_approach
  on public.enquiries (seeker_id, provider_id)
  where initiated_by = 'provider';

-- The coach's side of the insert. Mirrors "seeker sends enquiry" with every
-- clause inverted, plus the two this direction adds: the parent must be open
-- to being approached, and the row must start pending.
drop policy if exists "provider approaches seeker" on public.enquiries;
create policy "provider approaches seeker" on public.enquiries for insert
  with check (
    initiated_by = 'provider'
    and status = 'pending'
    and show_phone = false
    and public.is_my_provider(provider_id)
    and exists (
      select 1 from public.providers pr
      where pr.id = provider_id
        and pr.approved = true
        and pr.is_suspended = false
        and pr.provider_type <> 'event_planner'
    )
    and exists (
      select 1 from public.profiles p
      join public.seekers s on s.user_id = p.id
      where p.id = seeker_id
        and p.role = 'seeker'
        and p.profile_complete = true
        and s.open_to_offers = true
    )
  );

-- The existing insert policy predates initiated_by and would now accept a
-- parent writing a row that claims to be a coach's. Restated with the column
-- pinned; otherwise identical to phase2l.
drop policy if exists "seeker sends enquiry" on public.enquiries;
create policy "seeker sends enquiry" on public.enquiries for insert
  with check (
    seeker_id = auth.uid()
    and initiated_by = 'seeker'
    and status = 'open'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'seeker'
        and p.profile_complete = true
    )
    and exists (
      select 1 from public.providers pr
      where pr.id = provider_id
        and pr.approved = true
        and pr.is_suspended = false
        and pr.provider_type <> 'event_planner'
    )
  );

-- Messages. phase2l already required status 'open' here, which then meant
-- only "not declined" — with 'pending' added it becomes the gate that stops a
-- coach writing a second time into a thread the parent has never agreed to
-- open. Restated identically, because a clause now carrying weight it was not
-- written to carry should be visible in the migration that gave it that
-- weight, not left to be rediscovered in phase2l.
drop policy if exists "participants send enquiry messages" on public.enquiry_messages;
create policy "participants send enquiry messages" on public.enquiry_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.enquiries e
      where e.id = enquiry_id
        and e.status = 'open'
        and (e.seeker_id = auth.uid() or public.is_my_provider(e.provider_id))
    )
  );

-- ---------------------------------------------------------------------
-- 5. the parent answers
--
-- Definer for the reason phase2l gave: RLS cannot restrict which columns an
-- UPDATE touches, so granting the seeker UPDATE on enquiries would hand them
-- status and both read timestamps as well.
--
-- Accepting shares the phone only if they asked for it in the same click, so
-- the decision and its terms are one action rather than a setting to go and
-- find afterwards.
-- ---------------------------------------------------------------------

create or replace function public.respond_to_approach(
  p_enquiry_id uuid,
  p_accept boolean,
  p_share_phone boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.enquiries e
     set status = case when p_accept then 'open' else 'declined' end,
         show_phone = p_accept and p_share_phone,
         responded_at = now()
   where e.id = p_enquiry_id
     and e.status = 'pending'
     and e.initiated_by = 'provider'
     and e.seeker_id = auth.uid();

  if not found then
    raise exception 'That approach is not yours to answer, or has been answered already.';
  end if;
end;
$fn$;

-- A coach withdrawing their own approach before it is answered. decline_enquiry
-- covers a coach bowing out of an OPEN thread and deliberately still does only
-- that; this is the pending case, which belongs to the other party.
create or replace function public.withdraw_approach(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from public.enquiries e
   where e.id = p_enquiry_id
     and e.status = 'pending'
     and e.initiated_by = 'provider'
     and public.is_my_provider(e.provider_id);
end;
$fn$;

grant execute on function public.respond_to_approach to anon, authenticated, service_role;
grant execute on function public.withdraw_approach to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. the demand feed
--
-- groups_for_provider (2A/2C/2I) answered "which groups want what I teach,
-- where I teach". This answers the same question over both kinds of demand at
-- once, because a coach looking for work does not care which feature produced
-- the row, and two screens showing halves of the same answer is how a coach
-- ends up believing there is no work.
--
-- Two departures from groups_for_provider, both deliberate:
--
--   * Distance, not exact area. A coach who serves Sector 62 will usually
--     take Sector 63, and the exact-area rule was silently hiding the street
--     next door. The radius is the caller's, defaulting to the same 15 km
--     search has used since Phase 1, and an exact-area match simply scores
--     0 km — so the old behaviour is the top of the new list, not gone.
--
--   * A parent is never named. The row carries an area and a requirement and
--     nothing else that identifies a family: no name, no photo, no society,
--     no number. That is the whole content of open_to_offers — "you may see
--     what I want", not "you may have my details". Contact follows the group
--     rule: the coach writes, the parent decides, and only then is anyone
--     introduced.
--
-- Definer, so seekers' owner-only RLS ("never public — no browse-seekers
-- surface exists", phase1) still holds everywhere else. This function is that
-- surface, and its where clause is the entire boundary: open_to_offers, a
-- completed profile, a live area, and an approved coach who teaches the thing.
-- ---------------------------------------------------------------------

drop function if exists public.students_for_provider(uuid, uuid, uuid, double precision, integer);

create function public.students_for_provider(
  p_provider_id uuid,
  p_service_category_id uuid default null,
  p_area_id uuid default null,
  p_radius_km double precision default 15,
  p_limit integer default 60
)
returns table (
  kind text,
  id uuid,
  service_category_ids uuid[],
  service_names text[],
  service_groups text[],
  area_id uuid,
  area_name text,
  city_name text,
  distance_km double precision,
  learner_age integer,
  level text,
  preferred_modes text[],
  preferred_days text[],
  preferred_time text,
  budget_min integer,
  budget_max integer,
  budget_period text,
  notes text,
  student_count integer,
  member_count bigint,
  expires_at timestamptz,
  created_at timestamptz,
  contact_status text,
  thread_id uuid
)
language sql
stable
security definer
-- extensions is where Supabase keeps PostGIS; without it ST_Distance is
-- unresolvable under the pinned path. Harmless on installs that put PostGIS
-- in public — a search_path may name a schema that does not exist.
set search_path = public, extensions
as $fn$
  -- Columns named so nothing in this function ever has to reference them
  -- unqualified: RETURNS TABLE names are parameters, and a bare "id" or
  -- "service_category_ids" here would be ambiguous against them.
  with me as (
    select p.id as me_id, p.service_category_ids as me_teaches
    from public.providers p
    where p.id = p_provider_id
      and p.user_id = auth.uid()
      and p.approved = true
      and p.is_suspended = false
      -- event planners run spaces; they are never matched to coaching demand
      and p.provider_type <> 'event_planner'
  ),
  -- Every point this coach can be found at. Institutions get one per branch,
  -- individuals one per served area — provider_discoverable_areas already
  -- unions the two.
  my_points as (
    select ST_SetSRID(ST_MakePoint(a.lng, a.lat), 4326)::geography as pt
    from public.provider_discoverable_areas pda
    join public.areas a on a.id = pda.area_id
    where pda.provider_id = (select m.me_id from me m)
      and a.lat is not null and a.lng is not null
  ),
  demand as (
    -- individual parents
    select
      'student'::text as kind,
      s.user_id as id,
      -- only the overlap: a coach is shown the part of the requirement they
      -- can actually answer, not everything the family happens to want
      array(
        select want from unnest(s.looking_for) as want
        intersect
        select teach from unnest((select m.me_teaches from me m)) as teach
      ) as service_category_ids,
      s.area_id as area_id,
      s.learner_age, s.level, s.preferred_modes, s.preferred_days,
      s.preferred_time, s.budget_min, s.budget_max, s.budget_period,
      s.requirement_notes as notes,
      1 as student_count,
      null::bigint as member_count,
      null::timestamptz as expires_at,
      coalesce(s.requirement_updated_at, s.created_at) as created_at,
      e.status as contact_status,
      e.id as thread_id
    from public.seekers s
    join public.profiles pf on pf.id = s.user_id
    -- Whether these two are already talking, and how it went. A declined row
    -- counts: the card must say "not taken up" rather than quietly offering
    -- the same family again.
    left join lateral (
      select x.id, x.status
      from public.enquiries x
      where x.seeker_id = s.user_id
        and x.provider_id = (select m.me_id from me m)
      order by (x.initiated_by = 'provider') desc, x.created_at desc
      limit 1
    ) e on true
    where s.open_to_offers = true
      and pf.role = 'seeker'
      and pf.profile_complete = true
      and s.looking_for && (select m.me_teaches from me m)
      and (p_service_category_id is null or s.looking_for @> array[p_service_category_id])

    union all

    -- groups, on exactly the terms groups_for_provider set: live, unexpired,
    -- open, and past the member threshold
    select
      'group'::text,
      g.id,
      array[g.service_category_id],
      g.area_id,
      g.learner_age, g.level, g.preferred_modes, g.preferred_days,
      g.preferred_time, g.budget_min, g.budget_max, g.budget_period,
      g.notes,
      g.student_count,
      (select count(*) from public.group_members gm where gm.group_id = g.id),
      g.expires_at,
      g.created_at,
      r.status,
      r.id
    from public.groups g
    left join public.group_requests r
      on r.group_id = g.id and r.provider_id = (select m.me_id from me m)
    where g.expires_at > now()
      and g.closed_at is null
      and public.is_group_active(g.id)
      and (select m.me_teaches from me m) @> array[g.service_category_id]
      and (p_service_category_id is null or g.service_category_id = p_service_category_id)
  ),
  located as (
    select
      d.*,
      a.name as area_name,
      c.name as city_name,
      (
        select min(ST_Distance(mp.pt, ST_SetSRID(ST_MakePoint(a.lng, a.lat), 4326)::geography)) / 1000.0
        from my_points mp
      ) as distance_km
    from demand d
    join public.areas a on a.id = d.area_id
    join public.cities c on c.id = a.city_id
    where a.is_live = true
      and (p_area_id is null or a.id = p_area_id)
  )
  select
    l.kind,
    l.id,
    l.service_category_ids,
    array(select sc.name from public.service_category_master sc
           where sc.id = any (l.service_category_ids) order by sc.name),
    array(select distinct sc."group" from public.service_category_master sc
           where sc.id = any (l.service_category_ids)),
    l.area_id, l.area_name, l.city_name, l.distance_km,
    l.learner_age, l.level, l.preferred_modes, l.preferred_days, l.preferred_time,
    l.budget_min, l.budget_max, l.budget_period, l.notes,
    l.student_count, l.member_count, l.expires_at, l.created_at,
    l.contact_status, l.thread_id
  from located l
  where cardinality(l.service_category_ids) > 0
    -- A null distance means the area has no centroid yet, which is an admin
    -- omission rather than a reason to hide real demand.
    and (l.distance_km is null or l.distance_km <= p_radius_km)
  -- Untouched rows first: a coach's next action is always on demand they have
  -- not answered yet, and a long tail of already-pitched cards on top is how
  -- the groups screen came to look empty when it was not.
  order by (l.contact_status is not null), l.distance_km nulls last, l.created_at desc
  limit p_limit;
$fn$;

grant execute on function public.students_for_provider to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. the inbox learns about direction
--
-- my_threads gains initiated_by, and with it the one masking rule this phase
-- adds: while a coach's approach is pending, the coach is shown "A parent"
-- and no photo, exactly as a coach is shown no society name before a group
-- accepts them. Adding a column to the return type means dropping and
-- recreating, which is why the grants below are repeated.
-- ---------------------------------------------------------------------

drop function if exists public.my_threads();

create function public.my_threads()
returns table (
  kind text,
  thread_id uuid,
  group_id uuid,
  provider_id uuid,
  title text,
  subtitle text,
  photo_url text,
  opening text,
  status text,
  initiated_by text,
  created_at timestamptz,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  message_count bigint,
  unread boolean,
  i_am_seeker boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select * from (
  -- group threads
  select
    'group'::text as kind,
    r.id as thread_id,
    g.id as group_id,
    r.provider_id as provider_id,
    case when g.creator_id = auth.uid()
      then p.display_name
      else sc.name || ' group'
    end as title,
    case when g.creator_id = auth.uid()
      then sc.name || ' · ' || g.society_name
      else a.name || case when r.status = 'accepted' then ' · ' || g.society_name else '' end
    end as subtitle,
    case when g.creator_id = auth.uid() then p.photo_url else null end as photo_url,
    r.message as opening,
    r.status as status,
    -- a group pitch is always the coach's approach; named for symmetry so the
    -- app can read one column across both kinds
    'provider'::text as initiated_by,
    r.created_at as created_at,
    m.body as last_message,
    m.created_at as last_message_at,
    m.sender_id as last_sender_id,
    (select count(*) from public.group_messages gm where gm.request_id = r.id) as message_count,
    coalesce(m.created_at, r.created_at)
      > coalesce(
          case when g.creator_id = auth.uid() then r.creator_read_at else r.provider_read_at end,
          '-infinity'::timestamptz
        )
      and coalesce(m.sender_id, p.user_id) <> auth.uid() as unread,
    g.creator_id = auth.uid() as i_am_seeker
  from public.group_requests r
  join public.groups g on g.id = r.group_id
  join public.providers p on p.id = r.provider_id
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  left join lateral (
    select gm.body, gm.created_at, gm.sender_id
    from public.group_messages gm
    where gm.request_id = r.id
    order by gm.created_at desc
    limit 1
  ) m on true
  where g.creator_id = auth.uid() or p.user_id = auth.uid()

  union all

  -- direct enquiries, either direction
  select
    'enquiry'::text,
    e.id,
    null::uuid,
    e.provider_id,
    case
      when e.seeker_id = auth.uid() then p.display_name
      -- not yet accepted: the coach knows a requirement, not a family
      when e.status = 'pending' then 'A parent'
      else coalesce(s.name, 'A parent')
    end,
    case
      when e.seeker_id = auth.uid() then coalesce(sc.name, 'General enquiry')
      else coalesce(sc.name || ' · ', '') || coalesce(sa.name, 'Direct enquiry')
    end,
    case
      when e.seeker_id = auth.uid() then p.photo_url
      when e.status = 'pending' then null
      else s.photo_url
    end,
    e.message,
    e.status,
    e.initiated_by,
    e.created_at,
    m.body,
    m.created_at,
    m.sender_id,
    (select count(*) from public.enquiry_messages em where em.enquiry_id = e.id),
    coalesce(m.created_at, e.created_at)
      > coalesce(
          case when e.seeker_id = auth.uid() then e.seeker_read_at else e.provider_read_at end,
          '-infinity'::timestamptz
        )
      and coalesce(m.sender_id, case when e.initiated_by = 'provider' then p.user_id else e.seeker_id end)
          <> auth.uid(),
    e.seeker_id = auth.uid()
  from public.enquiries e
  join public.providers p on p.id = e.provider_id
  left join public.service_category_master sc on sc.id = e.service_category_id
  left join public.seekers s on s.user_id = e.seeker_id
  left join public.areas sa on sa.id = s.area_id
  left join lateral (
    select em.body, em.created_at, em.sender_id
    from public.enquiry_messages em
    where em.enquiry_id = e.id
    order by em.created_at desc
    limit 1
  ) m on true
  where e.seeker_id = auth.uid() or p.user_id = auth.uid()
  ) t
  order by coalesce(t.last_message_at, t.created_at) desc;
$fn$;

grant execute on function public.my_threads to anon, authenticated, service_role;

-- The contact strip follows the same rule as the thread title: nothing about
-- the family until they have accepted. phase2l's version read s.name
-- unconditionally, which was correct while every enquiry was the parent's own.
create or replace function public.get_enquiry_contact(p_enquiry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'phone', case when e.show_phone and e.status = 'open' then pr.phone else null end,
    'name', case when e.status = 'pending' then null else s.name end,
    'shared', e.show_phone and e.status = 'open'
  )
  from public.enquiries e
  join public.profiles pr on pr.id = e.seeker_id
  left join public.seekers s on s.user_id = e.seeker_id
  where e.id = p_enquiry_id
    and public.is_my_provider(e.provider_id);
$fn$;

grant execute on function public.get_enquiry_contact to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. alerts
--
-- Two fixes and one addition.
--
-- The fixes: phase2j replaced the hardcoded three-member threshold in
-- groups_needing_members with is_group_active(), and phase2l — written
-- alongside it, merged after it — reintroduced the literal < 3. Every group
-- with two members has been telling its creator it needs more people ever
-- since. Asking is_group_active() again, for the fourth and last time.
--
-- The addition: a coach's approach waiting on a parent is the one thing this
-- phase can leave someone owing an answer, so it counts in needs_you like a
-- group pitch does.
-- ---------------------------------------------------------------------

create or replace function public.my_alerts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'pending_pitches', (
      select count(*)
      from public.group_requests r
      join public.groups g on g.id = r.group_id
      where g.creator_id = auth.uid() and r.status = 'pending'
    ),
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
    ),
    -- coaches who have asked to teach this parent's child and are waiting
    'pending_approaches', (
      select count(*)
      from public.enquiries e
      where e.seeker_id = auth.uid()
        and e.initiated_by = 'provider'
        and e.status = 'pending'
    ),
    'unread_threads', (
      select count(*) from public.my_threads() t where t.unread
    ),
    'unanswered_enquiries', (
      select count(*)
      from public.enquiries e
      join public.providers p on p.id = e.provider_id
      where p.user_id = auth.uid()
        and e.status = 'open'
        and not exists (
          select 1 from public.enquiry_messages em
          where em.enquiry_id = e.id and em.sender_id = auth.uid()
        )
    ),
    'needs_you', (
      select count(*)
      from public.my_threads() t
      where t.unread
         or (t.kind = 'group' and t.status = 'pending' and t.i_am_seeker)
         -- a coach's approach the parent has not answered
         or (t.kind = 'enquiry' and t.status = 'pending' and t.i_am_seeker)
         or (t.kind = 'enquiry' and t.status = 'open' and not t.i_am_seeker
             and t.message_count = 0)
    )
  );
$fn$;

grant execute on function public.my_alerts to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9. notifications
--
-- tg_notify_enquiry assumed every enquiry was a parent writing to a coach and
-- would now mail the coach about their own approach. It branches on direction
-- instead; the parent's mail says who is asking and what it is about, because
-- that is the whole of what they are being asked to decide on.
-- ---------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'enquiry_received',
    'approach_received',
    'pitch_received',
    'message_received',
    'trial_proposed',
    'trial_answered'
  ));

create or replace function public.tg_notify_enquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_provider_user uuid;
  v_provider_name text;
  v_seeker_name text;
  v_service text;
begin
  select p.user_id, coalesce(p.display_name, 'A coach'), coalesce(s.name, 'A parent')
    into v_provider_user, v_provider_name, v_seeker_name
    from public.providers p
    left join public.seekers s on s.user_id = new.seeker_id
   where p.id = new.provider_id;

  if new.initiated_by = 'provider' then
    select sc.name into v_service
      from public.service_category_master sc
     where sc.id = new.service_category_id;

    perform public.queue_notification(
      new.seeker_id,
      'approach_received',
      'enquiry',
      new.id,
      v_provider_name || ' would like to teach '
        || coalesce(v_service, 'your child'),
      new.message,
      public.thread_url(true, 'enquiry', new.id)
    );
  else
    perform public.queue_notification(
      v_provider_user,
      'enquiry_received',
      'enquiry',
      new.id,
      v_seeker_name || ' has messaged you',
      new.message,
      public.thread_url(false, 'enquiry', new.id)
    );
  end if;

  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists notify_enquiry on public.enquiries;
create trigger notify_enquiry
  after insert on public.enquiries
  for each row execute function public.tg_notify_enquiry();
