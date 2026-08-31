-- Fills out the provider profile, which was far thinner than what a parent
-- actually compares when choosing a coach: experience, fees, certifications,
-- how classes are run, and when/where the provider is available.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. new provider fields
-- ---------------------------------------------------------------------

alter table public.providers
  -- A statement of what the provider actually does for a student, kept
  -- separate from `bio` so search and cards can lead with the useful half.
  add column if not exists help_statement text,
  add column if not exists age integer,
  add column if not exists experience_years integer,

  -- Certifications: [{ name, issuer, year }]
  add column if not exists certifications jsonb not null default '[]'::jsonb,

  -- Fees. A range rather than a single number, because most providers quote
  -- "1500-2500 depending on level", plus a free-text note for the caveats.
  add column if not exists fee_min numeric(10, 2),
  add column if not exists fee_max numeric(10, 2),
  add column if not exists fee_period text,
  add column if not exists fees_note text,

  -- How classes are run. Details of specific group batches get posted by the
  -- provider in their Space rather than modelled as structured fields.
  add column if not exists teaching_places text[] not null default '{}',

  -- Day- and place-wise availability: [{ day, place, start, end }]
  -- Place matters because a provider may teach at their academy at the
  -- weekend and travel to students on weekdays.
  add column if not exists availability jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'providers_fee_period_check'
  ) then
    alter table public.providers add constraint providers_fee_period_check
      check (fee_period is null or fee_period in ('per_hour', 'per_session', 'per_month', 'per_course'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'providers_age_check'
  ) then
    alter table public.providers add constraint providers_age_check
      check (age is null or (age >= 16 and age <= 100));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'providers_experience_check'
  ) then
    alter table public.providers add constraint providers_experience_check
      check (experience_years is null or (experience_years >= 0 and experience_years <= 70));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'providers_fee_range_check'
  ) then
    alter table public.providers add constraint providers_fee_range_check
      check (fee_min is null or fee_max is null or fee_max >= fee_min);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. teaching places reference data
--
-- A table rather than an enum so admin can add formats later without a
-- migration, matching how every other taxonomy here works.
-- ---------------------------------------------------------------------

create table if not exists public.teaching_place_master (
  id text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

insert into public.teaching_place_master (id, label, description, sort_order) values
  ('my_academy', 'At my academy or centre', 'Students come to your own place.', 1),
  ('group_classes', 'Group classes', 'Several students taught together at an agreed place — a society hall, ground or shared venue. Post specific batches in your Space.', 2),
  ('individual_classes', 'Individual classes', 'One-to-one coaching or tuition.', 3)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

alter table public.teaching_place_master enable row level security;

drop policy if exists "public read teaching places" on public.teaching_place_master;
create policy "public read teaching places" on public.teaching_place_master
  for select using (true);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.teaching_place_master
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. search should surface the fields a parent compares
--
-- The return type gains columns here, and Postgres refuses to change the
-- OUT parameters of an existing function via CREATE OR REPLACE, so the old
-- signature has to be dropped first. Dropping loses its grants, which are
-- re-applied below.
-- ---------------------------------------------------------------------

drop function if exists public.search_providers(
  double precision, double precision, uuid, uuid, text, double precision, integer
);

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
  help_statement text,
  provider_type text,
  provider_category_id uuid,
  photo_url text,
  is_featured boolean,
  service_category_ids uuid[],
  experience_years integer,
  fee_min numeric,
  fee_max numeric,
  fee_period text,
  teaching_places text[],
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
    where a.is_live = true
      and (p_area_id is null or a.id = p_area_id)
  ),
  nearest as (
    select distinct on (provider_id)
      provider_id, area_id, area_name, city_name, distance_km
    from points
    order by provider_id, distance_km nulls last
  )
  select
    p.id, p.display_name, p.bio, p.help_statement, p.provider_type,
    p.provider_category_id, p.photo_url, p.is_featured, p.service_category_ids,
    p.experience_years, p.fee_min, p.fee_max, p.fee_period, p.teaching_places,
    n.area_id, n.area_name, n.city_name, n.distance_km
  from nearest n
  join public.providers p on p.id = n.provider_id
  where p.approved = true
    and p.is_suspended = false
    and p.provider_type <> 'event_planner'
    and (p_provider_type is null or p.provider_type = p_provider_type)
    and (p_service_category_id is null
         or p.service_category_ids @> array[p_service_category_id])
    and (n.distance_km is null or n.distance_km <= p_radius_km)
  order by p.is_featured desc, n.distance_km nulls last, p.display_name
  limit p_limit;
$$;

grant execute on function public.search_providers to anon, authenticated, service_role;
