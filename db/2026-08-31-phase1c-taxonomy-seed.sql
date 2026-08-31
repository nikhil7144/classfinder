-- ClassFinder service taxonomy seed.
--
-- Idempotent: adds a unique constraint on (name, "group") first, then
-- seeds with ON CONFLICT DO NOTHING, so this is safe to re-run and safe
-- to apply to a database that already has some of these rows.

alter table public.service_category_master
  drop constraint if exists service_category_master_name_group_key;
alter table public.service_category_master
  add constraint service_category_master_name_group_key unique (name, "group");

-- sport (32)
insert into public.service_category_master (name, "group") values
  ('Cricket', 'sport'),
  ('Football', 'sport'),
  ('Badminton', 'sport'),
  ('Tennis', 'sport'),
  ('Table Tennis', 'sport'),
  ('Basketball', 'sport'),
  ('Volleyball', 'sport'),
  ('Hockey', 'sport'),
  ('Swimming', 'sport'),
  ('Athletics', 'sport'),
  ('Kabaddi', 'sport'),
  ('Kho Kho', 'sport'),
  ('Boxing', 'sport'),
  ('Wrestling', 'sport'),
  ('Judo', 'sport'),
  ('Karate', 'sport'),
  ('Taekwondo', 'sport'),
  ('Mixed Martial Arts', 'sport'),
  ('Kalaripayattu', 'sport'),
  ('Squash', 'sport'),
  ('Golf', 'sport'),
  ('Shooting', 'sport'),
  ('Archery', 'sport'),
  ('Cycling', 'sport'),
  ('Skating', 'sport'),
  ('Gymnastics', 'sport'),
  ('Rowing', 'sport'),
  ('Weightlifting', 'sport'),
  ('Fencing', 'sport'),
  ('Handball', 'sport'),
  ('Rugby', 'sport'),
  ('Horse Riding', 'sport')
on conflict (name, "group") do nothing;

-- wellness_fitness (12)
insert into public.service_category_master (name, "group") values
  ('Yoga', 'wellness_fitness'),
  ('Zumba', 'wellness_fitness'),
  ('Aerobics', 'wellness_fitness'),
  ('Gym & Strength Training', 'wellness_fitness'),
  ('Personal Training', 'wellness_fitness'),
  ('Pilates', 'wellness_fitness'),
  ('Meditation & Mindfulness', 'wellness_fitness'),
  ('CrossFit', 'wellness_fitness'),
  ('Calisthenics', 'wellness_fitness'),
  ('Weight Loss Training', 'wellness_fitness'),
  ('Prenatal & Postnatal Fitness', 'wellness_fitness'),
  ('Dance Fitness', 'wellness_fitness')
on conflict (name, "group") do nothing;

-- mind_game (10)
insert into public.service_category_master (name, "group") values
  ('Chess', 'mind_game'),
  ('Abacus', 'mind_game'),
  ('Vedic Maths', 'mind_game'),
  ('Rubik’s Cube', 'mind_game'),
  ('Sudoku', 'mind_game'),
  ('Memory Training', 'mind_game'),
  ('Bridge', 'mind_game'),
  ('Scrabble', 'mind_game'),
  ('Quizzing', 'mind_game'),
  ('Logical Reasoning', 'mind_game')
on conflict (name, "group") do nothing;

-- indoor_game (8)
insert into public.service_category_master (name, "group") values
  ('Carrom', 'indoor_game'),
  ('Snooker', 'indoor_game'),
  ('Billiards', 'indoor_game'),
  ('Pool', 'indoor_game'),
  ('Bowling', 'indoor_game'),
  ('Darts', 'indoor_game'),
  ('Foosball', 'indoor_game'),
  ('Air Hockey', 'indoor_game')
on conflict (name, "group") do nothing;

-- subject (30)
insert into public.service_category_master (name, "group") values
  ('Mathematics', 'subject'),
  ('Physics', 'subject'),
  ('Chemistry', 'subject'),
  ('Biology', 'subject'),
  ('Science', 'subject'),
  ('English', 'subject'),
  ('Hindi', 'subject'),
  ('Sanskrit', 'subject'),
  ('Marathi', 'subject'),
  ('Gujarati', 'subject'),
  ('Tamil', 'subject'),
  ('Telugu', 'subject'),
  ('Kannada', 'subject'),
  ('Bengali', 'subject'),
  ('Social Studies', 'subject'),
  ('History', 'subject'),
  ('Geography', 'subject'),
  ('Political Science', 'subject'),
  ('Economics', 'subject'),
  ('Accountancy', 'subject'),
  ('Business Studies', 'subject'),
  ('Computer Science', 'subject'),
  ('Environmental Studies', 'subject'),
  ('Statistics', 'subject'),
  ('Psychology', 'subject'),
  ('Sociology', 'subject'),
  ('French', 'subject'),
  ('German', 'subject'),
  ('Spanish', 'subject'),
  ('Programming & Coding', 'subject')
on conflict (name, "group") do nothing;

-- exam_board (36)
insert into public.service_category_master (name, "group") values
  ('CBSE', 'exam_board'),
  ('ICSE', 'exam_board'),
  ('ISC', 'exam_board'),
  ('State Board', 'exam_board'),
  ('IB', 'exam_board'),
  ('IGCSE / Cambridge', 'exam_board'),
  ('NIOS', 'exam_board'),
  ('JEE Main', 'exam_board'),
  ('JEE Advanced', 'exam_board'),
  ('NEET UG', 'exam_board'),
  ('BITSAT', 'exam_board'),
  ('CUET', 'exam_board'),
  ('NTSE', 'exam_board'),
  ('Olympiads', 'exam_board'),
  ('CLAT', 'exam_board'),
  ('CAT', 'exam_board'),
  ('XAT', 'exam_board'),
  ('NIFT', 'exam_board'),
  ('NID', 'exam_board'),
  ('NATA', 'exam_board'),
  ('UPSC Civil Services', 'exam_board'),
  ('State PSC', 'exam_board'),
  ('SSC', 'exam_board'),
  ('Banking Exams', 'exam_board'),
  ('Railway Exams', 'exam_board'),
  ('NDA', 'exam_board'),
  ('CDS', 'exam_board'),
  ('GATE', 'exam_board'),
  ('CA', 'exam_board'),
  ('CS', 'exam_board'),
  ('CMA', 'exam_board'),
  ('IELTS', 'exam_board'),
  ('TOEFL', 'exam_board'),
  ('GRE', 'exam_board'),
  ('GMAT', 'exam_board'),
  ('SAT', 'exam_board')
on conflict (name, "group") do nothing;
