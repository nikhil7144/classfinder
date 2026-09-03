-- Phase 3E — event companies stop being a kind of coach.
--
-- THE PROBLEM
--
-- phase1 made event_planner a provider_type, so an event company shares the
-- providers table with coaches and academies. Every read of that table has
-- had to remember to exclude them ever since:
--
--   18 clauses of `provider_type <> 'event_planner'`, across 12 migrations —
--   search, groups, the demand feed, Spaces, enquiries, the profile RPC.
--
-- A row type that every reader must filter out does not belong in the table.
-- The failure mode is silent and one-directional: miss a clause in a new
-- query and an events business appears in a parent's coach search.
--
-- The columns never fitted either. providers carries service_category_ids,
-- fees, teaching places, availability and service areas — a venue business
-- has none of those, and needs a contact address and a venue, which providers
-- has nowhere to put.
--
-- WHY NOW
--
-- There are zero event_planner rows in production, so this costs no data
-- migration and no backfill. Phase 4 is where organisers get events and
-- bookings; building those on top of providers would deepen the mistake
-- rather than undo it, and every month of delay adds rows that would need
-- moving.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It does not chase down the 18 exclusion clauses. Once provider_type can no
-- longer be 'event_planner', every one of them is inert — always true, never
-- excluding anything. Removing them means rewriting 18 functions and policies
-- for no change in behaviour, which is a large diff and a real chance of
-- breaking a rule that currently works. They go when each function is next
-- touched for its own reasons.
--
-- It also does not add advertisers. They are not a provider_type today and
-- PLAN.md's Phase 5 is explicit that banners are admin-managed with no
-- self-serve advertiser accounts. Giving them logins is a scope change to
-- that phase, not a table.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3c.

-- ---------------------------------------------------------------------
-- 1. the role
-- ---------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('seeker', 'provider', 'organiser', 'admin'));

-- ---------------------------------------------------------------------
-- 2. the organiser
--
-- Modelled on providers where the two genuinely agree — one row per user, an
-- admin approval gate, a suspension flag kept separate from it — and nowhere
-- else. What an events business needs is a way to be contacted and a place
-- to hold an event, not a taxonomy of what it teaches.
-- ---------------------------------------------------------------------

create table if not exists public.organisers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,

  name text,
  about text,
  logo_url text,

  -- How a parent reaches them. A coach is reached through an enquiry thread
  -- the product owns; an events business is reached about a booking, and
  -- publishing a business contact is the normal thing for one to want.
  contact_email text,
  contact_phone text,
  website_url text,

  -- Where they operate. One area, unlike a coach's several: an event happens
  -- somewhere specific, and a company running events across a city still runs
  -- each one at a venue.
  area_id uuid references public.areas(id) on delete set null,
  venue_name text,
  venue_address text,

  -- Same two gates providers have, and separate for the same reason: not yet
  -- approved is waiting, suspended is a decision.
  approved boolean not null default false,
  is_suspended boolean not null default false,

  created_at timestamptz not null default now(),

  constraint organisers_name_len check (name is null or length(name) between 2 and 120),
  constraint organisers_about_len check (about is null or length(about) <= 2000),
  constraint organisers_venue_len check (venue_address is null or length(venue_address) <= 500),
  constraint organisers_logo_is_link
    check (logo_url is null or (logo_url ~ '^https?://' and length(logo_url) <= 1000)),
  constraint organisers_website_is_link
    check (website_url is null or (website_url ~ '^https?://' and length(website_url) <= 1000))
);

create index if not exists organisers_user_idx on public.organisers (user_id);
create index if not exists organisers_area_idx on public.organisers (area_id) where approved and not is_suspended;

-- ---------------------------------------------------------------------
-- 3. RLS — the providers rules, restated for a table that is not providers
-- ---------------------------------------------------------------------

alter table public.organisers enable row level security;

drop policy if exists "public read approved organisers" on public.organisers;
create policy "public read approved organisers" on public.organisers for select
  using (approved = true and is_suspended = false);

drop policy if exists "owner read own organiser row" on public.organisers;
create policy "owner read own organiser row" on public.organisers for select
  using (auth.uid() = user_id);

drop policy if exists "owner insert own organiser row" on public.organisers;
create policy "owner insert own organiser row" on public.organisers for insert
  with check (
    auth.uid() = user_id
    -- approved is an admin's word, not the applicant's. RLS cannot restrict
    -- which columns an UPDATE touches, but it can refuse an INSERT that
    -- arrives pre-approved.
    and approved = false
    and is_suspended = false
    and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'organiser'
    )
  );

drop policy if exists "owner update own organiser row" on public.organisers;
create policy "owner update own organiser row" on public.organisers for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.organisers to anon, authenticated, service_role;

-- The same column problem profiles had in phase3c: an owner may edit their
-- listing, and must not be able to approve it. Column privileges are the only
-- mechanism that restricts which columns an UPDATE names.
revoke update on public.organisers from anon, authenticated;
grant update (
  name, about, logo_url, contact_email, contact_phone, website_url,
  area_id, venue_name, venue_address
) on public.organisers to authenticated;

-- ---------------------------------------------------------------------
-- 4. event_planner stops being a provider_type
--
-- Last, so the constraint change cannot run before the table that replaces
-- it exists. Zero rows use it; if that ever stops being true this will fail
-- loudly rather than silently drop anyone.
-- ---------------------------------------------------------------------

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.providers where provider_type = 'event_planner';
  if v_count > 0 then
    raise exception 'There are % event_planner providers. Move them to organisers first.', v_count;
  end if;
end $$;

alter table public.providers drop constraint if exists providers_provider_type_check;
alter table public.providers
  add constraint providers_provider_type_check
  check (provider_type in ('individual', 'institution'));

-- provider_category_master already only allows individual/institution, so
-- nothing there needs changing — event planners never had a category.

-- ---------------------------------------------------------------------
-- 5. switching into the role
--
-- phase3c's switch_role knew two roles. A third means the abandoned-row
-- cleanup has to know about organisers too, or someone who starts as one and
-- switches away leaves a half-finished listing behind that nothing reads and
-- nothing deletes.
-- ---------------------------------------------------------------------

create or replace function public.switch_role(p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_current text;
  v_complete boolean;
begin
  if p_role not in ('seeker', 'provider', 'organiser') then
    raise exception 'Choose seeker, provider or organiser.';
  end if;

  select role, profile_complete into v_current, v_complete
  from public.profiles where id = auth.uid();

  if v_current is null then
    raise exception 'No profile to switch.';
  end if;

  if v_current = 'admin' then
    raise exception 'Admin accounts cannot change type.';
  end if;

  -- Switching is only allowed while nothing has been published. Once a
  -- profile is complete the listing, branches and approval state are real,
  -- and switching would silently destroy them.
  if v_complete then
    raise exception 'Your profile is already complete, so the account type cannot be changed.'
      using hint = 'Contact support if this is wrong.';
  end if;

  if v_current = p_role then
    return p_role;
  end if;

  -- Drop the half-finished row for the role being left. branches and
  -- provider_service_areas cascade off providers, so they go with it.
  if v_current = 'provider' then
    delete from public.providers where user_id = auth.uid();
  elsif v_current = 'organiser' then
    delete from public.organisers where user_id = auth.uid();
  else
    delete from public.seekers where user_id = auth.uid();
  end if;

  update public.profiles
     set role = p_role, profile_complete = false
   where id = auth.uid();

  return p_role;
end;
$fn$;

grant execute on function public.switch_role to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. one read, for the organiser's own dashboard
--
-- Definer so an unapproved organiser can still see their own listing —
-- "public read approved organisers" would hide it from them, and a business
-- waiting on approval needs to see what it submitted.
-- ---------------------------------------------------------------------

create or replace function public.my_organiser()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'about', o.about,
    'logo_url', o.logo_url,
    'contact_email', o.contact_email,
    'contact_phone', o.contact_phone,
    'website_url', o.website_url,
    'area_id', o.area_id,
    'venue_name', o.venue_name,
    'venue_address', o.venue_address,
    'approved', o.approved,
    'is_suspended', o.is_suspended
  )
  from public.organisers o
  where o.user_id = auth.uid();
$fn$;

grant execute on function public.my_organiser to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. admin approval, mirroring providers
-- ---------------------------------------------------------------------

create or replace function public.set_organiser_approval(
  p_organiser_id uuid,
  p_approved boolean,
  p_suspended boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Not yours to approve.';
  end if;

  update public.organisers o
     set approved = p_approved,
         is_suspended = coalesce(p_suspended, o.is_suspended)
   where o.id = p_organiser_id;
end;
$fn$;

grant execute on function public.set_organiser_approval to authenticated, service_role;
