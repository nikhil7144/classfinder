-- Phase 2L — a parent can finally contact a coach directly.
--
-- Search has worked since Phase 1, and every provider page ended with
-- "Messaging and booking arrive in a later release." So the one path the
-- product is built around — parent searches, finds the right coach — was a
-- dead end, while Groups quietly built the whole request → thread machinery
-- next door.
--
-- This points that machinery the other way.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. the enquiry
--
-- A separate table rather than a nullable group_id on group_requests. The two
-- objects look alike and are governed in opposite directions: there a
-- stranger approaches a family and the family must consent before a word is
-- exchanged; here the family approaches an already-approved coach and consent
-- is the act of writing. Folding them together means rewriting group RLS that
-- is correct today to serve an initiator it was never shaped for.
--
-- Three differences fall out of that inversion:
--
--   * No accept gate. The parent chose this coach, so a reply needs no
--     permission. A coach who does not want the work declines, or simply
--     never answers — the same as email. status is open/declined, not
--     pending/accepted/declined.
--   * The minimum message is short. A group pitch must be substantive because
--     it is a cold approach to a family; "do you teach 8-year-olds on
--     Saturdays?" is a perfectly good enquiry and the product should not
--     demand a paragraph of a parent.
--   * The phone opt-in sits on the enquiry, not the person. A parent may want
--     one coach to call them and not another.
-- ---------------------------------------------------------------------

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,

  -- What they are asking about. Optional: a parent may just want to talk, and
  -- forcing a taxonomy pick before the first message is friction at exactly
  -- the wrong moment.
  service_category_id uuid references public.service_category_master(id),

  message text not null,
  status text not null default 'open' check (status in ('open', 'declined')),

  -- Opt in, never a default: this is a parent's personal number. Per-enquiry,
  -- deliberately — see above.
  show_phone boolean not null default false,

  created_at timestamptz not null default now(),
  responded_at timestamptz,

  -- Same two-column read model as group_requests: a thread has exactly two
  -- sides and always will.
  seeker_read_at timestamptz,
  provider_read_at timestamptz,

  constraint enquiries_message_len check (length(message) between 10 and 1000)
);

create index if not exists enquiries_seeker_idx on public.enquiries (seeker_id);
create index if not exists enquiries_provider_idx on public.enquiries (provider_id);

-- One live enquiry per parent per coach, so nobody re-sends the same question
-- five times while waiting. A decline is not a permanent bar, though: the
-- group rule ("a declined coach cannot try again") exists to stop a stranger
-- pestering a family, and that reasoning does not run in this direction. A
-- parent whose child takes up badminton a year later may ask again.
create unique index if not exists enquiries_one_live
  on public.enquiries (seeker_id, provider_id)
  where status <> 'declined';

create table if not exists public.enquiry_messages (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint enquiry_messages_body_len check (length(body) between 1 and 4000)
);

create index if not exists enquiry_messages_enquiry_idx
  on public.enquiry_messages (enquiry_id, created_at);

-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------

alter table public.enquiries enable row level security;
alter table public.enquiry_messages enable row level security;

drop policy if exists "participants read enquiries" on public.enquiries;
create policy "participants read enquiries" on public.enquiries for select
  using (seeker_id = auth.uid() or public.is_my_provider(provider_id));

-- A completed seeker profile, mirroring the rule for joining a group: an auth
-- account is a verified email address and nothing more, and this message
-- arrives in a working coach's inbox. The coach must be someone the product
-- actually vouches for — approved, unsuspended, and not an event planner, who
-- is not "found" like a coach at all.
drop policy if exists "seeker sends enquiry" on public.enquiries;
create policy "seeker sends enquiry" on public.enquiries for insert
  with check (
    seeker_id = auth.uid()
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

-- No UPDATE policy, deliberately. Postgres RLS cannot restrict which columns
-- an update touches, so granting either side UPDATE here would also hand them
-- status, show_phone and both read timestamps. Every state change goes
-- through a definer function below — the same conclusion phase2k reached for
-- mark_thread_read.

-- Messages: both participants, from the first moment. There is no accepted
-- gate to wait for.
drop policy if exists "participants read enquiry messages" on public.enquiry_messages;
create policy "participants read enquiry messages" on public.enquiry_messages for select
  using (exists (
    select 1 from public.enquiries e
    where e.id = enquiry_id
      and (e.seeker_id = auth.uid() or public.is_my_provider(e.provider_id))
  ));

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
-- 3. state changes
-- ---------------------------------------------------------------------

-- The coach bows out. Only the coach: a parent who has lost interest just
-- stops replying, and closing their own enquiry would gain them nothing.
create or replace function public.decline_enquiry(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.enquiries e
     set status = 'declined',
         responded_at = now()
   where e.id = p_enquiry_id
     and e.status = 'open'
     and public.is_my_provider(e.provider_id);
end;
$fn$;

-- The parent changes their mind about being phoned, in either direction.
create or replace function public.set_enquiry_phone_sharing(p_enquiry_id uuid, p_share boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.enquiries e
     set show_phone = p_share
   where e.id = p_enquiry_id
     and e.seeker_id = auth.uid();
end;
$fn$;

create or replace function public.mark_enquiry_read(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.enquiries e
     set seeker_read_at = now()
   where e.id = p_enquiry_id and e.seeker_id = auth.uid();

  update public.enquiries e
     set provider_read_at = now()
   where e.id = p_enquiry_id and public.is_my_provider(e.provider_id);
end;
$fn$;

-- ---------------------------------------------------------------------
-- 4. the parent's number, to a coach they chose to give it to
--
-- The group equivalent waits for an accept, because there the parent had not
-- chosen that coach. Here they did, and ticking the box while writing to this
-- specific coach is the consent. The name goes with it: the parent knowingly
-- wrote to this person, and a message from nobody is not a conversation.
-- ---------------------------------------------------------------------

create or replace function public.get_enquiry_contact(p_enquiry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'phone', case when e.show_phone then pr.phone else null end,
    'name', s.name,
    'shared', e.show_phone
  )
  from public.enquiries e
  join public.profiles pr on pr.id = e.seeker_id
  left join public.seekers s on s.user_id = e.seeker_id
  where e.id = p_enquiry_id
    and public.is_my_provider(e.provider_id);
$fn$;

-- ---------------------------------------------------------------------
-- 5. one inbox
--
-- A parent talking to two coaches about a group and a third directly has one
-- inbox in their head, not two. This is the read behind that — and the read
-- the mobile app makes instead of assembling threads client-side.
--
-- Definer, so the where clauses are the security boundary; they restate the
-- RLS on both tables exactly.
--
-- What each side is told differs, and follows the rules already set:
--   * a coach is never given the society name, nor the parent's name, for a
--     group thread they have not been accepted into — phase2k closed that
--     same leak in get_group_invite
--   * a parent always sees the coach, who is a public, approved listing
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
  -- Wrapped in a subquery because the ordering below cannot see either
  -- branch's table aliases, and both branches carry two different
  -- created_at columns. A union takes its column names from the first
  -- branch, so that branch names every one of them.
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
      -- the coach gets the area, and the society only once accepted
      else a.name || case when r.status = 'accepted' then ' · ' || g.society_name else '' end
    end as subtitle,
    case when g.creator_id = auth.uid() then p.photo_url else null end as photo_url,
    r.message as opening,
    r.status as status,
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

  -- direct enquiries
  select
    'enquiry'::text,
    e.id,
    null::uuid,
    e.provider_id,
    case when e.seeker_id = auth.uid()
      then p.display_name
      else coalesce(s.name, 'A parent')
    end,
    coalesce(sc.name, 'General enquiry'),
    case when e.seeker_id = auth.uid() then p.photo_url else s.photo_url end,
    e.message,
    e.status,
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
      and coalesce(m.sender_id, e.seeker_id) <> auth.uid(),
    e.seeker_id = auth.uid()
  from public.enquiries e
  join public.providers p on p.id = e.provider_id
  left join public.service_category_master sc on sc.id = e.service_category_id
  left join public.seekers s on s.user_id = e.seeker_id
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

-- ---------------------------------------------------------------------
-- 6. alerts learn about enquiries
--
-- Same one cheap call every surface already uses; two counts added rather
-- than a second round trip.
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
        and (select count(*) from public.group_members m where m.group_id = g.id) < 3
    ),
    'accepted_pitches', (
      select count(*)
      from public.group_requests r
      join public.providers p on p.id = r.provider_id
      where p.user_id = auth.uid() and r.status = 'accepted'
    ),
    -- anything in the unified inbox with something new in it, either side.
    -- Drives the Messages badge specifically.
    'unread_threads', (
      select count(*) from public.my_threads() t where t.unread
    ),
    -- enquiries a coach has never answered: the number that decides whether
    -- direct contact works at all
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
    -- One honest total for the navbar. Counted over threads rather than added
    -- up from the counts above, which overlap: a pitch that is both unread and
    -- undecided is one thing waiting, not two.
    'needs_you', (
      select count(*)
      from public.my_threads() t
      where t.unread
         -- a decision still owed, even once it has been read
         or (t.kind = 'group' and t.status = 'pending' and t.i_am_seeker)
         -- a parent's question a coach has never answered
         or (t.kind = 'enquiry' and t.status = 'open' and not t.i_am_seeker
             and t.message_count = 0)
    )
  );
$fn$;

-- Raw-SQL-created tables don't inherit Supabase's default grants.
grant select, insert, update, delete on
  public.enquiries, public.enquiry_messages
to anon, authenticated, service_role;

grant execute on function public.decline_enquiry to anon, authenticated, service_role;
grant execute on function public.set_enquiry_phone_sharing to anon, authenticated, service_role;
grant execute on function public.mark_enquiry_read to anon, authenticated, service_role;
grant execute on function public.get_enquiry_contact to anon, authenticated, service_role;
grant execute on function public.my_threads to anon, authenticated, service_role;
grant execute on function public.my_alerts to anon, authenticated, service_role;
