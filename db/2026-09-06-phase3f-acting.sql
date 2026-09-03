-- Phase 3F — Acting joins the taxonomy, alongside Dance and Music.
--
-- WHY THIS NEEDS A MIGRATION AT ALL
--
-- /admin/service-categories can add a category all day, but not a new GROUP:
-- service_category_master."group" is guarded by a check constraint, and the
-- REST API cannot alter a constraint. Same reason phase1d had to exist to add
-- dance and music. Adding a group is a schema change wearing the costume of
-- a content change, which is exactly why it keeps surprising people.
--
-- The group list also lives in three TypeScript places — lib/requirements.ts,
-- ServiceCategoryPicker and the admin form — and those move with this file.
-- Four copies of one list is the real problem here; this migration does not
-- fix it, but it is worth writing down that the next person to add a group
-- will have to touch all four again.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. widen the group constraint
-- ---------------------------------------------------------------------

alter table public.service_category_master
  drop constraint if exists service_category_master_group_check;

alter table public.service_category_master
  add constraint service_category_master_group_check check ("group" in (
    'sport',
    'wellness_fitness',
    'mind_game',
    'indoor_game',
    'subject',
    'exam_board',
    'dance',
    'music',
    'acting'
  ));

-- ---------------------------------------------------------------------
-- 2. the disciplines
--
-- Kept to what a coach in India would actually advertise teaching, rather
-- than a drama-school syllabus. An admin can add more from the taxonomy page
-- now that the group exists — that part never needed a migration.
-- ---------------------------------------------------------------------

insert into public.service_category_master (name, "group") values
  ('Acting', 'acting'),
  ('Theatre', 'acting'),
  ('Drama', 'acting'),
  ('Screen Acting', 'acting'),
  ('Voice & Diction', 'acting'),
  ('Public Speaking', 'acting'),
  ('Improvisation', 'acting'),
  ('Mime', 'acting'),
  ('Stand-up Comedy', 'acting'),
  ('Anchoring', 'acting'),
  ('Modelling', 'acting'),
  ('Audition Preparation', 'acting')
on conflict (name, "group") do nothing;

-- ---------------------------------------------------------------------
-- 3. who teaches it
--
-- Without these an acting coach has to describe themselves as a "Coach",
-- which is the same gap phase1d closed for dance and music teachers.
-- provider_category_master is unique on (name, provider_type).
-- ---------------------------------------------------------------------

insert into public.provider_category_master (name, provider_type) values
  ('Acting Teacher', 'individual'),
  ('Acting School', 'institution')
on conflict (name, provider_type) do nothing;
