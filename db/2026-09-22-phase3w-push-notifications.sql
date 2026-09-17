-- Phase 3W — push, and the two query notifications that were never queued.
--
-- THE GAP
--
-- 2N built the queue and said, in its own header, that "push for the mobile
-- app slots in beside email later without touching a single trigger". This is
-- that later. The provider app ships with a demand feed, an inbox and a query
-- worklist, and nothing on a phone ever lights up: every one of those surfaces
-- is a screen somebody has to remember to open, which is the exact problem 2N
-- was written to solve for the web.
--
-- Nothing in here changes a trigger's decision about *who* hears about *what*.
-- The rows queued today are the rows pushed tomorrow. What is added is the
-- delivery leg — where to send it, whether this kind is worth a buzz, and
-- whether this person still wants them.
--
-- AND TWO NOTIFICATIONS THAT SHOULD ALWAYS HAVE EXISTED
--
-- set_query_status() can move a lead to 'callback_scheduled' with a time on
-- it, and nobody is told. Two people need to know a call is booked, and they
-- need to know different things:
--
--   * the parent, once, when it is scheduled — they asked to be rung, and
--     until now the only evidence anybody was going to was a status on a
--     screen they do not have;
--   * the coach, shortly before it is due — the lead was worked hours or days
--     ago, and a commitment made on Monday for Thursday is not one a worklist
--     badge will save.
--
-- The first is a trigger, like everything else since 2N. The second cannot be:
-- a trigger fires on a write, and nothing is written at the moment a call
-- falls due. It is a queuer the worker calls on each pass, which is the shape
-- 3K's header predicted a day-before reminder would need.
--
-- WHY CHANNELS ARE A TABLE AND NOT AN `if`
--
-- MOBILE-PLAN asks for "a decision on which of the existing notification
-- kinds push rather than email". That decision belongs in a row, not in the
-- worker: it will be revised by whoever is watching people uninstall, it
-- differs per kind for reasons that are commercial rather than technical, and
-- a deploy is a poor way to stop sending something.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2n and phase3h.

-- ---------------------------------------------------------------------
-- 1. where a push goes
--
-- A row per device, not per user. One person has a phone and a tablet, and a
-- family shares a handset — which is why the token, not the user, is unique:
-- the same physical device signing in as somebody else must move, not
-- accumulate a second row that keeps buzzing for the account that left.
-- ---------------------------------------------------------------------

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- FCM registration token. APNs is reached through Firebase rather than
  -- directly: one protocol to implement, one credential to rotate, and
  -- Apple's side of it is Google's problem.
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),

  -- Which app this device is running. The two flavours are separate installs
  -- with separate tokens, and a coach's phone must never be sent a parent's
  -- notification because both apps happened to be on it.
  app_flavor text not null check (app_flavor in ('provider', 'seeker')),

  -- For a localised body later. Recorded now because it is free at
  -- registration and archaeology afterwards.
  locale text,

  created_at timestamptz not null default now(),
  -- Refreshed every time the app registers, which it does on each launch. A
  -- token nobody has presented in months is a dead install.
  last_seen_at timestamptz not null default now(),

  -- Set when FCM says the token is gone, or when the app signs out. Kept
  -- rather than deleted: a token that keeps coming back disabled is a bug
  -- worth being able to see.
  disabled_at timestamptz,
  disabled_reason text,

  constraint device_tokens_token_len check (length(token) between 16 and 4096)
);

create unique index if not exists device_tokens_token_key
  on public.device_tokens (token);

-- The send path: every live device for one person, in one index hit.
create index if not exists device_tokens_live_idx
  on public.device_tokens (user_id)
  where disabled_at is null;

alter table public.device_tokens enable row level security;

-- Readable, so a settings screen can say "this phone and one other receive
-- notifications". Never writable directly — see the next section.
drop policy if exists "read own devices" on public.device_tokens;
create policy "read own devices" on public.device_tokens for select
  using (user_id = auth.uid());

grant select on public.device_tokens to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. registering one
--
-- Definer, and this is exactly the case PLAN.md's rule is about: registration
-- is an upsert keyed on a token that may currently belong to a *different*
-- user. A phone handed to a sibling, a coach and a parent sharing a tablet, a
-- device wiped and restored — in each the token is the same and the owner is
-- not. RLS cannot express "update this row you do not own, but only to hand
-- it to yourself", so the write goes through here.
--
-- Unlike the trigger functions, this one does not swallow its errors: a
-- client is waiting on the answer, and a registration that silently failed is
-- a phone that silently never buzzes.
-- ---------------------------------------------------------------------

create or replace function public.register_device_token(
  p_token text,
  p_platform text,
  p_app_flavor text,
  p_locale text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'Unknown platform: %', p_platform;
  end if;
  if p_app_flavor not in ('provider', 'seeker') then
    raise exception 'Unknown app: %', p_app_flavor;
  end if;

  insert into public.device_tokens (user_id, token, platform, app_flavor, locale)
  values (auth.uid(), p_token, p_platform, p_app_flavor, p_locale)
  on conflict (token) do update
     set user_id = auth.uid(),
         platform = excluded.platform,
         app_flavor = excluded.app_flavor,
         locale = coalesce(excluded.locale, public.device_tokens.locale),
         last_seen_at = now(),
         -- Re-registering is how a device FCM had given up on comes back.
         -- Clearing these is half the point of the call.
         disabled_at = null,
         disabled_reason = null
  returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function public.register_device_token to authenticated, service_role;

-- Signing out. The token belongs to the device rather than the session, so
-- the app has to say so on the way out — otherwise the next person to use
-- that phone gets the last person's messages.
create or replace function public.forget_device_token(p_token text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  update public.device_tokens
     set disabled_at = now(),
         disabled_reason = 'signed out'
   where user_id = auth.uid()
     and disabled_at is null
     -- No token means every device: "stop sending to all my phones", which is
     -- what somebody does after losing one.
     and (p_token is null or token = p_token);

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

grant execute on function public.forget_device_token to authenticated, service_role;

-- What FCM said. Service role only: this is the worker acting on a 404 from
-- Google, not a user making a choice.
create or replace function public.disable_device_tokens(
  p_tokens text[],
  p_reason text default 'unregistered'
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  update public.device_tokens
     set disabled_at = now(), disabled_reason = left(p_reason, 200)
   where token = any(p_tokens) and disabled_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke all on function public.disable_device_tokens(text[], text) from public, anon, authenticated;
grant execute on function public.disable_device_tokens to service_role;

-- ---------------------------------------------------------------------
-- 3. what somebody wants to be told about
--
-- A row per person, created on first write rather than at signup — a user
-- with no row wants the defaults, and backfilling a table to say "everything
-- on" is work that buys nothing.
--
-- Plain RLS, no definer: every column here is the caller's own to set, which
-- is precisely the case where a policy is enough.
-- ---------------------------------------------------------------------

create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,

  push_enabled boolean not null default true,
  email_enabled boolean not null default true,

  -- Kinds this person specifically does not want, whatever the channel table
  -- says. An escape hatch for the one notification somebody finds noisy,
  -- without asking them to turn off the lot.
  muted_kinds text[] not null default '{}',

  -- Local time, in the user's zone, during which push is held back. Email is
  -- unaffected: a mail arriving at 2am is not a buzz at 2am.
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Asia/Kolkata',

  updated_at timestamptz not null default now(),

  -- Both or neither. One half of a window is a rule nothing can evaluate.
  constraint notification_settings_quiet_pair check (
    (quiet_hours_start is null) = (quiet_hours_end is null)
  )
);

alter table public.notification_settings enable row level security;

drop policy if exists "read own settings" on public.notification_settings;
create policy "read own settings" on public.notification_settings for select
  using (user_id = auth.uid());

drop policy if exists "insert own settings" on public.notification_settings;
create policy "insert own settings" on public.notification_settings for insert
  with check (user_id = auth.uid());

drop policy if exists "update own settings" on public.notification_settings;
create policy "update own settings" on public.notification_settings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.notification_settings to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. which kinds push, which email
--
-- The MOBILE-PLAN decision, as data. Seeded with the defaults argued for
-- here and editable without a deploy.
--
-- The shape of the argument, kind by kind:
--
--   * Anything a person is *waiting on* pushes — an enquiry, a query, a
--     pitch, a message, a trial proposed or answered. These are the product
--     working.
--   * Anything that is a *record* emails only. An entry received is an
--     organiser's admin, and forty entries on the morning a competition opens
--     is forty buzzes and one uninstall.
--   * A cancellation pushes in both directions. It is the one kind where
--     being told late is worse than not being told at all.
-- ---------------------------------------------------------------------

create table if not exists public.notification_channels (
  kind text primary key,
  pushes boolean not null default true,
  emails boolean not null default true,

  -- Which app should buzz. A coach who is also a parent has both installed,
  -- and a notification row knows who it is for but not which of that person's
  -- two apps should light up — the kind is what knows that. 'either' is for
  -- the kinds that genuinely reach both sides: a message, a trial proposed,
  -- a trial answered.
  --
  -- Email ignores this. There is one inbox.
  audience text not null default 'either'
    check (audience in ('provider', 'seeker', 'either')),

  -- Why this row reads the way it does, for whoever changes it next.
  note text
);

-- Restated outside the CREATE, because `create table if not exists` skips the
-- whole statement on a project that already has the table — so a column added
-- to this file later would never appear there. A no-op on a fresh run.
alter table public.notification_channels
  add column if not exists audience text not null default 'either';

alter table public.notification_channels drop constraint if exists notification_channels_audience_check;
alter table public.notification_channels add constraint notification_channels_audience_check
  check (audience in ('provider', 'seeker', 'either'));

alter table public.notification_channels enable row level security;

-- Not a secret, and a client that knows which kinds push can label a settings
-- screen honestly rather than guessing.
drop policy if exists "anyone reads channels" on public.notification_channels;
create policy "anyone reads channels" on public.notification_channels for select using (true);

grant select on public.notification_channels to anon, authenticated, service_role;

insert into public.notification_channels (kind, pushes, emails, audience, note) values
  ('enquiry_received',         true,  true,  'provider', 'A parent is waiting on a reply.'),
  ('approach_received',        true,  true,  'seeker',   'A coach is waiting on a parent.'),
  ('pitch_received',           true,  true,  'seeker',   'A coach wants the group, and the group expires.'),
  ('message_received',         true,  true,  'either',   'queue_notification debounces it, so one buzz per thread per half hour.'),
  ('trial_proposed',           true,  true,  'either',   'A time to accept or refuse.'),
  ('trial_answered',           true,  true,  'either',   'The answer to one they proposed.'),
  ('query_received',           true,  true,  'provider', 'Somebody left a number. The most perishable thing in the product.'),
  ('query_callback_scheduled', true,  true,  'seeker',   'The parent learns a coach is actually going to ring.'),
  ('query_callback_due',       true,  false, 'provider', 'Minutes before a call. An email arriving then is useless.'),
  ('entry_received',           false, true,  'provider', 'Admin, and bursty. Forty entries must not be forty buzzes.'),
  ('entry_cancelled',          false, true,  'provider', 'Same: the organiser reads it when they work the list.'),
  ('event_cancelled',          true,  true,  'seeker',   'A family has planned a Saturday around this.')
on conflict (kind) do update
  set pushes = excluded.pushes,
      emails = excluded.emails,
      -- Re-running the file restores the shipped defaults. Somebody who has
      -- deliberately turned a kind off in production should expect that, and
      -- the alternative — a seed that cannot be corrected without a hand-
      -- written UPDATE — is worse.
      audience = excluded.audience,
      note = excluded.note;

-- ---------------------------------------------------------------------
-- 5. the queue grows a second delivery leg
--
-- Mirrors the email columns rather than sharing them. A notification that
-- emailed but could not push has not failed, and one counter could not say
-- which of the two had happened.
-- ---------------------------------------------------------------------

alter table public.notifications add column if not exists pushed_at timestamptz;
alter table public.notifications add column if not exists push_attempts integer not null default 0;
alter table public.notifications add column if not exists push_error text;

-- The push worker's scan.
create index if not exists notifications_push_pending_idx
  on public.notifications (created_at)
  where pushed_at is null and push_attempts < 3;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'enquiry_received',
    'approach_received',
    'pitch_received',
    'message_received',
    'trial_proposed',
    'trial_answered',
    'query_received',
    'query_callback_scheduled',
    'query_callback_due',
    'entry_received',
    'entry_cancelled',
    'event_cancelled'
  ));

-- ---------------------------------------------------------------------
-- 6. a call is booked — telling the parent
--
-- Fires when the status arrives at 'callback_scheduled', and again if the
-- time moves, because a rescheduled call is news of exactly the same weight
-- as the original. Not on every update: set_query_status() also writes
-- 'contacted' and 'completed', and a parent does not need to watch a coach
-- tick boxes.
--
-- Swallows its own errors, like every trigger since 2N. set_query_status()
-- raises on a query that is not yours, so a notification failure inside that
-- UPDATE would reach a coach as "that query is not yours" — the 2N header's
-- example, still true here.
-- ---------------------------------------------------------------------

-- When the coach was last reminded about this particular call. Cleared by
-- set_query_status() below whenever the time changes, so a rescheduled call
-- is reminded about again.
alter table public.queries add column if not exists callback_reminded_at timestamptz;

create or replace function public.tg_notify_callback_scheduled()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_coach text;
  v_when text;
begin
  select coalesce(p.display_name, 'Your coach') into v_coach
  from public.providers p where p.id = new.provider_id;

  -- Rendered in the local zone rather than UTC. A time that reads five and a
  -- half hours early is worse than no time at all.
  v_when := to_char(new.callback_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI am');

  perform public.queue_notification(
    new.seeker_id,
    'query_callback_scheduled',
    null,
    null,
    v_coach || ' will call you',
    v_when,
    '/account/queries?query=' || new.id
  );

  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists notify_callback_scheduled on public.queries;
create trigger notify_callback_scheduled
  after update on public.queries
  for each row
  when (
    new.status = 'callback_scheduled'
    and new.callback_at is not null
    and (old.status is distinct from new.status or old.callback_at is distinct from new.callback_at)
  )
  execute function public.tg_notify_callback_scheduled();

-- ---------------------------------------------------------------------
-- 6b. set_query_status(), reissued
--
-- Identical to 3H's except for one line: moving or clearing the callback time
-- clears the reminder stamp. It is here rather than in the trigger above
-- because an AFTER UPDATE trigger that writes to its own row is a recursion
-- waiting for somebody to widen the WHEN clause, and because this is the
-- function that already owns every write to these two columns.
-- ---------------------------------------------------------------------

create or replace function public.set_query_status(
  p_query_id uuid,
  p_status text,
  p_callback_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_provider uuid;
begin
  if p_status not in ('new', 'contacted', 'callback_scheduled', 'completed', 'closed') then
    raise exception 'Unknown status: %', p_status;
  end if;

  if p_status = 'callback_scheduled' and p_callback_at is null then
    raise exception 'A scheduled call needs a time.';
  end if;

  select provider_id into v_provider from public.queries where id = p_query_id;
  if v_provider is null or not public.is_my_provider(v_provider) then
    raise exception 'That query is not yours.';
  end if;

  update public.queries q
     set status = p_status,
         callback_at = case when p_status = 'callback_scheduled' then p_callback_at else null end,
         -- Stamped once, on the first move off 'new', so it keeps meaning
         -- "how long did this family wait to hear anything".
         responded_at = coalesce(q.responded_at, case when p_status <> 'new' then now() end),
         -- New in 3W. A call moved to a new time has not been reminded about;
         -- a call cancelled outright must not be reminded about at all, and
         -- the queuer only looks at rows still saying 'callback_scheduled'.
         callback_reminded_at = case
           when q.callback_at is distinct from
                (case when p_status = 'callback_scheduled' then p_callback_at else null end)
           then null
           else q.callback_reminded_at
         end
   where q.id = p_query_id;
end;
$fn$;

grant execute on function public.set_query_status to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. a call is due — reminding the coach
--
-- Not a trigger, because nothing is written when a time arrives. The worker
-- calls this on each pass and it queues whatever has come due since the last
-- one; callback_reminded_at makes a second pass over the same row a no-op,
-- which is what lets the worker run as often as it likes.
--
-- The window is deliberately generous behind: a worker that missed a run must
-- still send the reminder, late, rather than skip it silently. It is capped
-- so a call booked and forgotten for a week does not produce a buzz about a
-- call that plainly did not happen.
-- ---------------------------------------------------------------------

create or replace function public.queue_callback_reminders(
  p_lead interval default interval '30 minutes',
  p_grace interval default interval '6 hours'
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select q.id, q.callback_at, q.contact_name, q.contact_phone, p.user_id as coach
      from public.queries q
      join public.providers p on p.id = q.provider_id
     where q.status = 'callback_scheduled'
       and q.callback_reminded_at is null
       and q.callback_at is not null
       and q.callback_at <= now() + p_lead
       and q.callback_at > now() - p_grace
     -- One pass cannot run away with the queue if a backlog has built up.
     limit 200
  loop
    perform public.queue_notification(
      v_row.coach,
      'query_callback_due',
      null,
      null,
      'Call ' || v_row.contact_name || ' at ' ||
        to_char(v_row.callback_at at time zone 'Asia/Kolkata', 'HH12:MI am'),
      v_row.contact_phone,
      '/dashboard/queries?query=' || v_row.id
    );

    update public.queries set callback_reminded_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

revoke all on function public.queue_callback_reminders(interval, interval) from public, anon, authenticated;
grant execute on function public.queue_callback_reminders to service_role;

-- ---------------------------------------------------------------------
-- 8. what the push worker calls
--
-- One row per notification with its live tokens gathered, rather than a row
-- per device. FCM's send call takes one token, but the retry and the attempts
-- counter belong to the notification — a fan-out here would give somebody
-- with two phones two chances to exhaust the same counter.
--
-- Everything that decides *whether* to send is in this query rather than in
-- the worker: the channel table, the person's settings, their muted kinds,
-- quiet hours in their own zone, and the age of the row. The worker sends
-- what it is given.
-- ---------------------------------------------------------------------

drop function if exists public.pending_push_notifications(integer);

create function public.pending_push_notifications(p_limit integer default 100)
returns table (
  id uuid,
  recipient_id uuid,
  kind text,
  title text,
  body text,
  url text,
  thread_kind text,
  thread_id uuid,
  tokens text[]
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    n.id,
    n.recipient_id,
    n.kind,
    n.title,
    n.body,
    n.url,
    n.thread_kind,
    n.thread_id,
    array_agg(d.token order by d.last_seen_at desc) as tokens
  from public.notifications n
  join public.notification_channels c on c.kind = n.kind and c.pushes
  join public.device_tokens d
    on d.user_id = n.recipient_id
   and d.disabled_at is null
   -- A coach who is also a parent has both apps on one phone. The kind says
   -- which of them should light up; 'either' covers the ones that genuinely
   -- reach both sides, like a message.
   and (c.audience = 'either' or d.app_flavor = c.audience)
  left join public.notification_settings s on s.user_id = n.recipient_id
  where n.pushed_at is null
    and n.push_attempts < 3
    -- Already read in the app before the worker got to it. Sending now would
    -- buzz a phone about something its owner is looking at.
    and n.read_at is null
    and coalesce(s.push_enabled, true)
    and not (n.kind = any(coalesce(s.muted_kinds, '{}')))
    -- Push is worth sending while it is news. Past that the row stays for the
    -- in-app list and the email leg, and simply never buzzes.
    and n.created_at > now() - interval '24 hours'
    -- Quiet hours, in the recipient's zone. The overnight case — 22:00 to
    -- 07:00 — wraps midnight, which is why the two halves are separate.
    and (
      s.quiet_hours_start is null
      or case
           when s.quiet_hours_start < s.quiet_hours_end then
             (now() at time zone coalesce(s.timezone, 'Asia/Kolkata'))::time
               not between s.quiet_hours_start and s.quiet_hours_end
           else
             not (
               (now() at time zone coalesce(s.timezone, 'Asia/Kolkata'))::time >= s.quiet_hours_start
               or (now() at time zone coalesce(s.timezone, 'Asia/Kolkata'))::time <= s.quiet_hours_end
             )
         end
    )
  group by n.id, n.recipient_id, n.kind, n.title, n.body, n.url, n.thread_kind, n.thread_id,
           n.created_at
  order by n.created_at
  limit p_limit;
$fn$;

revoke all on function public.pending_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.pending_push_notifications to service_role;

create or replace function public.mark_push_sent(p_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.notifications
     set pushed_at = case when p_error is null then now() else null end,
         push_attempts = push_attempts + 1,
         push_error = left(p_error, 500)
   where id = p_id;
end;
$fn$;

revoke all on function public.mark_push_sent(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_push_sent to service_role;

-- ---------------------------------------------------------------------
-- 9. the email leg learns the same two rules
--
-- pending_notifications() has sent every kind to everyone since 2N. Now that
-- there is a table saying which kinds are worth an email, and a row saying
-- whether this person wants any, it reads both — otherwise turning email off
-- in the app would do nothing, which is worse than not offering the switch.
--
-- Signature unchanged, so the existing worker at /api/notifications/dispatch
-- respects it without a deploy.
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
  left join public.notification_channels c on c.kind = n.kind
  left join public.notification_settings s on s.user_id = n.recipient_id
  where n.emailed_at is null
    and n.attempts < 5
    and u.email is not null
    -- An unknown kind still mails. A new kind shipped without a channel row
    -- should be noisy rather than silent, because silence is the failure
    -- nobody notices.
    and coalesce(c.emails, true)
    and coalesce(s.email_enabled, true)
    and not (n.kind = any(coalesce(s.muted_kinds, '{}')))
    -- A moment's grace, so a burst of messages debounces before anything is
    -- sent rather than after.
    and n.created_at < now() - interval '1 minute'
  order by n.created_at
  limit p_limit;
$fn$;

revoke all on function public.pending_notifications(integer) from public, anon, authenticated;
grant execute on function public.pending_notifications to service_role;

-- ---------------------------------------------------------------------
-- 10. clearing specific ones
--
-- mark_notifications_read() takes a thread or everything, which is the right
-- pair for a bell and for opening a conversation. A list where each row can
-- be swiped needs the third: these ones.
-- ---------------------------------------------------------------------

create or replace function public.mark_notifications_read_ids(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where recipient_id = auth.uid()
     and read_at is null
     and id = any(p_ids);

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

grant execute on function public.mark_notifications_read_ids to authenticated, service_role;
