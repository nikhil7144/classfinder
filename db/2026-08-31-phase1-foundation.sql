-- ClassFinder Phase 1: profiles, seekers, providers, branches, taxonomy.
-- Unlike bridgeup, RLS is ON for every table here (see plan: "Security" and
-- "Phase 1 — Detailed Build Plan §1"). This is a fresh empty Supabase
-- project, so tables are created from scratch, not altered.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('seeker','provider','admin')),
  profile_complete boolean not null default false,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.seekers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  name text,
  city text,
  area text,
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_category_master (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_type text not null check (provider_type in ('individual','institution')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, provider_type)
);

create table if not exists public.service_category_master (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "group" text not null check ("group" in
    ('sport','wellness_fitness','mind_game','indoor_game','subject','exam_board')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  provider_type text not null check (provider_type in ('individual','institution','event_planner')),
  provider_category_id uuid references public.provider_category_master(id) on delete set null,
  display_name text,
  bio text,
  city text,
  area text,
  service_category_ids uuid[] not null default '{}',
  approved boolean not null default false,
  is_featured boolean not null default false,
  is_suspended boolean not null default false,
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  label text,
  address text,
  city text,
  area text,
  phone text,
  created_at timestamptz not null default now()
);

create index if not exists providers_city_idx on public.providers (city);
create index if not exists providers_provider_type_idx on public.providers (provider_type);
create index if not exists providers_approved_idx on public.providers (approved, is_suspended);
create index if not exists branches_provider_id_idx on public.branches (provider_id);

-- ---------------------------------------------------------------------
-- Row Level Security — on for every table (departure from bridgeup).
-- Service-role key (supabaseServerAdmin) bypasses RLS entirely, same as
-- it always has — admin actions are unaffected.
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.seekers enable row level security;
alter table public.providers enable row level security;
alter table public.provider_category_master enable row level security;
alter table public.service_category_master enable row level security;
alter table public.branches enable row level security;

-- profiles: readable/writable only by the owning user. No public listing.
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- seekers: owner-only, never public (no "browse seekers" surface exists).
create policy "read own seeker row" on public.seekers
  for select using (auth.uid() = user_id);
create policy "insert own seeker row" on public.seekers
  for insert with check (auth.uid() = user_id);
create policy "update own seeker row" on public.seekers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- providers: public read only when approved & not suspended; owner can
-- always read/write their own row regardless of approval state.
create policy "public read approved providers" on public.providers
  for select using (approved = true and is_suspended = false);
create policy "owner read own provider row" on public.providers
  for select using (auth.uid() = user_id);
create policy "owner insert own provider row" on public.providers
  for insert with check (auth.uid() = user_id);
create policy "owner update own provider row" on public.providers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- branches: public read only for branches of a publicly-visible provider;
-- the owning provider can manage their own branches regardless.
create policy "public read branches of approved providers" on public.branches
  for select using (
    exists (
      select 1 from public.providers p
      where p.id = branches.provider_id
        and p.approved = true
        and p.is_suspended = false
    )
  );
create policy "owner manage own branches" on public.branches
  for all using (
    exists (
      select 1 from public.providers p
      where p.id = branches.provider_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.providers p
      where p.id = branches.provider_id and p.user_id = auth.uid()
    )
  );

-- taxonomy: public read; no client-side writes at all (admin CRUD for
-- these goes through a server API using the service-role key, unlike
-- bridgeup's direct anon-key admin writes — see plan §1).
create policy "public read provider categories" on public.provider_category_master
  for select using (true);
create policy "public read service categories" on public.service_category_master
  for select using (true);

-- ---------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------

insert into public.provider_category_master (name, provider_type) values
  ('Coach', 'individual'),
  ('Academic Teacher', 'individual'),
  ('Home Tutor', 'individual'),
  ('Sports Academy', 'institution'),
  ('Sports Center', 'institution'),
  ('Coaching Center', 'institution')
on conflict (name, provider_type) do nothing;

-- ---------------------------------------------------------------------
-- Storage buckets (public read, since profile photos are shown on public
-- provider listings — writes still go through the authenticated upload
-- call, RLS on storage.objects below restricts who can write where).
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('seeker-photos', 'seeker-photos', true),
  ('provider-photos', 'provider-photos', true)
on conflict (id) do nothing;

create policy "public read seeker photos" on storage.objects
  for select using (bucket_id = 'seeker-photos');
create policy "owner upload own seeker photo" on storage.objects
  for insert with check (bucket_id = 'seeker-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update own seeker photo" on storage.objects
  for update using (bucket_id = 'seeker-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public read provider photos" on storage.objects
  for select using (bucket_id = 'provider-photos');
create policy "owner upload own provider photo" on storage.objects
  for insert with check (bucket_id = 'provider-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update own provider photo" on storage.objects
  for update using (bucket_id = 'provider-photos' and (storage.foldername(name))[1] = auth.uid()::text);
