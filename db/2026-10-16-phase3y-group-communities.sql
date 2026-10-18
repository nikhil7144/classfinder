-- Phase 3Y — a group becomes a community you can show.
--
-- LIVE AND PUBLIC ARE DIFFERENT THINGS
--
-- Live already exists: `is_group_active()` — two families or more, not
-- expired, not closed — and it is what lets a coach see a group at all
-- through `groups_for_provider`. It means "the families are here and they are
-- looking for a coach".
--
-- Public is new and it means something else entirely: "the creator chose to
-- showcase this on Aspire91". It is never automatic. An accepted coach does
-- not publish a group; only the creator pressing the button does. A group
-- still recruiting its second family cannot be published at all, because
-- recruiting happens privately down the invite link among neighbours, and a
-- showcase is not a recruitment ad.
--
-- So public layers on top of live rather than replacing it:
--
--     public := published_at is not null and is_group_active(id)
--
-- which has a property worth keeping: publishing cannot outlive liveness. A
-- group that expires, closes or drops below two families stops being public
-- on its own. No cleanup job, and no stale pages left in anybody's index.
--
-- TWO CLOCKS SHARING ONE COLUMN
--
-- `expires_at` has been doing one job: gating the demand a coach sees. Ten
-- days is right for that — a request nobody answered in ten days is stale,
-- and GROUP_EXTEND_DAYS in the API pushes it another ten when a creator asks.
--
-- A published showcase is not demand, and ten days is far too short for a
-- page that is meant to be found. But removing the clock entirely would leave
-- a group whose families quietly drifted away sitting forever as a demand
-- signal coaches keep pitching and a page Google keeps crawling. `closed_at`
-- exists for that, and people do not close things.
--
-- So publishing rolls the same column out by ninety days, and real activity —
-- a post, a member, an accepted coach — rolls it again. On lapse the group
-- goes quiet rather than dying: off the public pages, out of the coach feed,
-- nothing deleted, one tap to republish. Two constants, deliberately, because
-- they answer different questions.
--
-- WHO MAY MAKE WHAT PUBLIC
--
-- Posts default to 'members'. A parent putting a photo of their child into
-- their group should have it stay inside the group unless they decide
-- otherwise, and the default is the decision most of them will never revisit.
--
-- The author sets their own post's visibility; the creator curates which of
-- the already-public ones appear on the showcase and in what order. Two locks
-- rather than one, because a creator who could promote any post could publish
-- a photo of another family's child — and that parent consented to "share
-- with my group", not to "show the world".
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. the three new columns
-- ---------------------------------------------------------------------

alter table public.groups
  add column if not exists published_at timestamptz,
  add column if not exists public_headline text,
  add column if not exists public_about text;

alter table public.groups drop constraint if exists groups_public_headline_len;
alter table public.groups
  add constraint groups_public_headline_len
  check (public_headline is null or length(public_headline) <= 140);

alter table public.groups drop constraint if exists groups_public_about_len;
alter table public.groups
  add constraint groups_public_about_len
  check (public_about is null or length(public_about) <= 2000);

-- Only the published ones are ever read by city or area, and there will be
-- far more unpublished than published.
create index if not exists groups_published_idx
  on public.groups (area_id, published_at)
  where published_at is not null;

-- ---------------------------------------------------------------------
-- 2. group_posts
--
-- Deliberately the same shape as space_posts: same two kinds, same storage
-- rule (a URL, never a blob — phase1g), the same 11-character YouTube id, and
-- the same is_hidden that keeps a reported post in the table because the
-- report queue is about it. `show_order` is the creator's curation; null
-- means "not placed", and the showcase falls back to newest first.
-- ---------------------------------------------------------------------

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,

  kind text not null check (kind in ('photo', 'video')),
  body text,

  image_url text,
  youtube_id text,

  -- The author's call, and it starts closed.
  visibility text not null default 'members'
    check (visibility in ('members', 'public')),

  -- The creator's call, and only among posts the author already opened.
  show_order integer,

  is_hidden boolean not null default false,
  hidden_reason text,

  created_at timestamptz not null default now(),

  constraint group_posts_body_len check (body is null or length(body) <= 2000),
  constraint group_posts_image_is_link
    check (image_url is null or (image_url ~ '^https?://' and length(image_url) <= 1000)),
  constraint group_posts_youtube_id_shape
    check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint group_posts_has_media
    check (
      (kind = 'photo' and image_url is not null and youtube_id is null)
      or (kind = 'video' and youtube_id is not null and image_url is null)
    )
);

create index if not exists group_posts_group_idx
  on public.group_posts (group_id, created_at desc);

create index if not exists group_posts_public_idx
  on public.group_posts (group_id, show_order, created_at desc)
  where visibility = 'public' and not is_hidden;

alter table public.group_posts enable row level security;

-- ---------------------------------------------------------------------
-- 3. the predicate
--
-- Shaped like space_is_public(), and for the same reason: putting it in one
-- function means the RLS policy and every read path agree, so a direct query
-- cannot see what a feed function would hide.
--
-- Note what is NOT here: the coach. A group is published by its creator, so a
-- coach being suspended does not un-publish it. What an accepted coach gates
-- is whether media may be posted at all, which is the API's rule, not a read
-- rule — an already-posted photo does not vanish when a coach leaves.
-- ---------------------------------------------------------------------

create or replace function public.group_post_is_public(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.group_posts gp
    join public.groups g on g.id = gp.group_id
    where gp.id = p_post_id
      and gp.visibility = 'public'
      and not gp.is_hidden
      and g.published_at is not null
      and public.is_group_active(g.id)
  );
$fn$;

create or replace function public.group_is_public(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.published_at is not null
      and public.is_group_active(g.id)
  );
$fn$;

grant execute on function public.group_post_is_public to anon, authenticated, service_role;
grant execute on function public.group_is_public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. policies
--
-- Members always see their own group's posts, published or not — the group is
-- theirs and the showcase is a view of it, not the thing itself.
-- ---------------------------------------------------------------------

drop policy if exists "read visible group posts" on public.group_posts;
create policy "read visible group posts" on public.group_posts for select
  using (
    public.group_post_is_public(id)
    or public.is_group_member(group_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "members post to their group" on public.group_posts;
create policy "members post to their group" on public.group_posts for insert
  with check (
    author_id = auth.uid()
    and public.is_group_member(group_id)
    and public.is_group_active(group_id)
  );

-- The author's own post, and only the two fields that are theirs to change.
-- Curation (`show_order`) is the creator's and goes through the API, which is
-- why there is no creator update policy here.
drop policy if exists "author edits own post" on public.group_posts;
create policy "author edits own post" on public.group_posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "author deletes own post" on public.group_posts;
create policy "author deletes own post" on public.group_posts for delete
  using (
    author_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------
-- 5. discovery
--
-- The public read, by city and area and service. Anonymous by design: the
-- whole point of publishing is that a stranger can find it.
--
-- What it does NOT return is the same list the coach view withholds — no
-- society name, no creator, no member names. Publishing a group showcases the
-- class, not the families in it.
--
-- NOT `active_groups`, deliberately. That view is `select g.*, member_count`,
-- and Postgres expands the star when a view is created, not when it is read:
-- it froze the column list at phase 2I and cannot see published_at or either
-- public_ column added above. Recreating it would mean dropping the two
-- phase 2A functions that read it and rebuilding them from a definition that
-- may have drifted since. Reading `groups` directly and calling
-- is_group_active() — which is what the view means anyway — costs one
-- subquery and leaves the old objects alone.
-- ---------------------------------------------------------------------

create or replace function public.groups_discover(
  p_city_id uuid default null,
  p_area_id uuid default null,
  p_service_category_id uuid default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  service_category_id uuid,
  service_name text,
  area_id uuid,
  area_name text,
  city_id uuid,
  city_name text,
  student_count integer,
  member_count bigint,
  public_headline text,
  public_about text,
  has_coach boolean,
  public_post_count bigint,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    g.id, g.service_category_id, sc.name, g.area_id, a.name, c.id, c.name,
    g.student_count,
    (select count(*) from public.group_members m where m.group_id = g.id),
    g.public_headline, g.public_about,
    exists (
      select 1 from public.group_requests r
      where r.group_id = g.id and r.status = 'accepted'
    ),
    (select count(*) from public.group_posts gp
      where gp.group_id = g.id and gp.visibility = 'public' and not gp.is_hidden),
    g.published_at
  from public.groups g
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  join public.cities c on c.id = a.city_id
  where g.published_at is not null
    and public.is_group_active(g.id)
    -- the same launch gate the seeker side uses everywhere
    and a.is_live = true
    and (p_city_id is null or c.id = p_city_id)
    and (p_area_id is null or a.id = p_area_id)
    and (p_service_category_id is null or g.service_category_id = p_service_category_id)
  order by g.published_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$fn$;

-- One published group, as a stranger sees it.
create or replace function public.group_public(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'id', g.id,
    'service_name', sc.name,
    'area_name', a.name,
    'city_name', c.name,
    'student_count', g.student_count,
    'member_count', (select count(*) from public.group_members m where m.group_id = g.id),
    'public_headline', g.public_headline,
    'public_about', g.public_about,
    'published_at', g.published_at,
    'has_coach', exists (
      select 1 from public.group_requests r
      where r.group_id = g.id and r.status = 'accepted'
    ),
    'already_member', public.is_group_member(g.id)
  )
  from public.groups g
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  join public.cities c on c.id = a.city_id
  where g.id = p_id
    and public.group_is_public(g.id);
$fn$;

-- The groups a coach trains, for their public page. Published ones only, and
-- only where the coach was actually accepted.
create or replace function public.groups_for_public_provider(p_provider_id uuid)
returns table (
  id uuid,
  service_name text,
  area_name text,
  city_name text,
  student_count integer,
  member_count bigint,
  public_headline text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    g.id, sc.name, a.name, c.name, g.student_count,
    (select count(*) from public.group_members m where m.group_id = g.id),
    g.public_headline
  from public.groups g
  join public.group_requests r
    on r.group_id = g.id and r.provider_id = p_provider_id and r.status = 'accepted'
  join public.service_category_master sc on sc.id = g.service_category_id
  join public.areas a on a.id = g.area_id
  join public.cities c on c.id = a.city_id
  join public.providers p on p.id = p_provider_id
  where g.published_at is not null
    and public.is_group_active(g.id)
    and p.approved = true
    and p.is_suspended = false
  order by g.published_at desc;
$fn$;

grant execute on function public.groups_discover to anon, authenticated, service_role;
grant execute on function public.group_public to anon, authenticated, service_role;
grant execute on function public.groups_for_public_provider to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. the posts a stranger may read
--
-- A separate function rather than letting the client filter, for the reason
-- the whole file keeps repeating: the rule lives in one place and the policy
-- and the read path cannot drift.
-- ---------------------------------------------------------------------

create or replace function public.group_public_posts(
  p_group_id uuid,
  p_limit integer default 24
)
returns table (
  id uuid,
  kind text,
  body text,
  image_url text,
  youtube_id text,
  show_order integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select gp.id, gp.kind, gp.body, gp.image_url, gp.youtube_id, gp.show_order, gp.created_at
  from public.group_posts gp
  where gp.group_id = p_group_id
    and gp.visibility = 'public'
    and not gp.is_hidden
    and public.group_is_public(p_group_id)
  order by gp.show_order nulls last, gp.created_at desc
  limit greatest(p_limit, 0);
$fn$;

grant execute on function public.group_public_posts to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. the rolling window
--
-- Publishing, and activity inside a published group, push expiry out. The
-- ninety is deliberately not GROUP_EXTEND_DAYS: that one answers "the creator
-- wants longer to find a coach", this one answers "this showcase is alive".
-- ---------------------------------------------------------------------

create or replace function public.touch_published_group(p_group_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $fn$
  update public.groups
     set expires_at = greatest(expires_at, now() + interval '90 days')
   where id = p_group_id
     and published_at is not null;
$fn$;

grant execute on function public.touch_published_group to anon, authenticated, service_role;

create or replace function public.group_posts_touch_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.touch_published_group(new.group_id);
  return new;
end;
$fn$;

drop trigger if exists group_posts_touch on public.group_posts;
create trigger group_posts_touch
  after insert on public.group_posts
  for each row execute function public.group_posts_touch_group();
