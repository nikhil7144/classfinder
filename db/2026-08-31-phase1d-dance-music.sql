-- Adds Dance and Music as service groups, plus the provider categories that
-- go with them.
--
-- The `group` column is guarded by a check constraint, so the constraint has
-- to be widened before any dance/music row can be inserted — this file must
-- be run in the SQL editor (the REST API can't alter constraints).
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------
-- 1. widen the group check constraint
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
    'music'
  ));

-- ---------------------------------------------------------------------
-- 2. Dance styles
-- ---------------------------------------------------------------------

insert into public.service_category_master (name, "group") values
  -- Indian classical
  ('Bharatanatyam', 'dance'),
  ('Kathak', 'dance'),
  ('Odissi', 'dance'),
  ('Kuchipudi', 'dance'),
  ('Kathakali', 'dance'),
  ('Manipuri', 'dance'),
  ('Mohiniyattam', 'dance'),
  ('Sattriya', 'dance'),
  -- Indian folk
  ('Bhangra', 'dance'),
  ('Garba', 'dance'),
  ('Lavani', 'dance'),
  ('Ghoomar', 'dance'),
  -- Popular / film
  ('Bollywood', 'dance'),
  ('Semi-Classical', 'dance'),
  ('Freestyle', 'dance'),
  -- Western
  ('Hip Hop', 'dance'),
  ('Contemporary', 'dance'),
  ('Ballet', 'dance'),
  ('Jazz Dance', 'dance'),
  ('Salsa', 'dance'),
  ('Breakdance', 'dance'),
  ('Belly Dance', 'dance'),
  ('Tap Dance', 'dance')
on conflict (name, "group") do nothing;

-- ---------------------------------------------------------------------
-- 3. Music — vocal and instruments
-- ---------------------------------------------------------------------

insert into public.service_category_master (name, "group") values
  -- Vocal
  ('Hindustani Vocal', 'music'),
  ('Carnatic Vocal', 'music'),
  ('Western Vocal', 'music'),
  -- Indian instruments
  ('Sitar', 'music'),
  ('Tabla', 'music'),
  ('Flute', 'music'),
  ('Harmonium', 'music'),
  ('Veena', 'music'),
  ('Sarod', 'music'),
  ('Santoor', 'music'),
  ('Mridangam', 'music'),
  ('Dholak', 'music'),
  ('Shehnai', 'music'),
  -- Western instruments
  ('Guitar', 'music'),
  ('Keyboard', 'music'),
  ('Piano', 'music'),
  ('Violin', 'music'),
  ('Drums', 'music'),
  ('Cello', 'music'),
  ('Saxophone', 'music'),
  ('Trumpet', 'music'),
  ('Ukulele', 'music'),
  -- Production / theory
  ('Music Theory', 'music'),
  ('Music Production', 'music'),
  ('DJing', 'music')
on conflict (name, "group") do nothing;

-- ---------------------------------------------------------------------
-- 4. Provider categories for dance/music teachers
--
-- Without these a guitar teacher signing up has to describe themselves as a
-- "Coach" or "Academic Teacher", neither of which fits. provider_category_master
-- is unique on (name, provider_type).
-- ---------------------------------------------------------------------

insert into public.provider_category_master (name, provider_type) values
  ('Dance Teacher', 'individual'),
  ('Music Teacher', 'individual'),
  ('Dance Academy', 'institution'),
  ('Music School', 'institution')
on conflict (name, provider_type) do nothing;
