-- Phase 3H — a parent can ask to be contacted, without starting a conversation.
--
-- THE GAP
--
-- Reaching a coach has meant exactly one thing since 2L: write a message and a
-- thread opens. enquiries.status is 'open' or 'declined' and that is the whole
-- lifecycle, so a coach with twenty enquiries has twenty chat threads and no
-- way to record that one is done, one wants a call on Tuesday, and one went
-- nowhere. The product only knows how to talk about an enquiry, not to work
-- through it.
--
-- From the parent's side the same gap looks different: someone who just wants
-- a call back has to open a conversation to ask for one.
--
-- WHY A SEPARATE TABLE RATHER THAN MORE STATUSES ON enquiries
--
-- Because a query and a conversation are different objects with different
-- lifecycles, and a parent may reasonably have both with the same coach: a
-- query being worked ("she'll call Tuesday") while a thread runs about
-- something else. enquiries_one_live permits exactly one live enquiry per
-- pair, so folding queries in would have made those mutually exclusive.
--
-- They are linked rather than merged. A coach who answers a query starts a
-- normal enquiry thread carrying query_id, so the parent sees why a coach is
-- messaging them — a message from nowhere is the thing that makes an
-- unsolicited contact feel like one.
--
-- WHY THE PHONE IS NOT OPTIONAL HERE
--
-- On an enquiry it is an opt-in, because the point of an enquiry is to talk in
-- the thread. The point of a query is to be contacted, so a query without a
-- number is a request nobody can act on. The parent still chooses what number
-- to give — the form is prefilled from their profile and editable, so a
-- parent with a second number can use it without changing their account.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2l.

-- ---------------------------------------------------------------------
-- 1. the query
-- ---------------------------------------------------------------------

create table if not exists public.queries (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,

  -- A snapshot, not a join. What the parent chose to be called and called on
  -- at the moment they asked — editing their profile later must not silently
  -- rewrite a number a coach has already been given and may have dialled.
  contact_name text not null,
  contact_phone text not null,

  service_category_id uuid references public.service_category_master(id),
  details text,

  -- The worklist. 'new' until the coach touches it; the rest are what a coach
  -- actually does with a lead.
  status text not null default 'new'
    check (status in ('new', 'contacted', 'callback_scheduled', 'completed', 'closed')),
  callback_at timestamptz,

  created_at timestamptz not null default now(),
  -- First time the coach moved it off 'new'. Answers "how long did they wait".
  responded_at timestamptz,
  seeker_read_at timestamptz,
  provider_read_at timestamptz,

  constraint queries_name_len check (length(contact_name) between 2 and 120),
  constraint queries_phone_shape check (contact_phone ~ '^[0-9+\-\s()]{6,20}$'),
  constraint queries_details_len check (details is null or length(details) <= 1000),
  -- A scheduled callback with no time is a status that says nothing.
  constraint queries_callback_has_time
    check (status <> 'callback_scheduled' or callback_at is not null)
);

create index if not exists queries_provider_idx
  on public.queries (provider_id, created_at desc);
create index if not exists queries_seeker_idx
  on public.queries (seeker_id, created_at desc);
-- The coach's default view is what still needs doing.
create index if not exists queries_open_idx
  on public.queries (provider_id, created_at desc)
  where status in ('new', 'contacted', 'callback_scheduled');

-- One live query per parent per coach, so a parent pressing the button twice
-- does not produce two leads. Completed and closed ones do not block a new
-- one — a family who came back a year later is asking a new question.
create unique index if not exists queries_one_live
  on public.queries (seeker_id, provider_id)
  where status not in ('completed', 'closed');

-- ---------------------------------------------------------------------
-- 2. the link back to a conversation
--
-- Nullable and on enquiries, not queries: a query may never produce a thread,
-- and a thread usually has no query behind it.
-- ---------------------------------------------------------------------

alter table public.enquiries
  add column if not exists query_id uuid references public.queries(id) on delete set null;

create index if not exists enquiries_query_idx on public.enquiries (query_id)
  where query_id is not null;

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------

alter table public.queries enable row level security;

drop policy if exists "participants read queries" on public.queries;
create policy "participants read queries" on public.queries for select
  using (seeker_id = auth.uid() or public.is_my_provider(provider_id));

-- The same bar as sending an enquiry, and for the same reason: this reaches a
-- working coach's dashboard with a name and a phone number on it, so the
-- account behind it must be one the product vouches for rather than a verified
-- email address and nothing more.
drop policy if exists "seeker raises query" on public.queries;
create policy "seeker raises query" on public.queries for insert
  with check (
    seeker_id = auth.uid()
    and status = 'new'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'seeker' and p.profile_complete = true
    )
    and exists (
      select 1 from public.providers pr
      where pr.id = provider_id
        and pr.approved = true
        and pr.is_suspended = false
    )
  );

-- No update policy. status, callback_at and the read timestamps all move
-- through the definer functions below, for the reason 2L and 2K gave: RLS
-- cannot restrict which columns an UPDATE touches, and a parent must not be
-- able to mark their own query completed on a coach's behalf.

grant select, insert on public.queries to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. the coach works the lead
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
         responded_at = coalesce(q.responded_at, case when p_status <> 'new' then now() end)
   where q.id = p_query_id;
end;
$fn$;

grant execute on function public.set_query_status to authenticated, service_role;

create or replace function public.mark_query_read(p_query_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.queries q set seeker_read_at = now()
   where q.id = p_query_id and q.seeker_id = auth.uid();

  update public.queries q set provider_read_at = now()
   where q.id = p_query_id and public.is_my_provider(q.provider_id);
end;
$fn$;

grant execute on function public.mark_query_read to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. answering a query in writing
--
-- Definer because of what it has to reconcile. enquiries_one_live permits one
-- live enquiry per pair, so a coach pressing Message on a query when a thread
-- already exists must land in that thread rather than fail on a unique index
-- — and the parent must not end up with two conversations for one coach,
-- which is the confusion this product already has a history of.
--
-- The new thread opens rather than pending, and that is the consent argument
-- from 2L pointed the other way: a parent who raised a query asked to be
-- contacted, so a coach replying to it needs no permission.
-- ---------------------------------------------------------------------

create or replace function public.answer_query(p_query_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_query public.queries;
  v_enquiry uuid;
begin
  select * into v_query from public.queries where id = p_query_id;
  if v_query.id is null or not public.is_my_provider(v_query.provider_id) then
    raise exception 'That query is not yours.';
  end if;

  if length(coalesce(p_message, '')) < 1 then
    raise exception 'Write something first.';
  end if;

  -- An existing live thread with this family wins. Attaching the query to it
  -- is what tells the parent why the coach is writing.
  select e.id into v_enquiry
  from public.enquiries e
  where e.seeker_id = v_query.seeker_id
    and e.provider_id = v_query.provider_id
    and e.status <> 'declined'
  limit 1;

  if v_enquiry is null then
    insert into public.enquiries
      (seeker_id, provider_id, service_category_id, message, status, initiated_by, query_id)
    values (
      v_query.seeker_id,
      v_query.provider_id,
      v_query.service_category_id,
      p_message,
      'open',
      'provider',
      v_query.id
    )
    returning id into v_enquiry;
  else
    update public.enquiries set query_id = coalesce(query_id, v_query.id) where id = v_enquiry;

    insert into public.enquiry_messages (enquiry_id, sender_id, body)
    values (v_enquiry, auth.uid(), p_message);
  end if;

  -- Writing to someone is contact, so the lead stops saying 'new' without the
  -- coach having to also remember to change it.
  update public.queries q
     set status = case when q.status = 'new' then 'contacted' else q.status end,
         responded_at = coalesce(q.responded_at, now())
   where q.id = p_query_id;

  return v_enquiry;
end;
$fn$;

grant execute on function public.answer_query to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. telling the coach
--
-- Same shape as tg_notify_enquiry in phase2r: fires in the database, not the
-- web client, so a query raised from the mobile app notifies just as one
-- raised from a browser does. Never fails the insert that caused it.
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
    'query_received'
  ));

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

  insert into public.notifications (user_id, kind, title, body, url)
  values (
    v_provider_user,
    'query_received',
    'New query from ' || new.contact_name,
    coalesce(v_service, 'A parent') || ' — they have asked you to get in touch.',
    '/dashboard/queries?query=' || new.id
  );

  return null;
exception
  when others then
    -- A notification that failed must never fail the query it was about.
    return null;
end;
$fn$;

drop trigger if exists notify_query on public.queries;
create trigger notify_query
  after insert on public.queries
  for each row execute function public.tg_notify_query();
