-- ---------------------------------------------------------------------
-- Phase 3N — consent recorded with an event entry.
--
-- An entry is the one place this product takes a child's name and date of
-- birth. India's DPDP Act s.9(1) wants verifiable parental consent before a
-- child's personal data is processed, and a fiduciary that cannot show the
-- consent it relied on has not really got one — so it is stored on the row
-- rather than enforced only in the form.
--
-- Two columns, because "who" is already here: seeker_id is the account that
-- entered. consent_version says which wording they were shown, consent_given_at
-- when. A changed wording gets a new version string and old rows keep theirs.
--
-- This does NOT by itself make the consent verifiable within the meaning of
-- Rule 10. That turns on holding reliable identity and age information about
-- the parent, which profiles does not carry today — an email OTP and a phone
-- number is not it. This is the record; the identity question is separate and
-- still open.
-- ---------------------------------------------------------------------

alter table public.event_entries
  add column if not exists consent_version text,
  add column if not exists consent_given_at timestamptz;

comment on column public.event_entries.consent_version is
  'Which consent wording the entrant agreed to. Null only on rows created before this migration.';

-- Adding a parameter makes a second overload rather than replacing the first,
-- and two candidates with defaults make the call ambiguous. Drop the old
-- signature by name before creating the new one.
drop function if exists public.enter_event(uuid, text, date, jsonb);

create or replace function public.enter_event(
  p_category_id uuid,
  p_participant_name text,
  -- Which wording the entrant agreed to, recorded so consent can be shown
  -- later rather than merely asserted. The API holds the current value.
  p_consent_version text,
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

  if p_consent_version is null or btrim(p_consent_version) = '' then
    raise exception 'Consent is required before entering a participant.';
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
    consent_version, consent_given_at,
    amount_due, receipt_no
  )
  values (
    v_event.id, v_category.id, auth.uid(),
    btrim(p_participant_name), p_participant_dob,
    btrim(p_consent_version), now(),
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
