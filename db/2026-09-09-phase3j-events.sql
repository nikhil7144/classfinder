-- Phase 3J — events, and the categories people enter.
--
-- WHO OWNS AN EVENT
--
-- Both a coach and an event company can run one. A cricket coach holding an
-- inter-academy tournament is a real case, and organiser-only would block it.
-- So the table carries nullable provider_id AND organiser_id with a check that
-- exactly one is set, rather than a polymorphic owner_id plus an owner_type
-- string. Two nullable foreign keys keep referential integrity: a deleted
-- provider takes its events with it, and no row can name an owner that has
-- never existed. A polymorphic id cannot promise either.
--
-- WHERE AN EVENT IS
--
-- A city, and nothing finer. 3I established that a venue belongs to the event
-- rather than to the company; this is the other half of that decision — the
-- venue is free text on the event, because a ground, a hall and a school
-- auditorium are not a taxonomy worth curating, and an area would be a
-- precision the organiser cannot reliably supply.
--
-- City rather than area also matches what feeds already do (3B): search is
-- area-and-radius because "who can teach my child" is a distance question,
-- and reading a feed is not. Deciding whether to enter a tournament is not
-- either — a family will cross a city for one.
--
-- WHERE THE MONEY AND THE SEATS LIVE
--
-- On the category, not the event. Under-10 singles and under-14 team are
-- different prices and different capacities in the same tournament, and a
-- flat per-event fee can always be expressed as a single category while the
-- reverse cannot. Cheap now; expensive once entries reference a price.
--
-- Capacity, not seat allocation. A ground has a number, not a seat map. The
-- nearer model is a registration platform, not a cinema.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- No approval column. The company is already gated at signup, and a second
-- queue puts an admin between an organiser and the one action they came to
-- perform. What RLS does enforce below is that only an approved, unsuspended
-- owner may publish — the same rule the group pitch uses, in the same place.
--
-- No entries and no payments. They arrive with their own migration, and the
-- receipt number they need must be unwritable by the person it bills.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3e and phase3i.

-- ---------------------------------------------------------------------
-- 1. the event
-- ---------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),

  -- Exactly one of these. See the header.
  provider_id uuid references public.providers(id) on delete cascade,
  organiser_id uuid references public.organisers(id) on delete cascade,

  title text not null,
  about text,
  service_category_id uuid references public.service_category_master(id) on delete set null,
  banner_url text,

  -- Where. City is required; the venue is free text because it is not a
  -- taxonomy, and 3I moved it here from the organiser for exactly that reason.
  city_id uuid not null references public.cities(id),
  venue_name text,
  venue_address text,

  -- How a family books.
  --
  -- Stated, never inferred from whether the URL is null. An inferred rule is
  -- re-derived by every reader and one of them eventually gets it wrong, which
  -- is the failure 3E and 3I were both written to end.
  --
  --   platform — entries are taken here, against the categories below
  --   external — the organiser's own booking site takes them
  --   none     — an announcement; nothing is sold
  booking_mode text not null default 'platform'
    check (booking_mode in ('platform', 'external', 'none')),
  external_booking_url text,

  -- When. starts_at is the only date an event cannot be without.
  booking_opens_at timestamptz,
  booking_closes_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz,

  status text not null default 'draft'
    check (status in ('draft', 'published', 'cancelled', 'completed')),

  created_at timestamptz not null default now(),

  constraint events_one_owner check (num_nonnulls(provider_id, organiser_id) = 1),

  constraint events_title_len check (length(title) between 3 and 160),
  constraint events_about_len check (about is null or length(about) <= 4000),
  constraint events_venue_name_len check (venue_name is null or length(venue_name) <= 160),
  constraint events_venue_address_len
    check (venue_address is null or length(venue_address) <= 500),

  constraint events_banner_is_link
    check (banner_url is null or (banner_url ~ '^https?://' and length(banner_url) <= 1000)),
  constraint events_external_url_is_link
    check (external_booking_url is null
           or (external_booking_url ~ '^https?://' and length(external_booking_url) <= 1000)),

  -- The URL exists when, and only when, the mode says it is used. Storing one
  -- under a mode that ignores it invites a reader to trust it.
  constraint events_external_url_matches_mode check (
    (booking_mode = 'external' and external_booking_url is not null)
    or (booking_mode <> 'external' and external_booking_url is null)
  ),

  -- Ordering. Booking that closes after the event has finished is a typo the
  -- database can refuse for free, and refusing it here means no screen has to.
  constraint events_dates_ordered check (
    (ends_at is null or ends_at >= starts_at)
    and (booking_opens_at is null or booking_closes_at is null
         or booking_opens_at <= booking_closes_at)
    and (booking_closes_at is null or booking_closes_at <= starts_at)
  )
);

create index if not exists events_provider_idx on public.events (provider_id)
  where provider_id is not null;
create index if not exists events_organiser_idx on public.events (organiser_id)
  where organiser_id is not null;
-- The public listing: what is on in a city, soonest first.
create index if not exists events_city_upcoming_idx
  on public.events (city_id, starts_at) where status = 'published';

-- ---------------------------------------------------------------------
-- 2. the categories
--
-- What a family actually enters. Individual or team is declared per category
-- rather than per event, because most competitions carry both — under-10
-- singles and under-14 team in one tournament.
-- ---------------------------------------------------------------------

create table if not exists public.event_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,

  name text not null,
  entry_type text not null check (entry_type in ('individual', 'team')),
  -- Only meaningful for a team, and required for one: a team category with no
  -- size cannot be filled or priced.
  team_size integer,

  -- null means uncapped. Zero would mean "closed", which status already says
  -- better, so it is refused rather than given a second meaning.
  capacity integer,
  fee_amount numeric(10, 2),

  min_age integer,
  max_age integer,

  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint event_categories_name_len check (length(name) between 1 and 120),
  constraint event_categories_team_size_matches_type check (
    (entry_type = 'team' and team_size is not null and team_size >= 2)
    or (entry_type = 'individual' and team_size is null)
  ),
  constraint event_categories_capacity_positive check (capacity is null or capacity > 0),
  constraint event_categories_fee_not_negative check (fee_amount is null or fee_amount >= 0),
  constraint event_categories_ages_sane check (
    (min_age is null or min_age between 2 and 100)
    and (max_age is null or max_age between 2 and 100)
    and (min_age is null or max_age is null or max_age >= min_age)
  ),

  unique (event_id, name)
);

create index if not exists event_categories_event_idx
  on public.event_categories (event_id, sort_order, name);

-- ---------------------------------------------------------------------
-- 3. the two questions RLS needs to ask, and cannot ask directly
--
-- A policy that reads providers or organisers is itself filtered by their
-- RLS. "public read approved organisers" hides an unapproved row, so a policy
-- asking "is this event's owner approved" would quietly evaluate false for
-- exactly the company waiting to be told it is not approved yet. That is the
-- trap phase2e documented and phase2c was broken by.
--
-- So both questions go through security definer functions that return a
-- boolean and no data. Neither leaks anything a caller could not already ask
-- about themselves, and neither can be used to enumerate rows.
-- ---------------------------------------------------------------------

create or replace function public.event_party_is_mine(
  p_provider_id uuid,
  p_organiser_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.providers p
     where p.id = p_provider_id and p.user_id = auth.uid()
  ) or exists (
    select 1 from public.organisers o
     where o.id = p_organiser_id and o.user_id = auth.uid()
  );
$fn$;

-- Approved and not suspended. Used both for "may this owner publish" and for
-- "should the public see this", which are the same condition seen from the
-- two sides — a suspended company's published events must stop being visible
-- without anyone having to walk its rows and unpublish them.
create or replace function public.event_party_is_live(
  p_provider_id uuid,
  p_organiser_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.providers p
     where p.id = p_provider_id and p.approved and not p.is_suspended
  ) or exists (
    select 1 from public.organisers o
     where o.id = p_organiser_id and o.approved and not o.is_suspended
  );
$fn$;

-- anon too, deliberately: Postgres evaluates every applicable SELECT policy,
-- and a policy calling a function the role cannot execute raises rather than
-- evaluating false. auth.uid() is null for anon, so it returns false anyway.
grant execute on function public.event_party_is_mine to anon, authenticated, service_role;
grant execute on function public.event_party_is_live to anon, authenticated, service_role;

-- Categories hang off an event, so their policies ask about the parent. Same
-- reasoning, one hop further out.
create or replace function public.owns_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.events e
     where e.id = p_event_id
       and public.event_party_is_mine(e.provider_id, e.organiser_id)
  );
$fn$;

create or replace function public.event_is_public(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.events e
     where e.id = p_event_id
       and e.status = 'published'
       and public.event_party_is_live(e.provider_id, e.organiser_id)
  );
$fn$;

grant execute on function public.owns_event to anon, authenticated, service_role;
grant execute on function public.event_is_public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. RLS on events
-- ---------------------------------------------------------------------

alter table public.events enable row level security;

drop policy if exists "public read published events" on public.events;
create policy "public read published events" on public.events for select
  using (status = 'published' and public.event_party_is_live(provider_id, organiser_id));

drop policy if exists "owner read own events" on public.events;
create policy "owner read own events" on public.events for select
  using (public.event_party_is_mine(provider_id, organiser_id));

drop policy if exists "admins read events" on public.events;
create policy "admins read events" on public.events for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- An event is created as a draft, always. Publishing is a second act with its
-- own condition, and an insert that arrived pre-published would skip it.
drop policy if exists "owner creates own draft event" on public.events;
create policy "owner creates own draft event" on public.events for insert
  with check (
    public.event_party_is_mine(provider_id, organiser_id)
    and status = 'draft'
  );

-- Editing is the owner's. Publishing additionally requires the company be
-- approved and unsuspended — the same gate the group pitch enforces in RLS
-- rather than in the UI, and for the same reason: the UI is not the rule.
drop policy if exists "owner updates own event" on public.events;
create policy "owner updates own event" on public.events for update
  using (public.event_party_is_mine(provider_id, organiser_id))
  with check (
    public.event_party_is_mine(provider_id, organiser_id)
    and (status <> 'published' or public.event_party_is_live(provider_id, organiser_id))
  );

drop policy if exists "owner deletes own draft event" on public.events;
create policy "owner deletes own draft event" on public.events for delete
  using (public.event_party_is_mine(provider_id, organiser_id) and status = 'draft');

grant select on public.events to anon;
grant select, insert, update, delete on public.events to authenticated, service_role;

-- Ownership is set once, by the insert. Letting an UPDATE name provider_id or
-- organiser_id would let an owner hand their event to somebody else, or take
-- one — the check constraint only counts them, it does not care who they are.
-- created_at is withheld for the ordinary reason.
revoke update on public.events from authenticated;
grant update (
  title, about, service_category_id, banner_url,
  city_id, venue_name, venue_address,
  booking_mode, external_booking_url,
  booking_opens_at, booking_closes_at, starts_at, ends_at,
  status
) on public.events to authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS on categories
--
-- Visible with the event, writable by whoever owns it. A category is not a
-- thing on its own and has no policy of its own.
-- ---------------------------------------------------------------------

alter table public.event_categories enable row level security;

drop policy if exists "read categories of visible events" on public.event_categories;
create policy "read categories of visible events" on public.event_categories for select
  using (public.event_is_public(event_id) or public.owns_event(event_id));

drop policy if exists "owner writes own event categories" on public.event_categories;
create policy "owner writes own event categories" on public.event_categories for insert
  with check (public.owns_event(event_id));

drop policy if exists "owner updates own event categories" on public.event_categories;
create policy "owner updates own event categories" on public.event_categories for update
  using (public.owns_event(event_id)) with check (public.owns_event(event_id));

drop policy if exists "owner deletes own event categories" on public.event_categories;
create policy "owner deletes own event categories" on public.event_categories for delete
  using (public.owns_event(event_id));

drop policy if exists "admins read event categories" on public.event_categories;
create policy "admins read event categories" on public.event_categories for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

grant select on public.event_categories to anon;
grant select, insert, update, delete on public.event_categories
  to authenticated, service_role;

-- event_id is the parent link, fixed at insert: moving a category to another
-- event would move its price and its seats with it.
revoke update on public.event_categories from authenticated;
grant update (
  name, entry_type, team_size, capacity, fee_amount, min_age, max_age, sort_order
) on public.event_categories to authenticated;
