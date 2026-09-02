-- Phase 2N — telling people something happened, outside the app.
--
-- Everything built in 2L and 2M assumes the other person comes back to the
-- site. Nothing tells them to. A parent writes a careful message to exactly
-- the right coach and it lands in a dashboard that coach may not open for a
-- week; a proposed first class waits for a confirmation nobody knows is
-- pending. Until now the only mail this product has ever sent is Supabase's
-- own sign-in code.
--
-- Two rules shape this.
--
-- 1. It fires in the DATABASE, not in the web client. The mobile app writes
--    to Supabase directly, so an enquiry sent from a phone would send no mail
--    at all if the web app were the thing that noticed. Same trap the plan
--    warns about for reading: a rule implemented in one client is a rule the
--    other client doesn't have.
--
-- 2. A notification can NEVER break the thing that caused it. Every trigger
--    below swallows its own errors. A trial confirmation failing because a
--    notification row wouldn't insert would be a far worse bug than a missing
--    email, and respond_to_trial raises on `not found`, so a trigger error
--    inside that UPDATE would surface to the coach as "that trial is not
--    yours to answer".
--
-- Delivery is a separate worker (app/api/notifications/dispatch) that drains
-- this table. Queue first, send second: it survives a provider outage, it can
-- be retried, and push for the mobile app slots in beside email later without
-- touching a single trigger.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2l and phase2m.

-- ---------------------------------------------------------------------
-- 1. the queue
-- ---------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,

  kind text not null check (kind in (
    'enquiry_received',
    'pitch_received',
    'message_received',
    'trial_proposed',
    'trial_answered'
  )),

  -- What it is about, so the mail can deep-link into the right conversation
  -- rather than dropping someone on an inbox to hunt for it.
  thread_kind text check (thread_kind in ('group', 'enquiry')),
  thread_id uuid,

  title text not null,
  body text,
  url text not null,

  created_at timestamptz not null default now(),
  -- read in the app
  read_at timestamptz,
  -- delivered by the worker
  emailed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

-- The worker's queue scan: unsent, oldest first, not yet given up on.
create index if not exists notifications_pending_idx
  on public.notifications (created_at)
  where emailed_at is null and attempts < 5;

alter table public.notifications enable row level security;

-- Yours to read and nobody's to write. Every row is written by a trigger
-- under definer rights; the worker reads through a definer function with the
-- service role.
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select
  using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. queueing one
--
-- Never raises. The caller is always a trigger on a write that matters more
-- than this does.
--
-- p_debounce collapses a burst: while an unread notification of the same kind
-- about the same thread is still fresh, a second one is dropped rather than
-- queued. Without it a five-message exchange is five emails, which is how
-- people learn to filter your mail.
-- ---------------------------------------------------------------------

create or replace function public.queue_notification(
  p_recipient uuid,
  p_kind text,
  p_thread_kind text,
  p_thread_id uuid,
  p_title text,
  p_body text,
  p_url text,
  p_debounce interval default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_recipient is null then
    return;
  end if;

  if p_debounce is not null and exists (
    select 1 from public.notifications n
    where n.recipient_id = p_recipient
      and n.kind = p_kind
      and n.thread_id is not distinct from p_thread_id
      and n.read_at is null
      and n.created_at > now() - p_debounce
  ) then
    return;
  end if;

  insert into public.notifications (
    recipient_id, kind, thread_kind, thread_id, title, body, url
  )
  values (
    p_recipient, p_kind, p_thread_kind, p_thread_id, p_title,
    -- A preview, not the whole conversation. Enough to decide whether to open
    -- it; short enough that a mail client shows it whole.
    left(p_body, 140), p_url
  );
exception
  when others then
    -- Deliberately swallowed. See the header: a failed notification must
    -- never roll back the message, pitch or trial that triggered it.
    return;
end;
$fn$;

-- Where a notification points, which depends only on which side is reading.
create or replace function public.thread_url(p_is_seeker boolean, p_kind text, p_thread_id uuid)
returns text
language sql
immutable
as $fn$
  select case when p_is_seeker then '/account/messages' else '/dashboard/messages' end
    || '?thread=' || p_thread_id::text;
$fn$;

-- ---------------------------------------------------------------------
-- 3. the triggers
--
-- Each one resolves both sides of the thread, picks the person who did NOT
-- cause the event, and queues. Each is wrapped in its own exception block on
-- top of queue_notification's, because resolving the parties is a query too
-- and a query can fail.
-- ---------------------------------------------------------------------

-- A parent writes to a coach.
create or replace function public.tg_notify_enquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_provider_user uuid;
  v_name text;
begin
  select p.user_id, coalesce(s.name, 'A parent')
    into v_provider_user, v_name
    from public.providers p
    left join public.seekers s on s.user_id = new.seeker_id
   where p.id = new.provider_id;

  perform public.queue_notification(
    v_provider_user,
    'enquiry_received',
    'enquiry',
    new.id,
    v_name || ' has messaged you',
    new.message,
    public.thread_url(false, 'enquiry', new.id)
  );
  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists notify_enquiry on public.enquiries;
create trigger notify_enquiry
  after insert on public.enquiries
  for each row execute function public.tg_notify_enquiry();

-- A coach pitches a group.
create or replace function public.tg_notify_pitch()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_creator uuid;
  v_name text;
begin
  select g.creator_id, coalesce(p.display_name, 'A coach')
    into v_creator, v_name
    from public.groups g
    join public.providers p on p.id = new.provider_id
   where g.id = new.group_id;

  perform public.queue_notification(
    v_creator,
    'pitch_received',
    'group',
    new.id,
    v_name || ' wants to teach your group',
    new.message,
    public.thread_url(true, 'group', new.id)
  );
  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists notify_pitch on public.group_requests;
create trigger notify_pitch
  after insert on public.group_requests
  for each row execute function public.tg_notify_pitch();

-- A reply, either kind, either direction. Debounced: one mail per half hour
-- per conversation until they have actually read it.
create or replace function public.tg_notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_seeker uuid;
  v_provider uuid;
  v_recipient uuid;
  v_is_seeker boolean;
  v_kind text;
  v_thread uuid;
  v_title text;
begin
  if tg_table_name = 'enquiry_messages' then
    v_kind := 'enquiry';
    v_thread := new.enquiry_id;
    select e.seeker_id, p.user_id
      into v_seeker, v_provider
      from public.enquiries e
      join public.providers p on p.id = e.provider_id
     where e.id = new.enquiry_id;
  else
    v_kind := 'group';
    v_thread := new.request_id;
    select g.creator_id, p.user_id
      into v_seeker, v_provider
      from public.group_requests r
      join public.groups g on g.id = r.group_id
      join public.providers p on p.id = r.provider_id
     where r.id = new.request_id;
  end if;

  if new.sender_id = v_seeker then
    v_recipient := v_provider;
    v_is_seeker := false;
    v_title := 'New message from a parent';
  else
    v_recipient := v_seeker;
    v_is_seeker := true;
    v_title := 'New message from a coach';
  end if;

  perform public.queue_notification(
    v_recipient,
    'message_received',
    v_kind,
    v_thread,
    v_title,
    new.body,
    public.thread_url(v_is_seeker, v_kind, v_thread),
    interval '30 minutes'
  );
  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists notify_enquiry_message on public.enquiry_messages;
create trigger notify_enquiry_message
  after insert on public.enquiry_messages
  for each row execute function public.tg_notify_message();

drop trigger if exists notify_group_message on public.group_messages;
create trigger notify_group_message
  after insert on public.group_messages
  for each row execute function public.tg_notify_message();

-- ---------------------------------------------------------------------
-- 4. trials
--
-- The one to be careful with. respond_to_trial raises on `not found`, and
-- mark_trial_outcome writes an outcome column on the same table — so this
-- trigger must fire on a status change and nothing else, and must never
-- raise. An outcome being recorded is not news to anybody.
-- ---------------------------------------------------------------------

create or replace function public.tg_notify_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_seeker uuid;
  v_provider uuid;
  v_recipient uuid;
  v_is_seeker boolean;
  v_kind text;
  v_thread uuid;
  v_title text;
begin
  if new.group_request_id is not null then
    v_kind := 'group';
    v_thread := new.group_request_id;
    select g.creator_id, p.user_id
      into v_seeker, v_provider
      from public.group_requests r
      join public.groups g on g.id = r.group_id
      join public.providers p on p.id = r.provider_id
     where r.id = new.group_request_id;
  else
    v_kind := 'enquiry';
    v_thread := new.enquiry_id;
    select e.seeker_id, p.user_id
      into v_seeker, v_provider
      from public.enquiries e
      join public.providers p on p.id = e.provider_id
     where e.id = new.enquiry_id;
  end if;

  if tg_op = 'INSERT' then
    -- Tell whoever did not propose it.
    if new.proposed_by = v_seeker then
      v_recipient := v_provider;
      v_is_seeker := false;
    else
      v_recipient := v_seeker;
      v_is_seeker := true;
    end if;
    v_title := 'A first class has been proposed';
  else
    -- Whoever did NOT make the change. auth.uid() survives SECURITY DEFINER —
    -- it reads the JWT claim, not the current role — so this is the one place
    -- that can tell confirm-by-the-other-side from cancel-by-either-side.
    -- Keyed off the proposer instead, cancelling your own trial mailed you.
    if auth.uid() = v_seeker then
      v_recipient := v_provider;
      v_is_seeker := false;
    else
      v_recipient := v_seeker;
      v_is_seeker := true;
    end if;
    v_title := case new.status
      when 'confirmed' then 'Your first class is confirmed'
      when 'declined' then 'That time didn''t work'
      else 'A first class was cancelled'
    end;
  end if;

  perform public.queue_notification(
    v_recipient,
    case when tg_op = 'INSERT' then 'trial_proposed' else 'trial_answered' end,
    v_kind,
    v_thread,
    v_title,
    to_char(new.scheduled_at, 'Dy DD Mon, HH24:MI'),
    public.thread_url(v_is_seeker, v_kind, v_thread)
  );
  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists notify_trial_proposed on public.trial_classes;
create trigger notify_trial_proposed
  after insert on public.trial_classes
  for each row execute function public.tg_notify_trial();

-- Status only. Without this WHEN clause, marking an outcome — two UPDATEs on
-- this table, one per side — would mail somebody about a class they already
-- attended.
drop trigger if exists notify_trial_answered on public.trial_classes;
create trigger notify_trial_answered
  after update on public.trial_classes
  for each row
  when (new.status is distinct from old.status)
  execute function public.tg_notify_trial();

-- ---------------------------------------------------------------------
-- 5. what the worker calls
--
-- Email addresses live in auth.users, which PostgREST does not expose and
-- should not. This definer function is the only place the two are joined, it
-- returns nothing but what an email needs, and only the service role may
-- execute it.
-- ---------------------------------------------------------------------

drop function if exists public.pending_notifications(integer);

create function public.pending_notifications(p_limit integer default 50)
returns table (
  id uuid,
  email text,
  kind text,
  title text,
  body text,
  url text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select n.id, u.email::text, n.kind, n.title, n.body, n.url
  from public.notifications n
  join auth.users u on u.id = n.recipient_id
  where n.emailed_at is null
    and n.attempts < 5
    and u.email is not null
    -- A moment's grace, so a burst of messages debounces before anything is
    -- sent rather than after.
    and n.created_at < now() - interval '1 minute'
  order by n.created_at
  limit p_limit;
$fn$;

create or replace function public.mark_notification_sent(p_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.notifications
     set emailed_at = case when p_error is null then now() else null end,
         attempts = attempts + 1,
         last_error = p_error
   where id = p_id;
end;
$fn$;

-- Reading your own is enough for the app; marking read is what stops the
-- debounce suppressing a genuinely new conversation.
create or replace function public.mark_notifications_read(p_thread_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.notifications
     set read_at = now()
   where recipient_id = auth.uid()
     and read_at is null
     and (p_thread_id is null or thread_id = p_thread_id);
end;
$fn$;

grant select on public.notifications to anon, authenticated, service_role;

-- Triggers reach this as their definer owner, so nobody else needs it — and
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which would have let
-- any signed-in user queue a notification to anyone, with any title and any
-- link in it. The revoke is the protection; the grant below is decoration.
revoke all on function public.queue_notification(uuid, text, text, uuid, text, text, text, interval)
  from public, anon, authenticated;
grant execute on function public.queue_notification to service_role;
grant execute on function public.thread_url to anon, authenticated, service_role;
grant execute on function public.mark_notifications_read to anon, authenticated, service_role;
-- The worker only. These read email addresses and write delivery state.
revoke all on function public.pending_notifications(integer) from public, anon, authenticated;
revoke all on function public.mark_notification_sent(uuid, text) from public, anon, authenticated;
grant execute on function public.pending_notifications to service_role;
grant execute on function public.mark_notification_sent to service_role;
