-- City / area taxonomy with geolocation, and distance-ranked provider search.
--
-- Replaces free-text city/area with an admin-managed hierarchy:
--   cities -> areas (each area carries a lat/lng centroid)
--
-- Two kinds of provider presence, unified for search:
--   individuals   -> provider_service_areas (the areas they travel to / serve)
--   institutions  -> branches.area_id       (one physical area per branch)
--
-- Run in the Supabase SQL editor. Idempotent.

create extension if not exists postgis;

-- ---------------------------------------------------------------------
-- 1. cities and areas
-- ---------------------------------------------------------------------

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, state)
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  -- Admin-entered centroid. Required before an area can sensibly go live,
  -- since it is the fallback origin for seekers who deny GPS.
  lat double precision,
  lng double precision,
  -- Gates the SEEKER side only: providers may register in any defined area,
  -- so supply can be built up quietly before an area is opened to search.
  is_live boolean not null default false,
  created_at timestamptz not null default now(),
  unique (city_id, name)
);

create index if not exists areas_city_idx on public.areas (city_id);
create index if not exists areas_live_idx on public.areas (is_live);

-- ---------------------------------------------------------------------
-- 2. where each provider can be found
-- ---------------------------------------------------------------------

-- Individuals: the areas a coach/tutor is willing to serve.
create table if not exists public.provider_service_areas (
  provider_id uuid not null references public.providers(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider_id, area_id)
);

create index if not exists psa_area_idx on public.provider_service_areas (area_id);

-- Institutions: each branch sits in exactly one area. Branch coordinates are
-- optional and more precise than the area centroid when supplied.
alter table public.branches add column if not exists area_id uuid references public.areas(id);
alter table public.branches add column if not exists lat double precision;
alter table public.branches add column if not exists lng double precision;
create index if not exists branches_area_idx on public.branches (area_id);

-- Seekers: their chosen area, plus stored coordinates used to rank results.
-- These are private — public.seekers is owner-only under RLS with no public
-- read policy, and coordinates are never returned by search_providers().
alter table public.seekers add column if not exists area_id uuid references public.areas(id);
alter table public.seekers add column if not exists lat double precision;
alter table public.seekers add column if not exists lng double precision;

-- NOTE: providers.city/area and branches.city/area (free text) are retained
-- for now so existing code keeps working, and are dropped in a later
-- migration once every write path uses area_id.

-- ---------------------------------------------------------------------
-- 3. one search surface for both provider types
-- ---------------------------------------------------------------------

-- security_invoker so the querying user's RLS still applies through the view.
create or replace view public.provider_discoverable_areas
with (security_invoker = on) as
  select provider_id, area_id from public.provider_service_areas
  union
  select provider_id, area_id from public.branches where area_id is not null;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------

alter table public.cities enable row level security;
alter table public.areas enable row level security;
alter table public.provider_service_areas enable row level security;

-- Cities/areas are public reference data — the provider signup form needs to
-- list every area, including ones not yet live. is_live is not a secret; it
-- is enforced for seekers inside search_providers() instead.
drop policy if exists "public read cities" on public.cities;
create policy "public read cities" on public.cities for select using (true);

drop policy if exists "public read areas" on public.areas;
create policy "public read areas" on public.areas for select using (true);

-- Service areas are readable when the provider is publicly visible, and
-- managed by the provider who owns them.
drop policy if exists "public read service areas of visible providers" on public.provider_service_areas;
create policy "public read service areas of visible providers"
  on public.provider_service_areas for select
  using (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.approved = true and p.is_suspended = false
  ));

drop policy if exists "provider manages own service areas" on public.provider_service_areas;
create policy "provider manages own service areas"
  on public.provider_service_areas for all
  using (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.user_id = auth.uid()
  ));

-- Raw-SQL-created tables don't inherit Supabase's default grants.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.cities, public.areas, public.provider_service_areas
to anon, authenticated, service_role;
grant select on public.provider_discoverable_areas to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. distance-ranked search
--
-- Origin is the seeker's coordinates when shared, otherwise the centroid of
-- the area they picked. Distance to a provider is the nearest of their
-- discoverable points. Radius is a soft cap the caller can widen.
-- ---------------------------------------------------------------------

create or replace function public.search_providers(
  p_lat double precision default null,
  p_lng double precision default null,
  p_area_id uuid default null,
  p_service_category_id uuid default null,
  p_provider_type text default null,
  p_radius_km double precision default 15,
  p_limit integer default 50
)
returns table (
  id uuid,
  display_name text,
  bio text,
  provider_type text,
  provider_category_id uuid,
  photo_url text,
  is_featured boolean,
  service_category_ids uuid[],
  nearest_area_id uuid,
  nearest_area_name text,
  city_name text,
  distance_km double precision
)
language sql
stable
as $$
  with origin as (
    select case
      when p_lat is not null and p_lng is not null
        then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      else (
        select ST_SetSRID(ST_MakePoint(a.lng, a.lat), 4326)::geography
        from public.areas a
        where a.id = p_area_id and a.lat is not null and a.lng is not null
      )
    end as pt
  ),
  -- every point a provider can be found at, with its distance from origin
  points as (
    select
      pda.provider_id,
      a.id   as area_id,
      a.name as area_name,
      c.name as city_name,
      case
        when (select pt from origin) is null or a.lat is null or a.lng is null then null
        else ST_Distance(
               (select pt from origin),
               ST_SetSRID(ST_MakePoint(a.lng, a.lat), 4326)::geography
             ) / 1000.0
      end as distance_km
    from public.provider_discoverable_areas pda
    join public.areas a  on a.id = pda.area_id
    join public.cities c on c.id = a.city_id
    where a.is_live = true                       -- seeker-side launch gate
      and (p_area_id is null or a.id = p_area_id)
  ),
  nearest as (
    select distinct on (provider_id)
      provider_id, area_id, area_name, city_name, distance_km
    from points
    order by provider_id, distance_km nulls last
  )
  select
    p.id, p.display_name, p.bio, p.provider_type, p.provider_category_id,
    p.photo_url, p.is_featured, p.service_category_ids,
    n.area_id, n.area_name, n.city_name, n.distance_km
  from nearest n
  join public.providers p on p.id = n.provider_id
  where p.approved = true
    and p.is_suspended = false
    -- event planners run spaces; they are never surfaced in coach/tutor search
    and p.provider_type <> 'event_planner'
    and (p_provider_type is null or p.provider_type = p_provider_type)
    and (p_service_category_id is null
         or p.service_category_ids @> array[p_service_category_id])
    and (n.distance_km is null or n.distance_km <= p_radius_km)
  order by p.is_featured desc, n.distance_km nulls last, p.display_name
  limit p_limit;
$$;

grant execute on function public.search_providers to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. seed — Ghaziabad, so there is something live to search against.
--    Admin can edit, add or deactivate any of these.
-- ---------------------------------------------------------------------

insert into public.cities (name, state) values
  ('Ghaziabad', 'Uttar Pradesh'),
  ('Noida', 'Uttar Pradesh')
on conflict (name, state) do nothing;

insert into public.areas (city_id, name, lat, lng, is_live)
select c.id, v.name, v.lat, v.lng, v.is_live
from public.cities c
join (values
  ('Ghaziabad', 'Indirapuram',   28.6425, 77.3719, true),
  ('Ghaziabad', 'Vaishali',      28.6500, 77.3390, true),
  ('Ghaziabad', 'Vasundhara',    28.6600, 77.3550, true),
  ('Ghaziabad', 'Kaushambi',     28.6450, 77.3230, true),
  ('Ghaziabad', 'Raj Nagar',     28.6870, 77.4340, false),
  ('Noida',     'Sector 62',     28.6270, 77.3720, false),
  ('Noida',     'Sector 18',     28.5700, 77.3210, false)
) as v(city, name, lat, lng, is_live) on v.city = c.name
on conflict (city_id, name) do nothing;
