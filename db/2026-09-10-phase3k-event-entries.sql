-- Phase 3K — entries: who is coming, what they owe, and who called it off.
--
-- WHAT AN ENTRY IS
--
-- One row per registration, describing the participant rather than pointing
-- at them. There is no child record in this product — 2T gave seekers a
-- relation_to_learner and nothing more — and an entry should be a record of
-- what was true on the day in any case, the way requirement_events is. A
-- family entering two children makes two entries.
--
-- COUNTING PLACES
--
-- entries_count is a column on event_categories, maintained by a trigger. Not
-- a view and not a definer read: a parent has to see "34 of 40 taken" before
-- entering, RLS hides other families' entries, and anything counting as the
-- caller would therefore count only their own. A column is publicly readable,
-- is O(1), and — the real payoff — is the row enter_event locks.
--
-- Behind it sits one check constraint over two columns of the same row:
--
--     capacity is null or capacity >= entries_count
--
-- which closes both directions at once. An organiser cannot shrink capacity
-- below what is already sold, and the counter's own increment cannot overfill
-- even if the lock were somehow lost.
--
-- WHY THE WRITES ARE ALL DEFINER FUNCTIONS
--
-- Three things RLS cannot say. It cannot count under a lock, so capacity is
-- enforced in enter_event. It cannot restrict which columns an UPDATE names,
-- so receipt_no and amount_due — the numbers that bill somebody — would
-- otherwise be writable by the person being billed. And it cannot ask who is
-- asking in order to apply a different deadline to each, which is what
-- cancel_entry does. So event_entries has read policies and no write policies
-- at all, and every write goes through a function.
--
-- NO HOLDS, NO WAITLIST
--
-- An entry is confirmed when it is made; payment is a separate axis the
-- organiser marks by hand. A pending-payment state that reserves a place
-- needs hold expiry, a sweeper, and an answer for what happens when it fires
-- mid-payment, all of which is Phase 6 work once a gateway makes it real.
--
-- CANCELLING CLOSES BEFORE THE EVENT DOES
--
-- A family may withdraw until cancellation_deadline, which is its own column
-- because "no withdrawals in the last week" is a rule an organiser cannot
-- express by closing entries a week early — those are opposite things, one
-- stopping money coming in and the other stopping it going out. It falls back
-- to booking_closes_at and then to starts_at. The organiser keeps the power
-- until the event is completed, because entries taken in cash on the day
-- still have to be corrected afterwards.
--
-- Cancelling is never a delete. The row keeps its receipt number, because
-- destroying the record of money that changed hands offline is worse than any
-- tidiness it buys.
--
-- WHAT THIS CORRECTS IN 3J
--
--   * Only a draft is private. 3J's public read was status = 'published', so
--     cancelling or completing an event hid it from the very families who
--     entered it and quietly emptied their own history.
--   * An event with entries cannot go back to draft. Withdrawing is
--     'cancelled', which tells people.
--   * entry_type and team_size freeze once an entry exists. Flipping an
--     individual category to a team one makes every entry in it meaningless.
--
-- AND ONE BUG FROM 3H
--
-- tg_notify_query inserts into notifications (user_id, ...). The column is
-- recipient_id. Because the trigger swallows its own errors — correctly, so a
-- notification can never fail the thing it is about — this has failed
-- silently since it shipped, and no coach has ever been told about a query.
-- It is fixed here rather than left for its own migration, because 3K adds
-- three more notification kinds to the same table and shipping them beside a
-- dead one would be choosing to keep it.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3j.

-- ---------------------------------------------------------------------
-- 1. the cancellation deadline
--
-- Nullable, because most events do not need one. The ordering constraint is
-- restated whole rather than added to: a check constraint cannot be altered
-- in place, and two constraints each holding half the rule is how one of them
-- ends up forgotten.
-- ---------------------------------------------------------------------

alter table public.events
  add column if not exists cancellation_deadline timestamptz;

alter table public.events drop constraint if exists events_dates_ordered;
alter table public.events
  add constraint events_dates_ordered check (
    (ends_at is null or ends_at >= starts_at)
    and (booking_opens_at is null or booking_closes_at is null
         or booking_opens_at <= booking_closes_at)
    and (booking_closes_at is null or booking_closes_at <= starts_at)
    -- A deadline after the event has begun is not a deadline.
    and (cancellation_deadline is null or cancellation_deadline <= starts_at)
  );

-- 3J's grant named the columns as they were. An owner may set this one.
revoke update on public.events from authenticated;
grant update (
  title, about, service_category_id, banner_url,
  city_id, venue_name, venue_address,
  booking_mode, external_booking_url,
  booking_opens_at, booking_closes_at, cancellation_deadline, starts_at, ends_at,
  status
) on public.events to authenticated;

-- The one answer to "until when", so no screen and no function works it out
-- twice. Falls through the three columns in the order the header describes.
create or replace function public.event_cancel_deadline(p_event_id uuid)
returns timestamptz
language sql
stable
set search_path = public
as $fn$
  select coalesce(e.cancellation_deadline, e.booking_closes_at, e.starts_at)
  from public.events e where e.id = p_event_id;
$fn$;

grant execute on function public.event_cancel_deadline to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. only a draft is private
--
-- The correction described in the header. A cancelled or completed event
-- stays readable — its entrants have to be able to read the thing they
-- entered, on the morning they were going to turn up to it.
--
-- The owner-live condition stays: a suspended company's events still vanish
-- without anybody walking its rows.
-- ---------------------------------------------------------------------

drop policy if exists "public read published events" on public.events;
create policy "public read published events" on public.events for select
  using (status <> 'draft' and public.event_party_is_live(provider_id, organiser_id));

-- ---------------------------------------------------------------------
-- 3. the counter, and what it locks
-- ---------------------------------------------------------------------

alter table public.event_categories
  add column if not exists entries_count integer not null default 0;

alter table public.event_categories drop constraint if exists event_categories_capacity_holds;
alter table public.event_categories
  add constraint event_categories_capacity_holds
  check (capacity is null or capacity >= entries_count);

-- entries_count is derived, and a client that could write it could sell the
-- same place twice. 3J's grant is restated without it.
revoke update on public.event_categories from authenticated;
grant update (
  name, entry_type, team_size, capacity, fee_amount, min_age, max_age, sort_order
) on public.event_categories to authenticated;

-- ---------------------------------------------------------------------
-- 4. the entry
-- ---------------------------------------------------------------------

create table if not exists public.event_entries (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events(id) on delete cascade,
  -- restrict, not cascade: a category with entries in it may not be deleted,
  -- and the organiser's category editor has to diff rather than replace.
  event_category_id uuid not null references public.event_categories(id) on delete restrict,

  -- The account that entered, which is not necessarily the participant.
  seeker_id uuid not null references public.profiles(id) on delete cascade,

  -- Who is actually competing. Described here rather than looked up: see the
  -- header.
  participant_name text not null,
  participant_dob date,

  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),

  -- Money is a separate axis from attendance, so a late withdrawal the
  -- organiser agrees to can be cancelled without becoming a refund.
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refund_due', 'refunded', 'waived')),
  payment_mode text check (payment_mode in ('cash', 'upi', 'bank_transfer', 'card', 'other')),
  payment_reference text,
  paid_at timestamptz,

  -- Copied from the category at entry time, never read back through it: an
  -- organiser raising the fee must not silently re-bill everybody who has
  -- already entered.
  amount_due numeric(10, 2),

  -- Written by enter_event and by nothing else. 3J's header called for this.
  receipt_no text not null unique,

  entered_at timestamptz not null default now(),

  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_reason text,

  constraint event_entries_name_len check (length(participant_name) between 2 and 120),
  constraint event_entries_reference_len
    check (payment_reference is null or length(payment_reference) <= 120),
  constraint event_entries_reason_len
    check (cancelled_reason is null or length(cancelled_reason) <= 300),
  -- A cancelled row says when; a confirmed one does not pretend to.
  constraint event_entries_cancel_fields check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status = 'confirmed' and cancelled_at is null)
  ),
  constraint event_entries_paid_has_when check (
    payment_status <> 'paid' or paid_at is not null
  )
);

create index if not exists event_entries_event_idx
  on public.event_entries (event_id, entered_at desc);
create index if not exists event_entries_category_idx
  on public.event_entries (event_category_id);
create index if not exists event_entries_seeker_idx
  on public.event_entries (seeker_id, entered_at desc);

-- One family, one live entry per participant per category. A double tap on a
-- slow connection is the common case and it costs a place and a receipt.
create unique index if not exists event_entries_no_duplicates
  on public.event_entries (event_category_id, seeker_id, lower(participant_name))
  where status = 'confirmed';

-- The rest of a team. Individual categories have none.
create table if not exists public.event_entry_members (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.event_entries(id) on delete cascade,
  name text not null,
  dob date,
  sort_order integer not null default 0,

  constraint event_entry_members_name_len check (length(name) between 2 and 120)
);

create index if not exists event_entry_members_entry_idx
  on public.event_entry_members (entry_id, sort_order);

-- ---------------------------------------------------------------------
-- 5. receipt numbers
--
-- A sequence rather than a count, so a cancelled entry never frees its number
-- for reuse — two different families holding the same receipt is exactly the
-- confusion a receipt exists to prevent. Shaped CF-2609-00042: legible on a
-- phone screen at a ground, and no information about anybody in it.
-- ---------------------------------------------------------------------

create sequence if not exists public.event_receipt_seq;

create or replace function public.next_receipt_no()
returns text
language sql
volatile
as $fn$
  select 'CF-'
      || to_char(now() at time zone 'Asia/Kolkata', 'YYMM')
      || '-'
      || lpad(nextval('public.event_receipt_seq')::text, 5, '0');
$fn$;

-- Callable only from the functions above it. A client that could call this
-- directly could burn receipt numbers, which is harmless but pointless.
revoke execute on function public.next_receipt_no from public;

-- ---------------------------------------------------------------------
-- 6. keeping the counter true
--
-- Only confirmed entries occupy a place, so cancelling gives one back and the
-- freed place is genuinely resellable.
-- ---------------------------------------------------------------------

create or replace function public.tg_event_entry_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then
      update public.event_categories
         set entries_count = entries_count + 1
       where id = new.event_category_id;
    end if;

  elsif tg_op = 'DELETE' then
    if old.status = 'confirmed' then
      update public.event_categories
         set entries_count = greatest(entries_count - 1, 0)
       where id = old.event_category_id;
    end if;

  elsif old.status is distinct from new.status then
    if new.status = 'confirmed' then
      update public.event_categories
         set entries_count = entries_count + 1
       where id = new.event_category_id;
    else
      update public.event_categories
         set entries_count = greatest(entries_count - 1, 0)
       where id = old.event_category_id;
    end if;
  end if;

  return null;
end;
$fn$;

drop trigger if exists event_entry_count on public.event_entries;
create trigger event_entry_count
  after insert or delete or update of status on public.event_entries
  for each row execute function public.tg_event_entry_count();

-- ---------------------------------------------------------------------
-- 7. what an organiser may no longer change
--
-- Capacity is held by the constraint in section 3. These two are held here,
-- because there is no constraint that can compare a column with its own
-- previous value.
-- ---------------------------------------------------------------------

create or replace function public.tg_event_category_freeze()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if old.entries_count > 0 and (
       new.entry_type is distinct from old.entry_type
       or new.team_size is distinct from old.team_size
     ) then
    raise exception
      'Entries have been taken in this category, so its entry type and team size are fixed. '
      'Add a new category instead.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists event_category_freeze on public.event_categories;
create trigger event_category_freeze
  before update on public.event_categories
  for each row execute function public.tg_event_category_freeze();

-- An event with entries cannot be hidden from the people in it. Cancelling
-- says so out loud; going back to draft would just make it disappear.
create or replace function public.tg_event_no_unpublish()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if old.status = 'published' and new.status = 'draft'
     and exists (
       select 1 from public.event_entries e
        where e.event_id = old.id and e.status = 'confirmed'
     ) then
    raise exception
      'People have entered this event, so it cannot go back to a draft. Cancel it instead — '
      'that keeps the page up and tells them.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists event_no_unpublish on public.events;
create trigger event_no_unpublish
  before update on public.events
  for each row execute function public.tg_event_no_unpublish();

-- ---------------------------------------------------------------------
-- 8. RLS
--
-- Read policies only. Every write goes through the functions in section 9,
-- for the three reasons the header gives.
-- ---------------------------------------------------------------------

alter table public.event_entries enable row level security;

drop policy if exists "family reads own entries" on public.event_entries;
create policy "family reads own entries" on public.event_entries for select
  using (seeker_id = auth.uid());

drop policy if exists "owner reads entries to their events" on public.event_entries;
create policy "owner reads entries to their events" on public.event_entries for select
  using (public.owns_event(event_id));

drop policy if exists "admins read entries" on public.event_entries;
create policy "admins read entries" on public.event_entries for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

alter table public.event_entry_members enable row level security;

drop policy if exists "read members of a visible entry" on public.event_entry_members;
create policy "read members of a visible entry" on public.event_entry_members for select
  using (exists (
    select 1 from public.event_entries e
     where e.id = entry_id
       and (e.seeker_id = auth.uid() or public.owns_event(e.event_id))
  ));

drop policy if exists "admins read entry members" on public.event_entry_members;
create policy "admins read entry members" on public.event_entry_members for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- Never anon. These rows carry children's names and dates of birth, and the
-- public page of an event has no business listing who is coming to it.
revoke all on public.event_entries from anon, authenticated;
revoke all on public.event_entry_members from anon, authenticated;
grant select on public.event_entries to authenticated;
grant select on public.event_entry_members to authenticated;
grant select, insert, update, delete on public.event_entries to service_role;
grant select, insert, update, delete on public.event_entry_members to service_role;

-- ---------------------------------------------------------------------
-- 9. entering
--
-- The lock is the point. Two parents on the last place arrive as two
-- transactions, and `select ... for update` on the category row makes the
-- second wait for the first's count rather than reading the same stale one.
-- ---------------------------------------------------------------------

create or replace function public.enter_event(
  p_category_id uuid,
  p_participant_name text,
  p_participant_dob date default null,
  -- [{"name": "...", "dob": "2015-04-02"}, ...] — the rest of a team.
  p_members jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_category public.event_categories;
  v_event public.events;
  v_entry uuid;
  v_age integer;
  v_members integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.profile_complete
  ) then
    raise exception 'Finish your profile before entering an event.';
  end if;

  -- The lock. Everything below reads a count that cannot move underneath it.
  select * into v_category
    from public.event_categories
   where id = p_category_id
   for update;

  if v_category.id is null then
    raise exception 'No such category.';
  end if;

  select * into v_event from public.events where id = v_category.event_id;

  if v_event.status <> 'published'
     or not public.event_party_is_live(v_event.provider_id, v_event.organiser_id) then
    raise exception 'That event is not open for entries.';
  end if;

  if v_event.booking_mode <> 'platform' then
    raise exception 'Entries for this event are not taken here.';
  end if;

  if v_event.booking_opens_at is not null and v_event.booking_opens_at > now() then
    raise exception 'Entries have not opened yet.';
  end if;

  if v_event.booking_closes_at is not null and v_event.booking_closes_at < now() then
    raise exception 'Entries have closed.';
  end if;

  if v_event.starts_at < now() then
    raise exception 'That event has already started.';
  end if;

  if v_category.capacity is not null and v_category.entries_count >= v_category.capacity then
    raise exception 'That category is full.';
  end if;

  if length(coalesce(p_participant_name, '')) < 2 then
    raise exception 'Who is taking part?';
  end if;

  -- Age is judged on the day of the event, not the day of the entry, which is
  -- what an under-10 tournament actually means.
  if p_participant_dob is not null then
    v_age := extract(year from age(v_event.starts_at::date, p_participant_dob));

    if v_category.min_age is not null and v_age < v_category.min_age then
      raise exception 'This category is for ages % and over.', v_category.min_age;
    end if;
    if v_category.max_age is not null and v_age > v_category.max_age then
      raise exception 'This category is for ages % and under.', v_category.max_age;
    end if;
  end if;

  v_members := coalesce(jsonb_array_length(coalesce(p_members, '[]'::jsonb)), 0);

  if v_category.entry_type = 'team' then
    -- The named participant is one of the team, so the rest are team_size - 1.
    if v_members <> v_category.team_size - 1 then
      raise exception 'A % team needs % players in total.',
        v_category.name, v_category.team_size;
    end if;
  elsif v_members > 0 then
    raise exception 'That category is entered individually.';
  end if;

  insert into public.event_entries (
    event_id, event_category_id, seeker_id,
    participant_name, participant_dob,
    amount_due, receipt_no
  )
  values (
    v_event.id, v_category.id, auth.uid(),
    btrim(p_participant_name), p_participant_dob,
    v_category.fee_amount, public.next_receipt_no()
  )
  returning id into v_entry;

  insert into public.event_entry_members (entry_id, name, dob, sort_order)
  select
    v_entry,
    btrim(m.value ->> 'name'),
    nullif(m.value ->> 'dob', '')::date,
    (m.ordinality - 1)::integer
  from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) with ordinality as m(value, ordinality);

  return v_entry;
end;
$fn$;

grant execute on function public.enter_event to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 10. cancelling one entry
--
-- Who may, and until when, depends on who is asking — which is why this is a
-- function and not a policy. A family withdraws until the deadline; the
-- organiser can correct the register until the event is marked completed.
--
-- p_refund is the organiser's call and is ignored for anybody else. A late
-- withdrawal they agree to but do not refund is cancelled with p_refund
-- false, which is the whole reason attendance and money are two columns.
-- ---------------------------------------------------------------------

create or replace function public.cancel_entry(
  p_entry_id uuid,
  p_reason text default null,
  p_refund boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_entry public.event_entries;
  v_event public.events;
  v_is_owner boolean;
  v_refund boolean;
begin
  select * into v_entry from public.event_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'No such entry.';
  end if;

  select * into v_event from public.events where id = v_entry.event_id;
  v_is_owner := public.event_party_is_mine(v_event.provider_id, v_event.organiser_id);

  if not v_is_owner and v_entry.seeker_id <> auth.uid() then
    raise exception 'That entry is not yours.';
  end if;

  if v_entry.status = 'cancelled' then
    raise exception 'That entry is already cancelled.';
  end if;

  if v_event.status = 'completed' then
    raise exception 'This event is finished, so its entries can no longer be changed.';
  end if;

  if not v_is_owner and public.event_cancel_deadline(v_event.id) < now() then
    raise exception
      'The deadline for withdrawing from this event has passed. Contact the organiser.';
  end if;

  -- A family cannot waive its own refund, and an organiser is the only party
  -- who knows whether one is owed.
  v_refund := case when v_is_owner then coalesce(p_refund, true) else true end;

  update public.event_entries
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancelled_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300),
         payment_status = case
           when payment_status = 'paid' and v_refund then 'refund_due'
           else payment_status
         end
   where id = p_entry_id;
end;
$fn$;

grant execute on function public.cancel_entry to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 11. recording payment
--
-- The organiser's, and only theirs. A parent who could set this could mark
-- themselves paid, which is the same reason 2M does not let a coach certify
-- their own trial attendance.
--
-- The mode is recorded from the first version rather than added with the
-- gateway: Razorpay becomes another mode whose reference is a payment id, and
-- a register that already has the column keeps one history instead of
-- splitting into before and after.
-- ---------------------------------------------------------------------

create or replace function public.set_entry_payment(
  p_entry_id uuid,
  p_status text,
  p_mode text default null,
  p_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_entry public.event_entries;
  v_event public.events;
begin
  if p_status not in ('unpaid', 'paid', 'refund_due', 'refunded', 'waived') then
    raise exception 'Unknown payment status.';
  end if;

  if p_mode is not null and p_mode not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
    raise exception 'Unknown payment method.';
  end if;

  select * into v_entry from public.event_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'No such entry.';
  end if;

  select * into v_event from public.events where id = v_entry.event_id;
  if not public.event_party_is_mine(v_event.provider_id, v_event.organiser_id) then
    raise exception 'That entry is not yours.';
  end if;

  update public.event_entries
     set payment_status = p_status,
         payment_mode = coalesce(p_mode, payment_mode),
         payment_reference = coalesce(
           left(nullif(btrim(coalesce(p_reference, '')), ''), 120), payment_reference),
         -- Stamped once, when it is first marked paid. A later correction to
         -- the reference does not move the date the money arrived.
         paid_at = case
           when p_status = 'paid' then coalesce(paid_at, now())
           else paid_at
         end
   where id = p_entry_id;
end;
$fn$;

grant execute on function public.set_entry_payment to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 12. cancelling the whole event
--
-- The only bulk cancel there is, and it is a consequence rather than a
-- button: the reason to cancel every entry is always the event itself.
-- ---------------------------------------------------------------------

create or replace function public.tg_event_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if old.status = new.status or new.status <> 'cancelled' then
    return null;
  end if;

  update public.event_entries
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancelled_reason = 'The event was cancelled.',
         payment_status = case when payment_status = 'paid' then 'refund_due' else payment_status end
   where event_id = new.id
     and status = 'confirmed';

  return null;
end;
$fn$;

drop trigger if exists event_cancelled on public.events;
create trigger event_cancelled
  after update of status on public.events
  for each row execute function public.tg_event_cancelled();

-- ---------------------------------------------------------------------
-- 13. being told
--
-- Same two rules as 2N: it fires in the database so the mobile client is not
-- a special case, and it can never break what caused it.
-- ---------------------------------------------------------------------

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
    'entry_received',
    'entry_cancelled',
    'event_cancelled'
  ));

-- The 3H bug from the header. Rewritten to go through queue_notification
-- rather than to insert directly, so there is one place that knows the shape
-- of that table and this cannot drift from it again.
create or replace function public.tg_notify_query()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_provider_user uuid;
  v_service text;
begin
  select p.user_id into v_provider_user
  from public.providers p where p.id = new.provider_id;

  if v_provider_user is null then
    return null;
  end if;

  select sc.name into v_service
  from public.service_category_master sc where sc.id = new.service_category_id;

  perform public.queue_notification(
    v_provider_user,
    'query_received',
    null,
    null,
    'New query from ' || new.contact_name,
    coalesce(v_service, 'A parent') || ' — they have asked you to get in touch.',
    '/dashboard/queries?query=' || new.id
  );

  return null;
exception
  when others then
    return null;
end;
$fn$;

-- Who owns an event, as a profile id, so a notification can be addressed.
create or replace function public.event_owner_user(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(o.user_id, p.user_id)
  from public.events e
  left join public.organisers o on o.id = e.organiser_id
  left join public.providers p on p.id = e.provider_id
  where e.id = p_event_id;
$fn$;

grant execute on function public.event_owner_user to authenticated, service_role;

create or replace function public.tg_notify_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner uuid;
  v_event text;
  v_category text;
begin
  v_owner := public.event_owner_user(new.event_id);
  if v_owner is null then
    return null;
  end if;

  select title into v_event from public.events where id = new.event_id;
  select name into v_category from public.event_categories where id = new.event_category_id;

  perform public.queue_notification(
    v_owner,
    'entry_received',
    null,
    null,
    'New entry for ' || coalesce(v_event, 'your event'),
    new.participant_name || ' has entered ' || coalesce(v_category, 'a category') || '.',
    '/events/' || new.event_id::text || '/entries'
  );

  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists notify_entry on public.event_entries;
create trigger notify_entry
  after insert on public.event_entries
  for each row execute function public.tg_notify_entry();

-- A cancellation tells the other side, whichever side that is. Cancelled by
-- the family, the organiser needs to know a place is free; cancelled by the
-- organiser, the family needs to know rather more urgently than that.
create or replace function public.tg_notify_entry_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner uuid;
  v_event text;
  v_event_cancelled boolean;
begin
  if old.status <> 'confirmed' or new.status <> 'cancelled' then
    return null;
  end if;

  select title, status = 'cancelled' into v_event, v_event_cancelled
  from public.events where id = new.event_id;

  v_owner := public.event_owner_user(new.event_id);

  if v_event_cancelled then
    -- The event itself was called off, so the family hears about the event
    -- and not about their own row. The organiser already knows.
    perform public.queue_notification(
      new.seeker_id,
      'event_cancelled',
      null,
      null,
      coalesce(v_event, 'An event') || ' has been cancelled',
      case
        when new.payment_status = 'refund_due'
          then 'The organiser will be in touch about your refund.'
        else 'Your entry has been cancelled.'
      end,
      '/account/entries'
    );

  elsif new.cancelled_by = new.seeker_id then
    perform public.queue_notification(
      v_owner,
      'entry_cancelled',
      null,
      null,
      'An entry was withdrawn',
      new.participant_name || ' has withdrawn from ' || coalesce(v_event, 'your event') || '.',
      '/events/' || new.event_id::text || '/entries'
    );

  else
    perform public.queue_notification(
      new.seeker_id,
      'entry_cancelled',
      null,
      null,
      'Your entry was cancelled',
      coalesce(new.cancelled_reason, 'The organiser cancelled this entry.'),
      '/account/entries'
    );
  end if;

  return null;
exception
  when others then
    return null;
end;
$fn$;

drop trigger if exists notify_entry_cancelled on public.event_entries;
create trigger notify_entry_cancelled
  after update of status on public.event_entries
  for each row execute function public.tg_notify_entry_cancelled();

-- ---------------------------------------------------------------------
-- 14. the poster bucket
--
-- An event is sold by its poster, and asking an organiser to host the image
-- somewhere else first and paste a link is asking most of them not to have
-- one. File bytes go straight to Storage, never through the API — the rule
-- the Spaces image upload already follows, and the reason is the same: 5 MB
-- forwarded through a service to hand to Supabase is 5 MB of waste.
--
-- Public read, because the poster is on a page anybody may look at. Writes
-- are restricted by the first folder segment being the uploader's own id,
-- which is the shape phase1 established for the two photo buckets.
--
-- Banners belong to the events feature rather than to entries; they are here
-- because this is the migration being run next, and a bucket that arrives a
-- week after the form that writes to it is a form that fails in production.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('event-banners', 'event-banners', true)
on conflict (id) do nothing;

update storage.buckets
   set file_size_limit = 5242880,  -- 5 MB, the same ceiling as every other image
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'event-banners';

drop policy if exists "public read event banners" on storage.objects;
create policy "public read event banners" on storage.objects
  for select using (bucket_id = 'event-banners');

drop policy if exists "owner uploads own event banner" on storage.objects;
create policy "owner uploads own event banner" on storage.objects
  for insert with check (
    bucket_id = 'event-banners' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owner updates own event banner" on storage.objects;
create policy "owner updates own event banner" on storage.objects
  for update using (
    bucket_id = 'event-banners' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owner deletes own event banner" on storage.objects;
create policy "owner deletes own event banner" on storage.objects
  for delete using (
    bucket_id = 'event-banners' and (storage.foldername(name))[1] = auth.uid()::text
  );
