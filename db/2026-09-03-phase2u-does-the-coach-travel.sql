-- Phase 2U — does the coach travel?
--
-- teaching_place_master mixes two different questions and has since phase1f:
--
--   my_academy         a VENUE   — students come to my own place
--   group_classes      a FORMAT  — several students at once
--   individual_classes a FORMAT  — one-to-one
--
-- Format does not imply venue. A coach can run group batches at their own
-- academy and one-to-one at their own academy; another travels for both. So
-- "does this coach travel, and where to" — the one thing a scheduler cannot
-- work without — is asked nowhere, and the form has been inferring it.
--
-- The inference is wrong in a way that shows. providers.availability is
-- place-wise, and the form builds its list of places as "My place" (if
-- my_academy) plus EVERY service area. Service areas are required of every
-- individual, because that is also how search locates them — so a coach who
-- only ever teaches at their own centre is offered availability rows for
-- five areas they have never visited, and any scheduler reading that data
-- would believe they were there.
--
-- Rather than restructure the taxonomy — which the seeker side also uses, as
-- seekers.preferred_modes — this adds the missing question as one boolean.
-- teaching_place_master keeps meaning format, and stays valid on both sides.
--
-- Once this is answered the areas question can finally mean one thing at a
-- time: for a coach who travels it is "where can you get to", and for one who
-- does not it is "where is your place", which is a different question that
-- has been wearing the same label.
--
-- Run in the Supabase SQL editor. Idempotent.

alter table public.providers
  add column if not exists travels_to_students boolean;

comment on column public.providers.travels_to_students is
  'Individuals only. Whether they go to the student, as opposed to the '
  'student coming to them. Institutions locate by branches instead. Drives '
  'the place list on providers.availability, which the appointment '
  'scheduler reads.';

-- ---------------------------------------------------------------------
-- Backfill: preserve exactly what the product has been assuming.
--
-- Every existing individual is treated as travelling, because that is what
-- the form has effectively been recording — their service areas already
-- appear as availability places. Setting it to true changes nothing about how
-- they behave today and keeps every one of them a complete profile; the next
-- time they edit their listing they are asked properly.
--
-- Institutions and event planners get false rather than null so the column is
-- never ambiguous. Neither uses it: an institution's places are its branches.
-- ---------------------------------------------------------------------

update public.providers
   set travels_to_students = (provider_type = 'individual')
 where travels_to_students is null;
