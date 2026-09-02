-- Phase 2M — the trial class.
--
-- Chat alone leaves the product knowing nothing. A parent and a coach agree a
-- first session in the thread, the child turns up or doesn't, and no row
-- anywhere records that any of it happened — so search still ranks by aerial
-- distance, there is no basis for a review that isn't a stranger's opinion,
-- and Phase 5 has nothing to show an advertiser.
--
-- This is the smallest object that fixes that: propose a day, time and place,
-- the other side confirms, afterwards each says whether it happened. No
-- calendar, no slot inventory, no capacity, no payment. Those belong to
-- event bookings in Phase 4, which are genuinely date-shaped; coaching is a
-- monthly relationship that merely *starts* with one session.
--
-- It hangs off BOTH thread kinds from the start. A group thread ends in
-- exactly the same event, and Groups exists precisely to produce those
-- students — building this enquiry-only would leave every group-sourced
-- student unrecordable and put a hole in the review rule on day one.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase2l.

-- ---------------------------------------------------------------------
-- 1. the trial
--
-- Two nullable foreign keys with a check that exactly one is set, rather than
-- a polymorphic (kind, id) pair. The pair would be shorter and would give up
-- referential integrity: nothing would stop a trial pointing at a thread that
-- no longer exists, and no cascade would clean it up.
-- ---------------------------------------------------------------------

create table if not exists public.trial_classes (
  id uuid primary key default gen_random_uuid(),

  group_request_id uuid references public.group_requests(id) on delete cascade,
  enquiry_id uuid references public.enquiries(id) on delete cascade,

  proposed_by uuid not null references public.profiles(id) on delete cascade,

  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60
    check (duration_minutes between 15 and 480),

  -- The same vocabulary the coach already described themselves with, so a
  -- proposal can be built from their own availability rows rather than asking
  -- them to retype where they teach.
  place text references public.teaching_place_master(id),
  -- The actual address or landmark. Free text: "Gate 3, Sunrise Society club
  -- house" is not a taxonomy.
  place_note text,

  -- A group trial is one session for several families; a direct enquiry is
  -- usually one child. This is the only field that differs between the two
  -- kinds, and it is the field that makes the group case work at all.
  student_count integer not null default 1 check (student_count between 1 and 100),

  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'declined', 'cancelled')),

  -- Marked after the fact, by each side independently. Two columns rather
  -- than one because they can legitimately disagree — a no-show has two
  -- stories — and a single column would let whoever wrote last decide.
  seeker_outcome text check (seeker_outcome in ('happened', 'no_show', 'cancelled')),
  provider_outcome text check (provider_outcome in ('happened', 'no_show', 'cancelled')),

  created_at timestamptz not null default now(),
  responded_at timestamptz,

  constraint trial_one_thread check (num_nonnulls(group_request_id, enquiry_id) = 1),
  constraint trial_place_note_len check (place_note is null or length(place_note) <= 300)
);

create index if not exists trial_classes_group_idx
  on public.trial_classes (group_request_id);
create index if not exists trial_classes_enquiry_idx
  on public.trial_classes (enquiry_id);

-- One live proposal per thread. Rescheduling is a new row once the old one is
-- declined or cancelled, so the history of a conversation stays readable —
-- "we tried three times and it never happened" is a real signal.
create unique index if not exists trial_classes_one_live_group
  on public.trial_classes (group_request_id)
  where group_request_id is not null and status in ('proposed', 'confirmed');

create unique index if not exists trial_classes_one_live_enquiry
  on public.trial_classes (enquiry_id)
  where enquiry_id is not null and status in ('proposed', 'confirmed');

-- ---------------------------------------------------------------------
-- 2. who is party to a trial
--
-- One helper both the policies and the functions below lean on, so the answer
-- exists in exactly one place. Definer, because answering it means reading
-- group_requests and enquiries — and a policy that reads an RLS-protected
-- table is filtered too, the fault that made joining a group impossible in
-- phase2f.
-- ---------------------------------------------------------------------

create or replace function public.is_trial_participant(p_trial_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.trial_classes t
    left join public.group_requests r on r.id = t.group_request_id
    left join public.groups g on g.id = r.group_id
    left join public.enquiries e on e.id = t.enquiry_id
    where t.id = p_trial_id
      and (
        g.creator_id = auth.uid()
        or public.is_my_provider(r.provider_id)
        or e.seeker_id = auth.uid()
        or public.is_my_provider(e.provider_id)
      )
  );
$fn$;

-- Is the caller the parent's side of this trial? Decides which outcome column
-- they write.
create or replace function public.is_trial_seeker(p_trial_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.trial_classes t
    left join public.group_requests r on r.id = t.group_request_id
    left join public.groups g on g.id = r.group_id
    left join public.enquiries e on e.id = t.enquiry_id
    where t.id = p_trial_id
      and (g.creator_id = auth.uid() or e.seeker_id = auth.uid())
  );
$fn$;

-- ---------------------------------------------------------------------
-- 3. RLS
--
-- Read-only to participants. Every write goes through the functions below:
-- confirming is not the same permission as proposing, and marking an outcome
-- must land in the caller's own column — none of which a policy can express.
-- ---------------------------------------------------------------------

alter table public.trial_classes enable row level security;

drop policy if exists "participants read trials" on public.trial_classes;
create policy "participants read trials" on public.trial_classes for select
  using (public.is_trial_participant(id));

-- ---------------------------------------------------------------------
-- 4. proposing, answering, and what actually happened
-- ---------------------------------------------------------------------

-- Either side may propose. A coach usually will — they know their own free
-- hours — but a parent saying "could we come Saturday at 10?" is the same
-- object and refusing it would send them back to WhatsApp.
--
-- The thread must be one that can carry a proposal: a group pitch only after
-- the parent accepted it, an enquiry as long as it is open. That mirrors
-- exactly where each kind allows messages.
create or replace function public.propose_trial(
  p_kind text,
  p_thread_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 60,
  p_place text default null,
  p_place_note text default null,
  p_student_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_students integer;
begin
  if p_scheduled_at <= now() then
    raise exception 'A trial class must be in the future.';
  end if;

  if p_kind = 'group' then
    -- Default the headcount to the group's, which is the number the parent
    -- already stated and the number the coach is planning around.
    select coalesce(p_student_count, g.student_count)
      into v_students
      from public.group_requests r
      join public.groups g on g.id = r.group_id
      where r.id = p_thread_id
        and r.status = 'accepted'
        and (g.creator_id = auth.uid() or public.is_my_provider(r.provider_id));

    if v_students is null then
      raise exception 'No accepted group conversation here to arrange a trial in.';
    end if;

    insert into public.trial_classes (
      group_request_id, proposed_by, scheduled_at, duration_minutes,
      place, place_note, student_count
    )
    values (
      p_thread_id, auth.uid(), p_scheduled_at, p_duration_minutes,
      p_place, p_place_note, v_students
    )
    returning id into v_id;

  elsif p_kind = 'enquiry' then
    if not exists (
      select 1 from public.enquiries e
      where e.id = p_thread_id
        and e.status = 'open'
        and (e.seeker_id = auth.uid() or public.is_my_provider(e.provider_id))
    ) then
      raise exception 'No open enquiry here to arrange a trial in.';
    end if;

    insert into public.trial_classes (
      enquiry_id, proposed_by, scheduled_at, duration_minutes,
      place, place_note, student_count
    )
    values (
      p_thread_id, auth.uid(), p_scheduled_at, p_duration_minutes,
      p_place, p_place_note, coalesce(p_student_count, 1)
    )
    returning id into v_id;

  else
    raise exception 'Unknown thread kind: %', p_kind;
  end if;

  return v_id;
end;
$fn$;

-- The other side answers. Not the proposer: confirming your own proposal
-- would make the whole record meaningless, which matters because this is what
-- a review will later hang on.
create or replace function public.respond_to_trial(p_trial_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_status not in ('confirmed', 'declined') then
    raise exception 'A trial is confirmed or declined, not %', p_status;
  end if;

  update public.trial_classes t
     set status = p_status,
         responded_at = now()
   where t.id = p_trial_id
     and t.status = 'proposed'
     and t.proposed_by <> auth.uid()
     and public.is_trial_participant(t.id);

  if not found then
    raise exception 'That trial is not yours to answer, or has already been answered.';
  end if;
end;
$fn$;

-- Either side calls it off, before or after confirming. Life happens, and a
-- cancelled trial must not sit in the record as one that was attended.
create or replace function public.cancel_trial(p_trial_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.trial_classes t
     set status = 'cancelled',
         responded_at = now()
   where t.id = p_trial_id
     and t.status in ('proposed', 'confirmed')
     and public.is_trial_participant(t.id);
end;
$fn$;

-- Afterwards. The caller can only ever write their own side's column, which
-- is why this is a function and not an update policy.
create or replace function public.mark_trial_outcome(p_trial_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_outcome not in ('happened', 'no_show', 'cancelled') then
    raise exception 'Unknown outcome: %', p_outcome;
  end if;

  if not public.is_trial_participant(p_trial_id) then
    raise exception 'That trial is not yours.';
  end if;

  if public.is_trial_seeker(p_trial_id) then
    update public.trial_classes set seeker_outcome = p_outcome where id = p_trial_id;
  else
    update public.trial_classes set provider_outcome = p_outcome where id = p_trial_id;
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 5. reading them back
--
-- Every trial a thread has ever had, newest first, with the two booleans the
-- UI would otherwise recompute wrongly in two places.
-- ---------------------------------------------------------------------

drop function if exists public.thread_trials(text, uuid);

create function public.thread_trials(p_kind text, p_thread_id uuid)
returns table (
  id uuid,
  scheduled_at timestamptz,
  duration_minutes integer,
  place text,
  place_label text,
  place_note text,
  student_count integer,
  status text,
  proposed_by uuid,
  i_proposed boolean,
  seeker_outcome text,
  provider_outcome text,
  my_outcome text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    t.id,
    t.scheduled_at,
    t.duration_minutes,
    t.place,
    tp.label,
    t.place_note,
    t.student_count,
    t.status,
    t.proposed_by,
    t.proposed_by = auth.uid(),
    t.seeker_outcome,
    t.provider_outcome,
    case when public.is_trial_seeker(t.id) then t.seeker_outcome else t.provider_outcome end,
    t.created_at
  from public.trial_classes t
  left join public.teaching_place_master tp on tp.id = t.place
  where public.is_trial_participant(t.id)
    and (
      (p_kind = 'group' and t.group_request_id = p_thread_id)
      or (p_kind = 'enquiry' and t.enquiry_id = p_thread_id)
    )
  order by t.scheduled_at desc;
$fn$;

-- ---------------------------------------------------------------------
-- 6. what a coach has actually done
--
-- Public, and deliberately narrow: counts only, never who or when. This is
-- the number that will later decide who a review may come from and give
-- search something to rank on besides how far away someone lives.
--
-- "Happened" is the parent's word for it, not the coach's. The coach's column
-- is kept for their own record and for spotting disagreements; letting the
-- person being reviewed certify their own attendance would defeat the point.
-- ---------------------------------------------------------------------

create or replace function public.provider_trial_stats(p_provider_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'confirmed', count(*) filter (where t.status = 'confirmed'),
    'happened', count(*) filter (where t.seeker_outcome = 'happened'),
    'families', count(distinct coalesce(g.creator_id, e.seeker_id))
                  filter (where t.seeker_outcome = 'happened')
  )
  from public.trial_classes t
  left join public.group_requests r on r.id = t.group_request_id
  left join public.groups g on g.id = r.group_id
  left join public.enquiries e on e.id = t.enquiry_id
  where coalesce(r.provider_id, e.provider_id) = p_provider_id;
$fn$;

-- Raw-SQL-created tables don't inherit Supabase's default grants.
grant select, insert, update, delete on public.trial_classes
  to anon, authenticated, service_role;

grant execute on function public.is_trial_participant to anon, authenticated, service_role;
grant execute on function public.is_trial_seeker to anon, authenticated, service_role;
grant execute on function public.propose_trial to anon, authenticated, service_role;
grant execute on function public.respond_to_trial to anon, authenticated, service_role;
grant execute on function public.cancel_trial to anon, authenticated, service_role;
grant execute on function public.mark_trial_outcome to anon, authenticated, service_role;
grant execute on function public.thread_trials to anon, authenticated, service_role;
grant execute on function public.provider_trial_stats to anon, authenticated, service_role;
