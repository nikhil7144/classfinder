-- Phase 2T — who the learner is, and what they wanted when.
--
-- Two gaps, one of them structural.
--
-- The small one: nothing anywhere says who the learner is. A 26-year-old
-- learning to swim and a mother enrolling a six-year-old are the same row
-- today, and they are not remotely the same conversation — for the coach
-- reading it, and later for anyone deciding which events, competitions or
-- offers are worth putting in front of that family.
--
-- It goes on seekers as a property of the PERSON, asked beside their name and
-- area and required like them, not inside the requirement. A father is a
-- father whether or not he is searching this month; asked with the
-- requirement it would be missing for everyone who skipped that optional
-- block, and left attached to nothing by anyone who later cleared it — which
-- is to say missing for exactly the people an audience is made of.
--
-- The structural one: seekers.looking_for is a CURRENT-STATE column. A child
-- who did cricket last summer and wants football this term overwrites the
-- cricket, and the fact that they ever played cricket is gone. That fact is
-- most of the value: a family that has moved between two sports in a year is
-- a different (and better) audience for a summer camp than one that has never
-- changed their mind, and no amount of querying the current state recovers it
-- once it has been written over. So every version is kept.
--
-- Written by a TRIGGER, not by the web app — the same rule phase2n set for
-- notifications, for the same reason: the mobile app writes to Supabase
-- directly, and a history maintained by one client is a history with holes in
-- it exactly where the other client's users are. And like those triggers it
-- swallows its own errors: losing an analytics row is a far smaller failure
-- than refusing to save a parent's profile.
--
-- ---------------------------------------------------------------------
-- On what this is for, since it is the point of collecting it
--
-- The roadmap has an advertiser phase and an event-organiser stakeholder, and
-- this is the data they would be sold. Two constraints are therefore built in
-- now, while they are cheap, rather than argued about later:
--
--   1. AGGREGATE BY DEFAULT. audience_segments() below returns counts, never
--      people: no id, no name, no contact, no exact age. It also suppresses
--      any cell smaller than five families, because "one mother of a
--      6-year-old wanting cricket in Sector 62" is not an anonymous statistic
--      — it is a household. Identity leaves this system only through a lead
--      form the family fills in themselves.
--
--   2. CONSENT IS A COLUMN, DEFAULTED OFF. marketing_opt_in has to be asked
--      for and is false until it is. Nothing in this migration reads it,
--      because nothing yet sends anything; the advertiser phase must, and it
--      is here so that phase cannot claim the question was never asked.
--
-- One thing to settle with counsel BEFORE the advertiser phase ships, not
-- during it: most learners here are children, and India's DPDP Act 2023
-- treats a child's personal data as its own category — verifiable parental
-- consent, and a bar on behavioural advertising directed at children. Age
-- band is recorded partly so that rule can actually be enforced in code
-- rather than assumed. Aggregate reporting and a consented lead form are the
-- shapes most likely to survive that review, which is why they are the shapes
-- built here.
-- ---------------------------------------------------------------------
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2r.

-- ---------------------------------------------------------------------
-- 1. who is this for
--
-- 'self' is first because it is the answer the product currently assumes and
-- never asks for. Mother and father are separate values rather than one
-- 'parent' — it is a difference people state about themselves, it costs
-- nothing to keep, and audience_segments() collapses the two anyway.
--
-- Nullable in the schema, required by the app (profile-rules), which is how
-- every other required seeker field already works here: name and area are
-- nullable columns too. It has to stay nullable for the rows that exist
-- before this runs — those profiles become incomplete until their owner
-- answers, and the dashboard asks them to.
-- ---------------------------------------------------------------------

alter table public.seekers
  add column if not exists relation_to_learner text,
  -- Asked for, never assumed. See the header.
  add column if not exists marketing_opt_in boolean not null default false;

do $$ begin
  alter table public.seekers add constraint seekers_relation_chk
    check (relation_to_learner is null or relation_to_learner in
      ('self','mother','father','guardian','relative','other'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. what they wanted, and when
--
-- Append-only. Nothing updates or deletes a row here except the cascade from
-- a parent deleting their account, which is deliberate: this is a record of
-- what was true at a moment, and a record that can be edited afterwards is
-- not one.
--
-- The snapshot is denormalised on purpose. A row has to stay readable years
-- later, after the taxonomy has been renamed and the family has moved twice,
-- and a history that only stores ids is a history that silently rewrites
-- itself every time an admin edits a service category.
-- ---------------------------------------------------------------------

create table if not exists public.requirement_events (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references public.profiles(id) on delete cascade,

  -- created: first time they said anything, or said something again after
  -- clearing it. updated: changed one. cleared: stopped looking.
  change_kind text not null check (change_kind in ('created','updated','cleared')),

  -- the state after this change
  relation_to_learner text,
  learner_age integer,
  level text,
  service_category_ids uuid[] not null default '{}',
  -- Names as they read on the day, for the reason above.
  service_names text[] not null default '{}',
  preferred_modes text[] not null default '{}',
  preferred_days text[] not null default '{}',
  preferred_time text,
  budget_min integer,
  budget_max integer,
  budget_period text,
  area_id uuid references public.areas(id) on delete set null,

  -- What actually moved. Stored rather than derived because "they dropped
  -- cricket and took up football" is the question this table exists to
  -- answer, and making every reader diff against the previous row to find out
  -- is how that question stops being asked.
  added_service_names text[] not null default '{}',
  removed_service_names text[] not null default '{}',

  recorded_at timestamptz not null default now()
);

create index if not exists requirement_events_seeker_idx
  on public.requirement_events (seeker_id, recorded_at desc);
create index if not exists requirement_events_recorded_idx
  on public.requirement_events (recorded_at desc);
create index if not exists requirement_events_services_idx
  on public.requirement_events using gin (service_category_ids);

alter table public.requirement_events enable row level security;

-- Your own history, and an admin's view of all of it. No insert policy at
-- all: every row is written by the trigger below under definer rights, so
-- there is no client path to fabricating one.
drop policy if exists "read own requirement history" on public.requirement_events;
create policy "read own requirement history" on public.requirement_events for select
  using (seeker_id = auth.uid());

drop policy if exists "admins read requirement history" on public.requirement_events;
create policy "admins read requirement history" on public.requirement_events for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

grant select on public.requirement_events to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. the trigger
-- ---------------------------------------------------------------------

create or replace function public.tg_log_requirement()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_old uuid[] := '{}';
  v_new uuid[] := coalesce(new.looking_for, '{}');
  v_kind text;
begin
  if tg_op = 'UPDATE' then
    v_old := coalesce(old.looking_for, '{}');

    -- Only when the requirement itself moved. A parent changing their photo
    -- or their phone number has not changed what they are looking for, and a
    -- history of profile saves is not a history of interests.
    if new.looking_for is not distinct from old.looking_for
       and new.learner_age is not distinct from old.learner_age
       and new.level is not distinct from old.level
       and new.relation_to_learner is not distinct from old.relation_to_learner
       and new.preferred_modes is not distinct from old.preferred_modes
       and new.preferred_days is not distinct from old.preferred_days
       and new.preferred_time is not distinct from old.preferred_time
       and new.budget_min is not distinct from old.budget_min
       and new.budget_max is not distinct from old.budget_max
       and new.budget_period is not distinct from old.budget_period
       and new.area_id is not distinct from old.area_id
    then
      return null;
    end if;
  end if;

  if coalesce(array_length(v_new, 1), 0) = 0 then
    -- Nothing to say, and nothing said before it: an empty profile being
    -- saved is not the event "stopped looking".
    if tg_op = 'INSERT' or coalesce(array_length(v_old, 1), 0) = 0 then
      return null;
    end if;
    v_kind := 'cleared';
  elsif coalesce(array_length(v_old, 1), 0) = 0 then
    v_kind := 'created';
  else
    v_kind := 'updated';
  end if;

  insert into public.requirement_events (
    seeker_id, change_kind,
    relation_to_learner, learner_age, level,
    service_category_ids, service_names,
    preferred_modes, preferred_days, preferred_time,
    budget_min, budget_max, budget_period, area_id,
    added_service_names, removed_service_names
  )
  values (
    new.user_id, v_kind,
    new.relation_to_learner, new.learner_age, new.level,
    v_new,
    array(select sc.name from public.service_category_master sc
           where sc.id = any (v_new) order by sc.name),
    coalesce(new.preferred_modes, '{}'),
    coalesce(new.preferred_days, '{}'),
    new.preferred_time,
    new.budget_min, new.budget_max, new.budget_period, new.area_id,
    array(select sc.name from public.service_category_master sc
           where sc.id in (select added from unnest(v_new) as added
                           except select gone from unnest(v_old) as gone)
           order by sc.name),
    array(select sc.name from public.service_category_master sc
           where sc.id in (select gone from unnest(v_old) as gone
                           except select kept from unnest(v_new) as kept)
           order by sc.name)
  );

  return null;
exception
  when others then
    -- Deliberately swallowed, exactly as the notification triggers are: an
    -- analytics row failing must never be the reason a parent cannot save
    -- their own profile.
    return null;
end;
$fn$;

drop trigger if exists log_requirement on public.seekers;
create trigger log_requirement
  after insert or update on public.seekers
  for each row execute function public.tg_log_requirement();

-- ---------------------------------------------------------------------
-- 4. backfill
--
-- Everyone who already said what they want gets one opening event, so the
-- history does not begin with a gap the size of every user who signed up
-- before this migration. Guarded, so re-running it adds nothing.
-- ---------------------------------------------------------------------

insert into public.requirement_events (
  seeker_id, change_kind, relation_to_learner, learner_age, level,
  service_category_ids, service_names, preferred_modes, preferred_days,
  preferred_time, budget_min, budget_max, budget_period, area_id,
  added_service_names, recorded_at
)
select
  s.user_id, 'created', s.relation_to_learner, s.learner_age, s.level,
  s.looking_for,
  array(select sc.name from public.service_category_master sc
         where sc.id = any (s.looking_for) order by sc.name),
  coalesce(s.preferred_modes, '{}'), coalesce(s.preferred_days, '{}'),
  s.preferred_time, s.budget_min, s.budget_max, s.budget_period, s.area_id,
  array(select sc.name from public.service_category_master sc
         where sc.id = any (s.looking_for) order by sc.name),
  coalesce(s.requirement_updated_at, s.created_at)
from public.seekers s
where coalesce(array_length(s.looking_for, 1), 0) > 0
  and not exists (
    select 1 from public.requirement_events e where e.seeker_id = s.user_id
  );

-- ---------------------------------------------------------------------
-- 5. bring profile_complete in line with the rule this migration changed
--
-- profiles.profile_complete is a STORED derivation, not a computed one. It is
-- recalculated in exactly one place — the dashboard, on load — and every other
-- surface trusts what is stored: the account menu, group creation, the enquiry
-- form, and the RLS policies on enquiries and group_members, which are the
-- ones that matter.
--
-- So adding a required field in the app is only half of adding it. Without
-- this, every seeker who already had a complete profile keeps a stored `true`
-- and full access to everything it gates, right up until they happen to open
-- the dashboard — which for someone who navigates from an email link straight
-- into a conversation may be never.
--
-- Scoped to the one rule this migration introduces. Name, phone and area were
-- already required and already enforced, so re-testing them here would flip
-- rows for reasons that have nothing to do with 2T.
--
-- Only ever true -> false. Nobody's profile becomes complete because a
-- migration ran; that decision belongs to the person filling in the form.
-- ---------------------------------------------------------------------

update public.profiles p
   set profile_complete = false
 where p.role = 'seeker'
   and p.profile_complete
   -- covers both "row exists, relation unanswered" and "no seekers row at all"
   and not exists (
     select 1 from public.seekers s
     where s.user_id = p.id
       and s.relation_to_learner is not null
   );

-- ---------------------------------------------------------------------
-- 6. the audience, as an audience and not as a list of people
--
-- What an event organiser or advertiser is actually buying: how many families
-- in this area want this thing, in this age band. Counts only.
--
-- Three things make that true rather than merely intended:
--
--   * No identifying column is selectable. Not suppressed at the edge —
--     absent from the return type, so no caller can ask for it.
--   * Exact ages become bands. "9" plus an area plus a sport is close to a
--     name in a small society; "6-9" is not.
--   * Cells below five families are dropped, and the floor cannot be lowered
--     by the caller — p_min_families can only raise it.
--
-- Admin-gated for now because admins are the only account type that exists.
-- When the organiser and advertiser roles land, they get this function and
-- not the tables under it.
-- ---------------------------------------------------------------------

create or replace function public.audience_segments(
  p_city_id uuid default null,
  p_min_families integer default 5
)
returns table (
  city_name text,
  area_name text,
  service_name text,
  service_group text,
  age_band text,
  audience text,
  families bigint,
  opted_in_families bigint,
  last_interest_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    c.name,
    a.name,
    sc.name,
    sc."group",
    case
      when s.learner_age is null then 'unknown'
      when s.learner_age < 6 then 'under 6'
      when s.learner_age < 10 then '6-9'
      when s.learner_age < 14 then '10-13'
      when s.learner_age < 18 then '14-17'
      else 'adult'
    end,
    -- Mother and father collapse here. The distinction is worth keeping on
    -- the record and is nobody's business in an aggregate.
    case
      when s.relation_to_learner = 'self' then 'adult learner'
      when s.relation_to_learner in ('mother','father') then 'parent'
      when s.relation_to_learner is null then 'not stated'
      else 'guardian or relative'
    end,
    count(*),
    -- The only number the advertiser phase may act on individually, and it is
    -- reported here so the gap between "audience" and "reachable audience" is
    -- visible before anyone builds a lead form against it.
    count(*) filter (where s.marketing_opt_in),
    max(coalesce(s.requirement_updated_at, s.created_at))
  from public.seekers s
  join public.profiles pf on pf.id = s.user_id and pf.role = 'seeker'
  join public.areas a on a.id = s.area_id
  join public.cities c on c.id = a.city_id
  cross join lateral unnest(s.looking_for) as want(service_id)
  join public.service_category_master sc on sc.id = want.service_id
  where exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.role = 'admin'
    )
    and (p_city_id is null or c.id = p_city_id)
  -- Positional throughout: the two CASE expressions are the grouping keys and
  -- repeating them here is how they drift apart from the ones above.
  group by 1, 2, 3, 4, 5, 6
  -- greatest(), so the floor is a floor: a caller may ask for a coarser
  -- audience, never a sharper one.
  having count(*) >= greatest(coalesce(p_min_families, 5), 5)
  order by count(*) desc, c.name, a.name, sc.name;
$fn$;

grant execute on function public.audience_segments to authenticated, service_role;

comment on function public.audience_segments is
  'Aggregate demand by area, activity, age band and audience. Counts only, '
  'suppressed below five families. The advertiser-safe read; the tables '
  'beneath it are not.';
