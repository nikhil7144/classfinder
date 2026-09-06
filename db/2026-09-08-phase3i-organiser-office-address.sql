-- Phase 3I — an organiser has an office, not a venue.
--
-- THE PROBLEM
--
-- 3E gave organisers area_id, venue_name and venue_address, reasoning that
-- "a company running events across a city still runs each one at a venue".
-- The second half is true and the first half does not follow. An event
-- company runs a tournament at a ground in one city this month and a showcase
-- in another the next. Asking at signup which single area and which single
-- venue it belongs to asks a question the business has no answer to, and
-- whatever it picks is wrong by its second event.
--
-- The venue belongs to the event. Phase 4 asks for it there, per event, where
-- it is a fact rather than a guess — and the events table needs its own venue
-- columns regardless, so these three are not saving that work, only
-- pre-empting it with an answer nobody can give.
--
-- What signup actually needs is where the company is: an admin reviewing an
-- application and a parent chasing a booking both want to know who they are
-- dealing with. That is one field, and it is an office address.
--
-- WHAT THIS COSTS
--
-- One organiser row exists and it is an unapproved test listing. Its venue
-- text is carried into office_address rather than discarded, so nothing has
-- to be retyped; where the two genuinely disagree a human edits one field.
--
-- WHY DROP RATHER THAN LEAVE THEM
--
-- The same reasoning 3E used on event_planner. A column nothing writes and
-- every reader has to remember to ignore is exactly the failure mode that
-- migration was written to end. Leaving three of them behind to avoid a small
-- diff would be choosing that failure again, on purpose, a week later.
--
-- Run in the Supabase SQL editor. Idempotent. Requires phase3e.

-- ---------------------------------------------------------------------
-- 1. the new column
-- ---------------------------------------------------------------------

alter table public.organisers
  add column if not exists office_address text;

-- ---------------------------------------------------------------------
-- 2. carry the old text across
--
-- Before the drop, and guarded on the old columns still being there so a
-- second run is a no-op rather than an error. Truncated to the length the
-- constraint below allows, so a long pair of venue fields cannot make this
-- script fail at step 3 on data it wrote itself at step 2.
-- ---------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'organisers'
       and column_name = 'venue_address'
  ) then
    execute $mig$
      update public.organisers
         set office_address = left(
               nullif(concat_ws(', ', nullif(venue_name, ''), nullif(venue_address, '')), ''),
               500)
       where office_address is null
    $mig$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. the constraint
-- ---------------------------------------------------------------------

alter table public.organisers drop constraint if exists organisers_office_len;
alter table public.organisers
  add constraint organisers_office_len
  check (office_address is null or length(office_address) <= 500);

-- ---------------------------------------------------------------------
-- 4. the old columns go
--
-- organisers_venue_len and organisers_area_idx are defined on these columns,
-- so Postgres removes both with them; naming them separately would only be a
-- second place to keep correct.
-- ---------------------------------------------------------------------

alter table public.organisers
  drop column if exists area_id,
  drop column if exists venue_name,
  drop column if exists venue_address;

-- ---------------------------------------------------------------------
-- 5. the column grant, restated
--
-- 3E's grant named the three columns that no longer exist; dropping them took
-- their privileges with them, and office_address has none until it is said
-- here. Same shape as 3E on purpose — an owner may edit their listing and
-- must not be able to approve it, and column privileges are the only
-- mechanism that restricts which columns an UPDATE names.
-- ---------------------------------------------------------------------

revoke update on public.organisers from anon, authenticated;
grant update (
  name, about, logo_url, contact_email, contact_phone, website_url,
  office_address
) on public.organisers to authenticated;
