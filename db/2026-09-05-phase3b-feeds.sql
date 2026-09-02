-- Phase 3B — the feeds that make following worth doing.
--
-- 3A shipped Spaces, posts, reactions and moderation, then surfaced them in
-- exactly one place each: a Space's own page, and a list of names on the
-- seeker dashboard. my_followed_spaces() returns display names and post
-- counts, so a parent who follows four coaches gets four names and has to
-- click into each to read anything. The follow button led nowhere.
--
-- Two reads fix that, and they are deliberately different products:
--
--   public_city_feed()  a shop window. A signed-out visitor picks a city and
--                       sees what coaches there have been posting. Read-only:
--                       reacting, following and reporting all need an account.
--
--   my_space_feed()     a feed. For a signed-in parent, posts from the coaches
--                       they follow, plus posts from coaches in their city who
--                       teach what they said they are looking for.
--
-- CITY, NOT AREA. Search is area-and-radius because "who can actually teach my
-- child" is a distance question. Reading what a coach posted is not — a parent
-- in one area of Indore is not harmed by seeing a good drill from three areas
-- over, and at this stage of launch an area-sized feed would frequently be
-- empty. is_live still gates it, so a city with no live area has no feed.
--
-- WHY THE PUBLIC FEED LAGS. Auto-hide needs three distinct signed-in reporters
-- (phase3a), and a signed-out visitor cannot report at all. Putting a post in
-- front of guests the second it is written would make the largest audience the
-- one that cannot trigger the safety mechanism. So the public feed shows posts
-- only after they have been readable in-app for a while: followers and the
-- coach's own visitors see them first, and the reporting path gets its chance
-- before the homepage does. Followed-coach posts in my_space_feed() are exempt
-- — a follower chose that coach, and this is their audience.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3a.

-- ---------------------------------------------------------------------
-- 1. the two tunables, in one place each
-- ---------------------------------------------------------------------

/**
 * How long a post is visible in-app before it reaches the signed-out
 * homepage. See "WHY THE PUBLIC FEED LAGS" above. Lower it once reporting has
 * a track record; there is nothing else to change.
 */
create or replace function public.space_public_delay()
returns interval language sql immutable as $fn$ select interval '6 hours' $fn$;

/**
 * How many posts one coach may contribute to a single page of a mixed feed.
 *
 * Without this, a coach who posts eight times on Tuesday owns the city's
 * homepage on Tuesday. Every other ranking question here is deliberately left
 * to chronology — this is the one place a feed of a dozen coaches genuinely
 * breaks without a rule.
 */
create or replace function public.space_feed_per_coach()
returns integer language sql immutable as $fn$ select 3 $fn$;

/**
 * How far back a single page of a feed looks.
 *
 * Both feeds below order by time across a whole city, which 3A's indexes
 * cannot serve: space_posts_space_idx and space_posts_visible_idx both lead
 * with space_id, and neither feed filters on one. Without a floor the query
 * is a scan of the city's entire post history to return 24 rows — on the
 * anonymous homepage, which is the most-hit route there is.
 *
 * Measured from the page cursor rather than from now(), so paging further
 * back keeps working instead of walking off the end of a fixed window.
 */
create or replace function public.space_feed_window()
returns interval language sql immutable as $fn$ select interval '90 days' $fn$;

grant execute on function public.space_public_delay to anon, authenticated, service_role;
grant execute on function public.space_feed_per_coach to anon, authenticated, service_role;
grant execute on function public.space_feed_window to anon, authenticated, service_role;

-- The index the two feeds actually need: time-ordered across every Space,
-- with the hidden ones already excluded. 3A's indexes serve a Space's own
-- page, where space_id is known; neither of these reads knows one.
create index if not exists space_posts_recent_idx
  on public.space_posts (created_at desc) where not is_hidden;

-- ---------------------------------------------------------------------
-- 2. cities that have something to show
--
-- The picker on the guest homepage, and the source of its default. A city
-- appears only if it has a live area with an approved coach in it, so the
-- picker can never offer a choice that leads to an empty page.
-- ---------------------------------------------------------------------

create or replace function public.live_cities()
returns table (
  id uuid,
  name text,
  state text,
  coach_count bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id, c.name, c.state, count(distinct p.id)
  from public.cities c
  join public.areas a on a.city_id = c.id and a.is_live
  join public.provider_discoverable_areas pda on pda.area_id = a.id
  join public.providers p on p.id = pda.provider_id
  where c.is_active
    and p.approved
    and not p.is_suspended
    and p.provider_type <> 'event_planner'
  group by c.id, c.name, c.state
  -- Most coaches first: the head of this list is the sensible default for a
  -- visitor who has not chosen, and the busiest city is the best first
  -- impression the product can make.
  order by count(distinct p.id) desc, c.name;
$fn$;

grant execute on function public.live_cities to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. the public city feed
--
-- exists(), not a join, on discoverable areas: a coach serving six areas of
-- one city would otherwise appear six times per post.
-- ---------------------------------------------------------------------

create or replace function public.public_city_feed(
  p_city_id uuid,
  p_limit integer default 24,
  p_before timestamptz default null
)
returns table (
  id uuid,
  provider_id uuid,
  display_name text,
  photo_url text,
  category_name text,
  kind text,
  body text,
  image_url text,
  youtube_id text,
  created_at timestamptz,
  likes bigint,
  wows bigint,
  surprises bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  -- Bounded before the window function, not after. row_number() has to see
  -- every row it partitions, so a limit outside it cannot push down — without
  -- this inner cut, returning 24 posts means sorting the city's whole history.
  with candidates as (
    select
      sp.id, sp.space_id, p.id as provider_id, p.display_name, p.photo_url,
      p.provider_category_id,
      sp.kind, sp.body, sp.image_url, sp.youtube_id, sp.created_at
    from public.space_posts sp
    join public.spaces s on s.id = sp.space_id
    join public.providers p on p.id = s.provider_id
    where not sp.is_hidden
      and not s.is_suspended
      and p.approved
      and not p.is_suspended
      and p.provider_type <> 'event_planner'
      -- The lag. Nothing else in the product uses it.
      and sp.created_at < now() - public.space_public_delay()
      and (p_before is null or sp.created_at < p_before)
      and sp.created_at > coalesce(p_before, now()) - public.space_feed_window()
      and exists (
        select 1
        from public.provider_discoverable_areas pda
        join public.areas a on a.id = pda.area_id
        where pda.provider_id = p.id
          and a.city_id = p_city_id
          and a.is_live
      )
    order by sp.created_at desc
    limit 300
  ),
  visible as (
    select
      c.*,
      row_number() over (partition by c.space_id order by c.created_at desc) as rn
    from candidates c
  )
  select
    v.id, v.provider_id, v.display_name, v.photo_url,
    -- Resolved out here, so it runs on the page rather than on every candidate.
    (select name from public.provider_category_master where id = v.provider_category_id),
    v.kind, v.body, v.image_url, v.youtube_id, v.created_at,
    (select count(*) from public.space_reactions r where r.post_id = v.id and r.reaction = 'like'),
    (select count(*) from public.space_reactions r where r.post_id = v.id and r.reaction = 'wow'),
    (select count(*) from public.space_reactions r where r.post_id = v.id and r.reaction = 'surprise')
  from visible v
  where v.rn <= public.space_feed_per_coach()
  order by v.created_at desc
  limit least(coalesce(p_limit, 24), 60);
$fn$;

grant execute on function public.public_city_feed to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. the seeker's feed
--
-- Two sources, one chronology, and a reason column so the page can say which
-- is which. A parent should always be able to tell why something is in front
-- of them — "you follow Krishna" and "you said you're looking for boxing" are
-- different claims and only one of them is a recommendation.
--
-- Interest matching is the same array overlap the coach side already uses:
-- seekers.looking_for against providers.service_category_ids, both gin-indexed
-- as of phase2r. City comes from the parent's own area, so a parent who has
-- not finished their profile gets their followed coaches and nothing else,
-- rather than an error.
-- ---------------------------------------------------------------------

create or replace function public.my_space_feed(
  p_limit integer default 24,
  p_before timestamptz default null
)
returns table (
  id uuid,
  provider_id uuid,
  display_name text,
  photo_url text,
  category_name text,
  kind text,
  body text,
  image_url text,
  youtube_id text,
  created_at timestamptz,
  likes bigint,
  wows bigint,
  surprises bigint,
  my_reaction text,
  i_reported boolean,
  -- 'following' or 'interest' — never both; following wins.
  reason text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with me as (
    select s.user_id, s.looking_for, a.city_id
    from public.seekers s
    left join public.areas a on a.id = s.area_id
    where s.user_id = auth.uid()
  ),
  -- Same inner bound as the public feed, and for the same reason.
  candidates as (
    select
      sp.id, sp.space_id, p.id as provider_id, p.display_name, p.photo_url,
      p.provider_category_id,
      sp.kind, sp.body, sp.image_url, sp.youtube_id, sp.created_at,
      f.user_id is not null as followed
    from public.space_posts sp
    join public.spaces s on s.id = sp.space_id
    join public.providers p on p.id = s.provider_id
    cross join me
    left join public.space_followers f
      on f.space_id = s.id and f.user_id = me.user_id
    where not sp.is_hidden
      and not s.is_suspended
      and p.approved
      and not p.is_suspended
      and p.provider_type <> 'event_planner'
      and (p_before is null or sp.created_at < p_before)
      and sp.created_at > coalesce(p_before, now()) - public.space_feed_window()
      and (
        -- Followed: no lag. They chose this coach; this is that coach's
        -- audience, which is the surface the lag was never protecting.
        f.user_id is not null
        or (
          -- Suggested: same city, teaches something they said they want, and
          -- subject to the same lag the public feed uses, because this is
          -- discovery and not a subscription.
          me.city_id is not null
          and cardinality(me.looking_for) > 0
          and p.service_category_ids && me.looking_for
          and sp.created_at < now() - public.space_public_delay()
          and exists (
            select 1
            from public.provider_discoverable_areas pda
            join public.areas a on a.id = pda.area_id
            where pda.provider_id = p.id
              and a.city_id = me.city_id
              and a.is_live
          )
        )
      )
    order by sp.created_at desc
    limit 300
  ),
  visible as (
    select
      c.*,
      row_number() over (partition by c.space_id order by c.created_at desc) as rn
    from candidates c
  )
  select
    v.id, v.provider_id, v.display_name, v.photo_url,
    (select name from public.provider_category_master where id = v.provider_category_id),
    v.kind, v.body, v.image_url, v.youtube_id, v.created_at,
    (select count(*) from public.space_reactions r where r.post_id = v.id and r.reaction = 'like'),
    (select count(*) from public.space_reactions r where r.post_id = v.id and r.reaction = 'wow'),
    (select count(*) from public.space_reactions r where r.post_id = v.id and r.reaction = 'surprise'),
    (select r.reaction from public.space_reactions r
      where r.post_id = v.id and r.user_id = auth.uid()),
    exists (select 1 from public.space_reports rp
             where rp.post_id = v.id and rp.reporter_id = auth.uid()),
    case when v.followed then 'following' else 'interest' end
  from visible v
  -- The per-coach cap applies to the suggested half only. Capping a coach a
  -- parent deliberately followed would be the product overruling them.
  where v.followed or v.rn <= public.space_feed_per_coach()
  order by v.created_at desc
  limit least(coalesce(p_limit, 24), 60);
$fn$;

grant execute on function public.my_space_feed to anon, authenticated, service_role;
