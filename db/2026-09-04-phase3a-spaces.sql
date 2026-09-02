-- Phase 3A — Spaces.
--
-- A provider's own page: what they do, what they know, how they teach. One
-- per provider, created with the listing, reached as a tab from their
-- profile. Seekers follow it. A post is a short piece of writing with either
-- a photo or a YouTube video.
--
-- Three things this deliberately is not, each overturning the original sketch
-- of the phase.
--
-- 1. THERE IS NO COMMENTS WALL.
--
--    The sketch had one. It contradicted the decision Groups is built on —
--    "no group wall, 1:1 to the creator only, keeps children out of
--    conversations with strangers". A public wall on a page about children's
--    classes is that same room with the same people in it, and every consent
--    rule since Phase 2A follows from refusing it.
--
--    Reactions instead: like, wow, surprise. No heart, deliberately — the
--    affection register does not belong on a page about other people's
--    children. Anything a parent actually wants to say still goes through the
--    1:1 enquiry thread, which is consent-gated and already carries trials
--    and notifications.
--
-- 2. A SPACE IS NEVER UNOWNED.
--
--    "Per provider" and "admin-creatable and claimable" contradicted each
--    other; the claimable reading meant a public page about a real business,
--    carrying public content, that the business could not moderate. Spaces
--    are created by trigger when the provider row is, so one exists from the
--    moment the listing does and there is no claiming flow to secure.
--
-- 3. VIDEO IS A YOUTUBE ID, NOT AN UPLOAD.
--
--    This removes the phase's only named cost risk outright. Supabase does no
--    transcoding, so a hosted 60-second phone video is 50-150 MB served at
--    full size on every view. A YouTube id is 11 characters and Google pays
--    for the transcoding, the bandwidth, the CDN and the abuse detection.
--    Images stay here, in a bucket with the limits phase1g already set for
--    photos.
--
-- Moderation ships here, not after: any viewer reports, three distinct
-- reports hide a post before an admin has read anything, and a Space in
-- breach is suspended and becomes unreachable.
--
-- Coaches only. Event planners are a different entity that shares the
-- providers table today and is excluded everywhere else; a teaching page is
-- not what they need, and Phase 4 is where they get theirs.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase1f.

-- ---------------------------------------------------------------------
-- 1. the Space
--
-- is_suspended is the consequence the composer warns about. Kept on the Space
-- rather than reusing providers.is_suspended: a coach whose listing is fine
-- may still have posted something that is not, and taking their Space down
-- should not take them out of search along with it.
-- ---------------------------------------------------------------------

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique references public.providers(id) on delete cascade,

  headline text,
  about text,

  is_suspended boolean not null default false,
  suspended_reason text,
  suspended_at timestamptz,

  created_at timestamptz not null default now(),

  constraint spaces_headline_len check (headline is null or length(headline) <= 140),
  constraint spaces_about_len check (about is null or length(about) <= 2000)
);

create index if not exists spaces_provider_idx on public.spaces (provider_id);

-- Created with the listing, so a coach never has to find and press a button
-- to have one, and nothing in the app has to handle "provider without Space".
create or replace function public.tg_create_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Coaches only. An event planner is a different entity that happens to
  -- share the providers table today; a Space is a teaching page and is not
  -- what they need. Theirs is Phase 4's problem.
  if new.provider_type = 'event_planner' then
    return null;
  end if;

  insert into public.spaces (provider_id) values (new.id)
  on conflict (provider_id) do nothing;
  return null;
exception
  when others then
    -- A Space failing to appear must never fail the provider signup that
    -- caused it. Same rule as the notification triggers in phase2n.
    return null;
end;
$fn$;

drop trigger if exists create_space on public.providers;
create trigger create_space
  after insert on public.providers
  for each row execute function public.tg_create_space();

-- Every coach who already has a listing.
insert into public.spaces (provider_id)
select p.id from public.providers p
where p.provider_type <> 'event_planner'
  and not exists (select 1 from public.spaces s where s.provider_id = p.id);

-- ---------------------------------------------------------------------
-- 2. posts
--
-- One piece of media per post, and exactly one kind of it. A post that is
-- both a photo and a video is two posts, and letting a row be both means
-- every reader has to decide which to show.
--
-- youtube_id, not a URL. A URL invites every form YouTube accepts — watch,
-- youtu.be, shorts, embed, with playlist and timestamp parameters — and
-- storing whichever one the coach pasted means the player, the thumbnail and
-- the duplicate check each have to re-parse it. The app extracts the id once,
-- on the way in.
-- ---------------------------------------------------------------------

create table if not exists public.space_posts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,

  kind text not null check (kind in ('photo', 'video')),
  body text,

  -- Storage URL, same rule as every other media column here (phase1g).
  image_url text,
  -- The 11-character id, nothing else.
  youtube_id text,

  -- Set by the auto-hide trigger or by an admin. A hidden post stays in the
  -- table: the report queue is about it, and deleting the evidence when the
  -- complaint arrives is the wrong instinct.
  is_hidden boolean not null default false,
  hidden_reason text,

  created_at timestamptz not null default now(),

  constraint space_posts_body_len check (body is null or length(body) <= 2000),
  constraint space_posts_image_is_link
    check (image_url is null or (image_url ~ '^https?://' and length(image_url) <= 1000)),
  constraint space_posts_youtube_id_shape
    check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint space_posts_media_matches_kind check (
    (kind = 'photo' and image_url is not null and youtube_id is null)
    or (kind = 'video' and youtube_id is not null and image_url is null)
  )
);

create index if not exists space_posts_space_idx
  on public.space_posts (space_id, created_at desc);
create index if not exists space_posts_visible_idx
  on public.space_posts (space_id, created_at desc) where not is_hidden;

-- ---------------------------------------------------------------------
-- 3. following
-- ---------------------------------------------------------------------

create table if not exists public.space_followers (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists space_followers_user_idx on public.space_followers (user_id);

-- ---------------------------------------------------------------------
-- 4. reactions
--
-- Three, and no heart. A page about other people's children is the wrong
-- place for the affection register, and "like / wow / surprise" says
-- everything a parent needs to say about a drill or a technique video.
--
-- One reaction per person per post: the primary key is the rule, so changing
-- your mind is an upsert rather than a second vote.
-- ---------------------------------------------------------------------

create table if not exists public.space_reactions (
  post_id uuid not null references public.space_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'wow', 'surprise')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists space_reactions_post_idx on public.space_reactions (post_id);

-- ---------------------------------------------------------------------
-- 5. reports, and hiding before anyone reads them
--
-- One admin cannot be the only thing standing between a bad post and a
-- parent. Three distinct people reporting a post hides it immediately; the
-- queue then decides whether that was right. A dismissal un-hides it.
-- ---------------------------------------------------------------------

create table if not exists public.space_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.space_posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,

  reason text not null check (reason in
    ('inappropriate', 'child_safety', 'misleading', 'spam', 'not_theirs', 'other')),
  note text,

  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),

  constraint space_reports_note_len check (note is null or length(note) <= 1000),
  -- One report per person per post. A second is not more evidence.
  unique (post_id, reporter_id)
);

create index if not exists space_reports_open_idx
  on public.space_reports (created_at desc) where status = 'open';

/** How many distinct people must report a post before it stops being shown. */
create or replace function public.space_autohide_threshold()
returns integer language sql immutable as $fn$ select 3 $fn$;

create or replace function public.tg_autohide_reported_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.space_posts p
     set is_hidden = true,
         hidden_reason = 'Hidden automatically after ' ||
                         public.space_autohide_threshold() || ' reports, pending review'
   where p.id = new.post_id
     and not p.is_hidden
     and (
       select count(*) from public.space_reports r
       where r.post_id = new.post_id and r.status = 'open'
     ) >= public.space_autohide_threshold();
  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists autohide_reported_post on public.space_reports;
create trigger autohide_reported_post
  after insert on public.space_reports
  for each row execute function public.tg_autohide_reported_post();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------

alter table public.spaces enable row level security;
alter table public.space_posts enable row level security;
alter table public.space_followers enable row level security;
alter table public.space_reactions enable row level security;
alter table public.space_reports enable row level security;

/** Is this Space mine to write to? */
create or replace function public.is_my_space(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.spaces s
    join public.providers p on p.id = s.provider_id
    where s.id = p_space_id and p.user_id = auth.uid()
  );
$fn$;

/**
 * Can anyone see this Space?
 *
 * The same three conditions get_provider_profile applies, restated here
 * because a Space can also be suspended on its own: a coach whose listing is
 * fine may have posted something that is not, and taking the Space down
 * should not take them out of search with it.
 *
 * Event planners are excluded, as they are everywhere else. They are a
 * different entity that currently shares the providers table, and a teaching
 * page is not the thing they need.
 */
create or replace function public.space_is_public(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.spaces s
    join public.providers p on p.id = s.provider_id
    where s.id = p_space_id
      and not s.is_suspended
      and p.approved = true
      and p.is_suspended = false
      and p.provider_type <> 'event_planner'
  );
$fn$;

grant execute on function public.is_my_space to anon, authenticated, service_role;
grant execute on function public.space_is_public to anon, authenticated, service_role;
grant execute on function public.space_autohide_threshold to anon, authenticated, service_role;

-- Spaces: public when live, always visible to their owner and to admins, so a
-- suspended coach can still see what happened to theirs.
drop policy if exists "read live spaces" on public.spaces;
create policy "read live spaces" on public.spaces for select
  using (
    public.space_is_public(id)
    or public.is_my_space(id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "owner edits own space" on public.spaces;
create policy "owner edits own space" on public.spaces for update
  using (public.is_my_space(id))
  with check (public.is_my_space(id));

-- No insert or delete policy: the trigger creates it and the provider cascade
-- removes it. A coach cannot have two, or none.

drop policy if exists "read visible posts" on public.space_posts;
create policy "read visible posts" on public.space_posts for select
  using (
    (not is_hidden and public.space_is_public(space_id))
    or public.is_my_space(space_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "owner posts to own space" on public.space_posts;
create policy "owner posts to own space" on public.space_posts for insert
  with check (public.is_my_space(space_id) and not is_hidden);

-- The owner may edit or delete their own post; is_hidden is not theirs to
-- clear, which is why the check re-tests it.
drop policy if exists "owner edits own posts" on public.space_posts;
create policy "owner edits own posts" on public.space_posts for update
  using (public.is_my_space(space_id) and not is_hidden)
  with check (public.is_my_space(space_id) and not is_hidden);

drop policy if exists "owner deletes own posts" on public.space_posts;
create policy "owner deletes own posts" on public.space_posts for delete
  using (public.is_my_space(space_id));

-- Following: yours to start and stop, and counted by a definer function so a
-- follower total does not require reading everyone else's rows.
drop policy if exists "read own follows" on public.space_followers;
create policy "read own follows" on public.space_followers for select
  using (user_id = auth.uid() or public.is_my_space(space_id));

drop policy if exists "follow a live space" on public.space_followers;
create policy "follow a live space" on public.space_followers for insert
  with check (user_id = auth.uid() and public.space_is_public(space_id));

drop policy if exists "unfollow own" on public.space_followers;
create policy "unfollow own" on public.space_followers for delete
  using (user_id = auth.uid());

drop policy if exists "read own reactions" on public.space_reactions;
create policy "read own reactions" on public.space_reactions for select
  using (user_id = auth.uid());

drop policy if exists "react to a visible post" on public.space_reactions;
create policy "react to a visible post" on public.space_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.space_posts p
      where p.id = post_id and not p.is_hidden and public.space_is_public(p.space_id)
    )
  );

drop policy if exists "change own reaction" on public.space_reactions;
create policy "change own reaction" on public.space_reactions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "remove own reaction" on public.space_reactions;
create policy "remove own reaction" on public.space_reactions for delete
  using (user_id = auth.uid());

-- Reports: yours to file and to see, an admin's to resolve. Deliberately not
-- readable by the Space owner — knowing who reported you is how reporting
-- stops happening.
drop policy if exists "read own reports" on public.space_reports;
create policy "read own reports" on public.space_reports for select
  using (
    reporter_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "signed in users report" on public.space_reports;
create policy "signed in users report" on public.space_reports for insert
  with check (
    reporter_id = auth.uid()
    and exists (select 1 from public.space_posts p where p.id = post_id)
  );

-- No update policy. Resolving goes through the definer function below, for
-- the reason phase2l gave: RLS cannot restrict which columns an update
-- touches, and status is not the reporter's to set.

grant select, insert, update, delete on
  public.spaces, public.space_posts, public.space_followers, public.space_reactions
to anon, authenticated, service_role;
grant select, insert on public.space_reports to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. reads
-- ---------------------------------------------------------------------

/**
 * The Space header, by provider id — which is what the URL carries, because a
 * parent arrives from the coach's profile and not from a Space they already
 * know the id of.
 */
create or replace function public.get_space(p_provider_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'id', s.id,
    'provider_id', p.id,
    'display_name', p.display_name,
    'photo_url', p.photo_url,
    'headline', s.headline,
    'about', s.about,
    'category_name', (
      select name from public.provider_category_master where id = p.provider_category_id
    ),
    'follower_count', (
      select count(*) from public.space_followers f where f.space_id = s.id
    ),
    'post_count', (
      select count(*) from public.space_posts sp
      where sp.space_id = s.id and not sp.is_hidden
    ),
    'i_follow', exists (
      select 1 from public.space_followers f
      where f.space_id = s.id and f.user_id = auth.uid()
    ),
    'is_mine', public.is_my_space(s.id),
    'is_suspended', s.is_suspended,
    'suspended_reason', case when public.is_my_space(s.id) then s.suspended_reason else null end
  )
  from public.spaces s
  join public.providers p on p.id = s.provider_id
  where p.id = p_provider_id
    and (public.space_is_public(s.id) or public.is_my_space(s.id));
$fn$;

/**
 * A Space's posts, with the reaction counts and this viewer's own reaction.
 *
 * Counted here rather than client-side because space_reactions is readable
 * only for your own rows — counting in the browser would report one.
 */
create or replace function public.space_feed(
  p_space_id uuid,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  id uuid,
  kind text,
  body text,
  image_url text,
  youtube_id text,
  created_at timestamptz,
  is_hidden boolean,
  hidden_reason text,
  likes bigint,
  wows bigint,
  surprises bigint,
  my_reaction text,
  i_reported boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    sp.id, sp.kind, sp.body, sp.image_url, sp.youtube_id, sp.created_at,
    sp.is_hidden,
    -- Why it is hidden is the owner's business and nobody else's.
    case when public.is_my_space(sp.space_id) then sp.hidden_reason else null end,
    (select count(*) from public.space_reactions r
      where r.post_id = sp.id and r.reaction = 'like'),
    (select count(*) from public.space_reactions r
      where r.post_id = sp.id and r.reaction = 'wow'),
    (select count(*) from public.space_reactions r
      where r.post_id = sp.id and r.reaction = 'surprise'),
    (select r.reaction from public.space_reactions r
      where r.post_id = sp.id and r.user_id = auth.uid()),
    exists (select 1 from public.space_reports rp
             where rp.post_id = sp.id and rp.reporter_id = auth.uid())
  from public.space_posts sp
  where sp.space_id = p_space_id
    and (
      -- A hidden post stays visible to its owner, so they know it happened.
      (not sp.is_hidden and public.space_is_public(sp.space_id))
      or public.is_my_space(sp.space_id)
    )
    and (p_before is null or sp.created_at < p_before)
  order by sp.created_at desc
  limit least(coalesce(p_limit, 30), 60);
$fn$;

/** The Spaces this person follows, for their own dashboard. */
create or replace function public.my_followed_spaces()
returns table (
  provider_id uuid,
  display_name text,
  photo_url text,
  headline text,
  post_count bigint,
  followed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    p.id, p.display_name, p.photo_url, s.headline,
    (select count(*) from public.space_posts sp
      where sp.space_id = s.id and not sp.is_hidden),
    f.created_at
  from public.space_followers f
  join public.spaces s on s.id = f.space_id
  join public.providers p on p.id = s.provider_id
  where f.user_id = auth.uid()
    and public.space_is_public(s.id)
  order by f.created_at desc;
$fn$;

grant execute on function public.get_space to anon, authenticated, service_role;
grant execute on function public.space_feed to anon, authenticated, service_role;
grant execute on function public.my_followed_spaces to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. writes that RLS cannot express
-- ---------------------------------------------------------------------

/** Set, change or clear this viewer's reaction. One call, all three cases. */
create or replace function public.set_reaction(p_post_id uuid, p_reaction text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.space_posts sp
    where sp.id = p_post_id and not sp.is_hidden and public.space_is_public(sp.space_id)
  ) then
    raise exception 'That post is not available.';
  end if;

  if p_reaction is null then
    delete from public.space_reactions r
     where r.post_id = p_post_id and r.user_id = auth.uid();
    return;
  end if;

  if p_reaction not in ('like', 'wow', 'surprise') then
    raise exception 'Unknown reaction: %', p_reaction;
  end if;

  insert into public.space_reactions (post_id, user_id, reaction)
  values (p_post_id, auth.uid(), p_reaction)
  on conflict (post_id, user_id) do update set reaction = excluded.reaction;
end;
$fn$;

/**
 * An admin resolves a report.
 *
 * 'actioned' hides the post and closes every open report against it — three
 * people reporting one post is one decision, not three. 'dismissed' un-hides
 * it, which is what makes the auto-hide safe to be as eager as it is.
 */
create or replace function public.resolve_report(p_report_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_post uuid;
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Not yours to resolve.';
  end if;

  if p_action not in ('actioned', 'dismissed') then
    raise exception 'Unknown action: %', p_action;
  end if;

  select r.post_id into v_post from public.space_reports r where r.id = p_report_id;
  if v_post is null then
    raise exception 'No such report.';
  end if;

  update public.space_reports r
     set status = p_action, resolved_at = now(), resolved_by = auth.uid()
   where r.post_id = v_post and r.status = 'open';

  update public.space_posts sp
     set is_hidden = (p_action = 'actioned'),
         hidden_reason = case when p_action = 'actioned' then 'Removed after review' else null end
   where sp.id = v_post;
end;
$fn$;

/** Suspend or restore a whole Space. The consequence the composer warns about. */
create or replace function public.set_space_suspended(
  p_space_id uuid,
  p_suspended boolean,
  p_reason text default null
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
    raise exception 'Not yours to suspend.';
  end if;

  update public.spaces s
     set is_suspended = p_suspended,
         suspended_reason = case when p_suspended then p_reason else null end,
         suspended_at = case when p_suspended then now() else null end
   where s.id = p_space_id;
end;
$fn$;

/** The admin queue: one row per reported post, not per report. */
create or replace function public.moderation_queue()
returns table (
  post_id uuid,
  space_id uuid,
  provider_id uuid,
  display_name text,
  kind text,
  body text,
  image_url text,
  youtube_id text,
  is_hidden boolean,
  posted_at timestamptz,
  report_count bigint,
  reasons text[],
  latest_report_at timestamptz,
  latest_report_id uuid
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    sp.id, sp.space_id, p.id, p.display_name,
    sp.kind, sp.body, sp.image_url, sp.youtube_id, sp.is_hidden, sp.created_at,
    count(r.id),
    array_agg(distinct r.reason),
    max(r.created_at),
    (array_agg(r.id order by r.created_at desc))[1]
  from public.space_reports r
  join public.space_posts sp on sp.id = r.post_id
  join public.spaces s on s.id = sp.space_id
  join public.providers p on p.id = s.provider_id
  where r.status = 'open'
    and exists (
      select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin'
    )
  group by sp.id, sp.space_id, p.id, p.display_name, sp.kind, sp.body,
           sp.image_url, sp.youtube_id, sp.is_hidden, sp.created_at
  order by count(r.id) desc, max(r.created_at) desc;
$fn$;

grant execute on function public.set_reaction to anon, authenticated, service_role;
grant execute on function public.resolve_report to anon, authenticated, service_role;
grant execute on function public.set_space_suspended to anon, authenticated, service_role;
grant execute on function public.moderation_queue to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9. the image bucket
--
-- Same ceiling and the same allowlist as the photo buckets phase1g set. No
-- video bucket, and there will not be one: video is a YouTube id.
--
-- Create the bucket in the Storage UI (or with storage.create_bucket) named
-- 'space-media' and public; this only pins its limits, and does nothing if it
-- does not exist yet.
-- ---------------------------------------------------------------------

update storage.buckets
   set file_size_limit = 5242880,  -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'space-media';
