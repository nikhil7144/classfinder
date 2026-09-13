-- Phase 3U — Exams become a taxonomy of their own.
--
-- WHAT WAS WRONG
--
-- `exam_board` held 36 rows that were three different things wearing one
-- label: school boards (CBSE, IB), entrance exams (JEE, NEET, CAT), and
-- recruitment exams (SSC, UPSC). PLAN.md flagged this as an open question —
-- "a CBSE Class-10 tutor is a different business from a JEE institute" —
-- and searching one flat list of 36 for "IIT" returned nothing, because the
-- row is called "JEE Advanced".
--
-- WHAT THIS DOES
--
-- 1. `exam_board` keeps only actual school boards.
-- 2. A new group, `competitive_exam`, holds everything you sit an exam for:
--    entrance tests, government recruitment, professional qualifications,
--    study-abroad and language tests, IT certifications.
-- 3. That group is too big for one flat list (~200 rows), so a `subgroup`
--    column splits it into the seventeen streams a coaching institute
--    actually advertises — Engineering, Medical, Banking, Study Abroad…
-- 4. An `aliases` column carries what people type but nobody names a row:
--    "IIT JEE", "Bank PO", "IAS", "Daroga", "Air Hostess".
--
-- Existing rows are UPDATEd, never deleted and re-inserted, so every uuid
-- survives. providers.service_category_ids is a uuid[] — a provider who
-- selected JEE Main keeps it, now filed under Engineering.
--
-- The group list also lives in four TypeScript places — lib/requirements.ts,
-- lib/events.ts, ServiceCategoryPicker and the admin form — and those move
-- with this file. Phase 3F wrote down that the next person to add a group
-- would have to touch all four again. This is that person.
--
-- Run in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------
-- 1. the new group and the two new columns
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
    'acting',
    'competitive_exam'
  ));

-- Nullable on purpose: every other group is flat, and an admin adding an
-- exam from /admin/service-categories may not pick a stream. Nulls render
-- under "Other" rather than vanishing.
alter table public.service_category_master
  add column if not exists subgroup text;

-- Search-only. Never displayed — the row still renders as its name.
alter table public.service_category_master
  add column if not exists aliases text[] not null default '{}';

alter table public.service_category_master
  drop constraint if exists service_category_master_subgroup_check;

alter table public.service_category_master
  add constraint service_category_master_subgroup_check check (
    subgroup is null or subgroup in (
      'school',           -- school-level talent, scholarship and entrance tests
      'engineering',      -- engineering and pure-science entrance
      'medical',          -- medical, dental, pharmacy, nursing, veterinary
      'management',       -- MBA and business-school entrance
      'law',
      'design',           -- design and architecture
      'university',       -- general university admission and research entry
      'civil_services',
      'defence',          -- armed forces and police
      'banking',          -- banking and insurance recruitment
      'ssc_railway',      -- staff selection and railway recruitment
      'teaching',         -- teacher eligibility and research fellowship
      'finance',          -- CA, CS, CMA and the global finance qualifications
      'study_abroad',
      'language',         -- foreign-language proficiency
      'certification',    -- IT and professional certification
      'vocational'        -- aviation, hospitality, maritime
    )
  );

create index if not exists service_category_master_subgroup_idx
  on public.service_category_master (subgroup) where subgroup is not null;

-- ---------------------------------------------------------------------
-- 2. canonical names for the rows that were too terse to search
--
-- Runs before the move, so it matches the old group. Once a row has been
-- renamed the WHERE matches nothing, which is what makes a re-run a no-op.
-- Two-letter names are the problem case: "CS" is Company Secretary here and
-- Computer Science in the `subject` group, and only one of them said so.
-- ---------------------------------------------------------------------

update public.service_category_master set name = 'CUET UG'
  where name = 'CUET' and "group" = 'exam_board';
update public.service_category_master set name = 'NID DAT'
  where name = 'NID' and "group" = 'exam_board';
update public.service_category_master set name = 'SSC Exams'
  where name = 'SSC' and "group" = 'exam_board';
update public.service_category_master set name = 'CA (Chartered Accountancy)'
  where name = 'CA' and "group" = 'exam_board';
update public.service_category_master set name = 'CS (Company Secretary)'
  where name = 'CS' and "group" = 'exam_board';
update public.service_category_master set name = 'CMA (Cost & Management Accountancy)'
  where name = 'CMA' and "group" = 'exam_board';

-- ---------------------------------------------------------------------
-- 3. move the exams out of exam_board
--
-- Named explicitly rather than "everything that is not a board", so that a
-- board an admin added after phase 1c is not swept up by a migration that
-- has never heard of it. Subgroups arrive in step 4.
-- ---------------------------------------------------------------------

update public.service_category_master
   set "group" = 'competitive_exam'
 where "group" = 'exam_board'
   and name in (
     'JEE Main', 'JEE Advanced', 'NEET UG', 'BITSAT', 'CUET UG', 'NTSE',
     'Olympiads', 'CLAT', 'CAT', 'XAT', 'NIFT', 'NID DAT', 'NATA',
     'UPSC Civil Services', 'State PSC', 'SSC Exams', 'Banking Exams',
     'Railway Exams', 'NDA', 'CDS', 'GATE', 'CA (Chartered Accountancy)',
     'CS (Company Secretary)', 'CMA (Cost & Management Accountancy)',
     'IELTS', 'TOEFL', 'GRE', 'GMAT', 'SAT'
   );

-- What stays in exam_board, and all that should: CBSE, ICSE, ISC,
-- State Board, IB, IGCSE / Cambridge, NIOS.

-- ---------------------------------------------------------------------
-- 4. the catalogue
--
-- Every row below is declared once, whether it already exists or not — the
-- 29 rows moved in step 3 collide on (name, "group") and take their subgroup
-- and aliases from the conflict clause, keeping their uuid. is_active is
-- deliberately absent from the update: an admin who switched a category off
-- should not have it switched back on by a re-run.
--
-- Scope is what a coaching institute in India actually advertises. That is
-- why Agniveer and Police SI are in here and, say, the RBI Grade B DEPR
-- stream is not — nobody sells a class under that name.
-- ---------------------------------------------------------------------

-- school (12) — what a parent enrols a school-age child for.
-- NTSE has been on hold since NCERT suspended it, but institutes still sell
-- "NTSE/Olympiad" batches, so it stays listed.
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('Olympiads', 'competitive_exam', 'school', array['SOF','NSO','IMO','IEO','Science Olympiad','Maths Olympiad']),
  ('NTSE', 'competitive_exam', 'school', array['National Talent Search Examination','Talent Search']),
  ('NMMS', 'competitive_exam', 'school', array['National Means cum Merit Scholarship','Merit Scholarship']),
  ('NSTSE', 'competitive_exam', 'school', array['National Level Science Talent Search']),
  ('Homi Bhabha Balvaidnyanik', 'competitive_exam', 'school', array['Homi Bhabha Science Exam','Balvaidnyanik']),
  ('JNVST (Navodaya Entrance)', 'competitive_exam', 'school', array['Navodaya','JNV','Jawahar Navodaya Vidyalaya']),
  ('Sainik School Entrance (AISSEE)', 'competitive_exam', 'school', array['AISSEE','Sainik School']),
  ('RIMC Entrance', 'competitive_exam', 'school', array['Rashtriya Indian Military College']),
  ('RMS Entrance', 'competitive_exam', 'school', array['Rashtriya Military School','Military School']),
  ('IIT Foundation', 'competitive_exam', 'school', array['JEE Foundation','Foundation Course','Pre-Foundation']),
  ('NEET Foundation', 'competitive_exam', 'school', array['Medical Foundation']),
  ('State Scholarship Exams', 'competitive_exam', 'school', array['Scholarship Exam','Pre-Scholarship'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- engineering & sciences (21) — the national tests, the big state CETs, and
-- the private-university tests students sit as a backup to JEE.
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('JEE Main', 'competitive_exam', 'engineering', array['IIT JEE','AIEEE','NTA JEE','JEE']),
  ('JEE Advanced', 'competitive_exam', 'engineering', array['IIT JEE Advanced','IIT Entrance','IIT']),
  ('BITSAT', 'competitive_exam', 'engineering', array['BITS Pilani','BITS Entrance']),
  ('VITEEE', 'competitive_exam', 'engineering', array['VIT Entrance','VIT Vellore']),
  ('SRMJEEE', 'competitive_exam', 'engineering', array['SRM Entrance','SRM University']),
  ('MET (Manipal Entrance Test)', 'competitive_exam', 'engineering', array['Manipal Entrance','MET']),
  ('COMEDK UGET', 'competitive_exam', 'engineering', array['COMEDK','Karnataka Private Engineering']),
  ('MHT CET', 'competitive_exam', 'engineering', array['Maharashtra CET','MHTCET','MH CET']),
  ('WBJEE', 'competitive_exam', 'engineering', array['West Bengal JEE']),
  ('KCET', 'competitive_exam', 'engineering', array['Karnataka CET','K-CET']),
  ('AP EAPCET', 'competitive_exam', 'engineering', array['EAMCET','AP EAMCET','Andhra Pradesh EAPCET']),
  ('TS EAMCET', 'competitive_exam', 'engineering', array['TG EAPCET','Telangana EAMCET']),
  ('KEAM', 'competitive_exam', 'engineering', array['Kerala Engineering Entrance']),
  ('GUJCET', 'competitive_exam', 'engineering', array['Gujarat CET']),
  ('IPU CET', 'competitive_exam', 'engineering', array['GGSIPU','IP University Entrance']),
  ('JEECUP (Polytechnic)', 'competitive_exam', 'engineering', array['Polytechnic Entrance','UP Polytechnic','Diploma Entrance']),
  ('IISER Aptitude Test (IAT)', 'competitive_exam', 'engineering', array['IISER','IAT']),
  ('NEST', 'competitive_exam', 'engineering', array['National Entrance Screening Test','NISER']),
  ('ISI Admission Test', 'competitive_exam', 'engineering', array['Indian Statistical Institute','ISI']),
  ('CMI Entrance', 'competitive_exam', 'engineering', array['Chennai Mathematical Institute','CMI']),
  ('State Engineering CET', 'competitive_exam', 'engineering', array['State CET','Engineering CET'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- medical, dental, pharmacy, nursing, veterinary (13)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('NEET UG', 'competitive_exam', 'medical', array['NEET','Medical Entrance','MBBS Entrance']),
  ('NEET PG', 'competitive_exam', 'medical', array['PG Medical Entrance','MD MS Entrance']),
  ('NEET MDS', 'competitive_exam', 'medical', array['Dental PG','MDS Entrance']),
  ('NEET SS', 'competitive_exam', 'medical', array['Super Speciality','DM MCh']),
  ('INI CET', 'competitive_exam', 'medical', array['AIIMS PG','PGIMER','INICET']),
  ('FMGE', 'competitive_exam', 'medical', array['MCI Screening Test','Foreign Medical Graduate Exam']),
  ('NExT', 'competitive_exam', 'medical', array['National Exit Test']),
  ('AIAPGET', 'competitive_exam', 'medical', array['AYUSH PG','Ayurveda PG','Homeopathy PG']),
  ('GPAT', 'competitive_exam', 'medical', array['Pharmacy Entrance','Graduate Pharmacy Aptitude Test']),
  ('NIPER JEE', 'competitive_exam', 'medical', array['NIPER','Pharmacy PG']),
  ('BSc Nursing Entrance', 'competitive_exam', 'medical', array['Nursing Entrance','AIIMS Nursing','Nursing Admission']),
  ('NORCET', 'competitive_exam', 'medical', array['Nursing Officer Recruitment','AIIMS NORCET','Staff Nurse']),
  ('AIPVT (Veterinary)', 'competitive_exam', 'medical', array['Veterinary Entrance','ICAR Veterinary'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- management & business (16). GMAT is filed under study_abroad even though
-- Indian B-schools accept it, because the class being sold is a GMAT class.
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('CAT', 'competitive_exam', 'management', array['Common Admission Test','MBA Entrance','IIM Entrance']),
  ('XAT', 'competitive_exam', 'management', array['Xavier Aptitude Test','XLRI']),
  ('NMAT', 'competitive_exam', 'management', array['NMAT by GMAC','NMIMS']),
  ('SNAP', 'competitive_exam', 'management', array['Symbiosis MBA','Symbiosis National Aptitude Test']),
  ('CMAT', 'competitive_exam', 'management', array['Common Management Admission Test']),
  ('MAT', 'competitive_exam', 'management', array['Management Aptitude Test','AIMA MAT']),
  ('IIFT', 'competitive_exam', 'management', array['Indian Institute of Foreign Trade']),
  ('TISSNET', 'competitive_exam', 'management', array['TISS','Tata Institute of Social Sciences']),
  ('MICAT', 'competitive_exam', 'management', array['MICA','Communications MBA']),
  ('ATMA', 'competitive_exam', 'management', array['AIMS Test for Management Admissions']),
  ('MAH MBA CET', 'competitive_exam', 'management', array['Maharashtra MBA CET','MBA CET']),
  ('KMAT', 'competitive_exam', 'management', array['Karnataka MAT','Kerala MAT']),
  ('TANCET', 'competitive_exam', 'management', array['Tamil Nadu Common Entrance Test']),
  ('IPMAT', 'competitive_exam', 'management', array['IIM Indore IPM','Integrated Programme in Management','IPM']),
  ('SET (Symbiosis Entrance Test)', 'competitive_exam', 'management', array['Symbiosis SET','BBA Entrance']),
  ('NPAT', 'competitive_exam', 'management', array['NMIMS NPAT','BBA Entrance'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- law (8)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('CLAT', 'competitive_exam', 'law', array['Common Law Admission Test','NLU Entrance','Law Entrance']),
  ('AILET', 'competitive_exam', 'law', array['NLU Delhi','All India Law Entrance Test']),
  ('LSAT India', 'competitive_exam', 'law', array['LSAT']),
  ('MH CET Law', 'competitive_exam', 'law', array['Maharashtra Law CET','Law CET']),
  ('SLAT', 'competitive_exam', 'law', array['Symbiosis Law Admission Test']),
  ('CLAT PG', 'competitive_exam', 'law', array['LLM Entrance']),
  ('AIBE', 'competitive_exam', 'law', array['Bar Exam','All India Bar Examination']),
  ('Judiciary Services (PCS-J)', 'competitive_exam', 'law', array['Judicial Services','PCS J','Civil Judge'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- design & architecture (7)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('NIFT', 'competitive_exam', 'design', array['Fashion Design Entrance','NIFT Entrance']),
  ('NID DAT', 'competitive_exam', 'design', array['NID','Design Aptitude Test']),
  ('UCEED', 'competitive_exam', 'design', array['IIT Design','B.Des Entrance']),
  ('CEED', 'competitive_exam', 'design', array['M.Des Entrance','Design PG']),
  ('NATA', 'competitive_exam', 'design', array['Architecture Entrance','National Aptitude Test in Architecture']),
  ('JEE Main Paper 2 (B.Arch)', 'competitive_exam', 'design', array['B.Arch','JEE Paper 2','Architecture']),
  ('Pearl Academy Entrance', 'competitive_exam', 'design', array['Pearl Academy'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- university admission & research entry (7)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('CUET UG', 'competitive_exam', 'university', array['CUET','Central University Entrance','DU Entrance']),
  ('CUET PG', 'competitive_exam', 'university', array['PG Entrance','Masters Entrance']),
  ('GATE', 'competitive_exam', 'university', array['Graduate Aptitude Test in Engineering','PSU Exam','M.Tech Entrance']),
  ('IIT JAM', 'competitive_exam', 'university', array['JAM','MSc Entrance']),
  ('JEST', 'competitive_exam', 'university', array['Joint Entrance Screening Test','PhD Physics']),
  ('TIFR GS', 'competitive_exam', 'university', array['TIFR Graduate School']),
  ('ICAR AIEEA', 'competitive_exam', 'university', array['Agriculture Entrance','ICAR'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- civil services (15). "State PSC" stays as the umbrella for the states
-- named below and the dozen that are not.
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('UPSC Civil Services', 'competitive_exam', 'civil_services', array['IAS','IPS','UPSC CSE','UPSC','Civil Services']),
  ('UPSC ESE', 'competitive_exam', 'civil_services', array['Engineering Services Examination','IES']),
  ('UPSC CAPF (AC)', 'competitive_exam', 'civil_services', array['CAPF Assistant Commandant','Assistant Commandant']),
  ('UPSC IFoS', 'competitive_exam', 'civil_services', array['Indian Forest Service','Forest Service']),
  ('UPSC CMS', 'competitive_exam', 'civil_services', array['Combined Medical Services']),
  ('State PSC', 'competitive_exam', 'civil_services', array['PSC','State Civil Services','State Services']),
  ('MPSC', 'competitive_exam', 'civil_services', array['Maharashtra PSC','Rajyaseva']),
  ('UPPSC', 'competitive_exam', 'civil_services', array['Uttar Pradesh PSC','UP PCS','PCS']),
  ('BPSC', 'competitive_exam', 'civil_services', array['Bihar PSC']),
  ('MPPSC', 'competitive_exam', 'civil_services', array['Madhya Pradesh PSC']),
  ('RPSC', 'competitive_exam', 'civil_services', array['Rajasthan PSC','RAS']),
  ('GPSC', 'competitive_exam', 'civil_services', array['Gujarat PSC']),
  ('TNPSC', 'competitive_exam', 'civil_services', array['Tamil Nadu PSC']),
  ('KPSC', 'competitive_exam', 'civil_services', array['Karnataka PSC','KAS']),
  ('WBCS', 'competitive_exam', 'civil_services', array['West Bengal Civil Service'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- defence & police (10). SSB is an interview, not a written exam, but it is
-- coached and sold exactly like one.
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('NDA', 'competitive_exam', 'defence', array['National Defence Academy']),
  ('CDS', 'competitive_exam', 'defence', array['Combined Defence Services']),
  ('AFCAT', 'competitive_exam', 'defence', array['Air Force Common Admission Test','Air Force']),
  ('INET', 'competitive_exam', 'defence', array['Indian Navy Entrance Test','Navy']),
  ('Agniveer', 'competitive_exam', 'defence', array['Agnipath','Army Agniveer','Army Bharti']),
  ('Territorial Army', 'competitive_exam', 'defence', array['TA Exam']),
  ('Indian Coast Guard (Navik)', 'competitive_exam', 'defence', array['Coast Guard','Navik','Yantrik']),
  ('State Police Constable', 'competitive_exam', 'defence', array['Police Bharti','Constable Exam','Police Exam']),
  ('Police Sub-Inspector (SI)', 'competitive_exam', 'defence', array['PSI','SI Exam','Daroga']),
  ('SSB Interview', 'competitive_exam', 'defence', array['Services Selection Board','SSB'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- banking & insurance (13)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('Banking Exams', 'competitive_exam', 'banking', array['Bank Exam','Bank PO','Bank Clerk','Banking']),
  ('IBPS PO', 'competitive_exam', 'banking', array['IBPS Probationary Officer']),
  ('IBPS Clerk', 'competitive_exam', 'banking', array['IBPS Clerical']),
  ('IBPS RRB', 'competitive_exam', 'banking', array['Regional Rural Bank','Gramin Bank']),
  ('IBPS SO', 'competitive_exam', 'banking', array['Specialist Officer']),
  ('SBI PO', 'competitive_exam', 'banking', array['State Bank PO']),
  ('SBI Clerk', 'competitive_exam', 'banking', array['Junior Associate','State Bank Clerk']),
  ('RBI Grade B', 'competitive_exam', 'banking', array['Reserve Bank Grade B','RBI']),
  ('RBI Assistant', 'competitive_exam', 'banking', array['Reserve Bank Assistant']),
  ('NABARD Grade A', 'competitive_exam', 'banking', array['NABARD']),
  ('SEBI Grade A', 'competitive_exam', 'banking', array['SEBI','Securities Market']),
  ('LIC AAO', 'competitive_exam', 'banking', array['LIC','Assistant Administrative Officer']),
  ('NIACL AO', 'competitive_exam', 'banking', array['New India Assurance','Insurance Exam'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- staff selection & railways (14)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('SSC Exams', 'competitive_exam', 'ssc_railway', array['SSC','Staff Selection Commission']),
  ('SSC CGL', 'competitive_exam', 'ssc_railway', array['Combined Graduate Level']),
  ('SSC CHSL', 'competitive_exam', 'ssc_railway', array['Combined Higher Secondary Level','10+2 Level']),
  ('SSC MTS', 'competitive_exam', 'ssc_railway', array['Multi Tasking Staff','Havaldar']),
  ('SSC GD Constable', 'competitive_exam', 'ssc_railway', array['GD Constable','CAPF Constable','BSF CRPF']),
  ('SSC CPO', 'competitive_exam', 'ssc_railway', array['Central Police Organisation','SSC SI','Delhi Police SI']),
  ('SSC JE', 'competitive_exam', 'ssc_railway', array['Junior Engineer']),
  ('SSC Stenographer', 'competitive_exam', 'ssc_railway', array['Steno','Shorthand']),
  ('Railway Exams', 'competitive_exam', 'ssc_railway', array['RRB','Indian Railways','Railway']),
  ('RRB NTPC', 'competitive_exam', 'ssc_railway', array['Non Technical Popular Categories']),
  ('RRB Group D', 'competitive_exam', 'ssc_railway', array['Group D','Level 1']),
  ('RRB ALP', 'competitive_exam', 'ssc_railway', array['Assistant Loco Pilot','Loco Pilot']),
  ('RRB JE', 'competitive_exam', 'ssc_railway', array['Railway Junior Engineer']),
  ('RPF Constable', 'competitive_exam', 'ssc_railway', array['Railway Protection Force','RPF SI'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- teaching & research (10)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('CTET', 'competitive_exam', 'teaching', array['Central Teacher Eligibility Test','Teacher Exam']),
  ('State TET', 'competitive_exam', 'teaching', array['TET','Teacher Eligibility Test']),
  ('UGC NET', 'competitive_exam', 'teaching', array['NET','JRF','Assistant Professor']),
  ('CSIR NET', 'competitive_exam', 'teaching', array['CSIR UGC NET','Science JRF']),
  ('SET / SLET', 'competitive_exam', 'teaching', array['State Eligibility Test','SLET']),
  ('KVS Recruitment', 'competitive_exam', 'teaching', array['Kendriya Vidyalaya','KVS PRT TGT PGT']),
  ('NVS Recruitment', 'competitive_exam', 'teaching', array['Navodaya Vidyalaya Samiti']),
  ('DSSSB Teacher', 'competitive_exam', 'teaching', array['DSSSB','Delhi Teacher']),
  ('B.Ed Entrance', 'competitive_exam', 'teaching', array['BEd','Teacher Training']),
  ('D.El.Ed Entrance', 'competitive_exam', 'teaching', array['DElEd','Primary Teacher Training'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- finance & accountancy (8) — qualifications rather than entrance tests,
-- but coached in the same buildings by the same institutes.
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('CA (Chartered Accountancy)', 'competitive_exam', 'finance', array['CA','ICAI','CA Foundation','CA Inter','CA Final']),
  ('CS (Company Secretary)', 'competitive_exam', 'finance', array['CS','ICSI']),
  ('CMA (Cost & Management Accountancy)', 'competitive_exam', 'finance', array['CMA','ICMAI','Cost Accountancy']),
  ('ACCA', 'competitive_exam', 'finance', array['Association of Chartered Certified Accountants']),
  ('CFA', 'competitive_exam', 'finance', array['Chartered Financial Analyst']),
  ('FRM', 'competitive_exam', 'finance', array['Financial Risk Manager']),
  ('US CPA', 'competitive_exam', 'finance', array['CPA','Certified Public Accountant']),
  ('Actuarial Science (IAI)', 'competitive_exam', 'finance', array['Actuary','IAI','Actuarial'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- study abroad (15) — admission tests, English tests, and the licensing
-- exams Indian graduates sit to practise overseas.
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('IELTS', 'competitive_exam', 'study_abroad', array['International English Language Testing System','English Test']),
  ('TOEFL', 'competitive_exam', 'study_abroad', array['Test of English as a Foreign Language']),
  ('PTE', 'competitive_exam', 'study_abroad', array['Pearson Test of English','PTE Academic']),
  ('Duolingo English Test', 'competitive_exam', 'study_abroad', array['DET','Duolingo']),
  ('GRE', 'competitive_exam', 'study_abroad', array['Graduate Record Examination','MS Abroad']),
  ('GMAT', 'competitive_exam', 'study_abroad', array['GMAT Focus Edition','Graduate Management Admission Test']),
  ('SAT', 'competitive_exam', 'study_abroad', array['Digital SAT','College Board']),
  ('ACT', 'competitive_exam', 'study_abroad', array['American College Testing']),
  ('CELPIP', 'competitive_exam', 'study_abroad', array['Canada English Test']),
  ('OET', 'competitive_exam', 'study_abroad', array['Occupational English Test','Nurses English']),
  ('TEF / TCF Canada', 'competitive_exam', 'study_abroad', array['TEF','TCF','French for Canada','PR French']),
  ('USMLE', 'competitive_exam', 'study_abroad', array['US Medical Licensing','Step 1']),
  ('PLAB', 'competitive_exam', 'study_abroad', array['UK Medical Licensing']),
  ('NCLEX', 'competitive_exam', 'study_abroad', array['US Nursing Licensing','Nursing Abroad']),
  ('MCAT', 'competitive_exam', 'study_abroad', array['Medical College Admission Test'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- language proficiency (10). The certification, not the language — a Spoken
-- English or conversational German class belongs in the `subject` group.
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('JLPT', 'competitive_exam', 'language', array['Japanese Language Proficiency Test','Japanese','N5','N4']),
  ('HSK', 'competitive_exam', 'language', array['Chinese Proficiency Test','Mandarin','Chinese']),
  ('TOPIK', 'competitive_exam', 'language', array['Korean Proficiency Test','Korean']),
  ('Goethe-Zertifikat', 'competitive_exam', 'language', array['Goethe','German Exam','German A1','Max Mueller']),
  ('TestDaF', 'competitive_exam', 'language', array['German for University']),
  ('DELF / DALF', 'competitive_exam', 'language', array['DELF','DALF','French Exam','Alliance Francaise']),
  ('DELE', 'competitive_exam', 'language', array['Spanish Exam','Instituto Cervantes']),
  ('SIELE', 'competitive_exam', 'language', array['Spanish Proficiency']),
  ('CILS / CELI', 'competitive_exam', 'language', array['Italian Exam','CILS','CELI']),
  ('TORFL', 'competitive_exam', 'language', array['Russian Exam','Russian Proficiency'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- IT & professional certification (17)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('AWS Certification', 'competitive_exam', 'certification', array['Amazon Web Services','Solutions Architect','Cloud']),
  ('Microsoft Azure Certification', 'competitive_exam', 'certification', array['Azure','AZ-900','Microsoft Cloud']),
  ('Google Cloud Certification', 'competitive_exam', 'certification', array['GCP','Google Cloud']),
  ('CCNA', 'competitive_exam', 'certification', array['Cisco','Networking']),
  ('CompTIA', 'competitive_exam', 'certification', array['A+','Network+','Security+']),
  ('PMP', 'competitive_exam', 'certification', array['Project Management Professional','PMI']),
  ('Lean Six Sigma', 'competitive_exam', 'certification', array['Six Sigma','Green Belt','Black Belt']),
  ('ITIL', 'competitive_exam', 'certification', array['IT Service Management']),
  ('Scrum Master (CSM)', 'competitive_exam', 'certification', array['Agile','Scrum','CSM']),
  ('CISSP', 'competitive_exam', 'certification', array['Information Security','Security Certification']),
  ('CEH', 'competitive_exam', 'certification', array['Ethical Hacking','Cyber Security']),
  ('Data Science Certification', 'competitive_exam', 'certification', array['Machine Learning','Analytics','Python Data Science']),
  ('Digital Marketing Certification', 'competitive_exam', 'certification', array['SEO','Google Ads','Social Media Marketing']),
  ('SAP Certification', 'competitive_exam', 'certification', array['SAP FICO','SAP MM','ERP']),
  ('Tally & GST', 'competitive_exam', 'certification', array['Tally','GST','Accounting Software']),
  ('NIELIT CCC', 'competitive_exam', 'certification', array['CCC','Course on Computer Concepts']),
  ('NIELIT O Level', 'competitive_exam', 'certification', array['O Level','DOEACC'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- aviation, hospitality & maritime (4)
insert into public.service_category_master (name, "group", subgroup, aliases) values
  ('NCHMCT JEE', 'competitive_exam', 'vocational', array['Hotel Management Entrance','NCHM','Hotel Management']),
  ('DGCA CPL', 'competitive_exam', 'vocational', array['Pilot Training','Commercial Pilot Licence','DGCA']),
  ('Cabin Crew Training', 'competitive_exam', 'vocational', array['Air Hostess','Flight Attendant']),
  ('IMU CET', 'competitive_exam', 'vocational', array['Merchant Navy','Indian Maritime University'])
on conflict (name, "group") do update
  set subgroup = excluded.subgroup, aliases = excluded.aliases;

-- ---------------------------------------------------------------------
-- 5. after running, this should show 7 boards and ~200 exams across
--    17 subgroups, with nothing left unfiled:
--
--   select "group", coalesce(subgroup, '(none)') as subgroup, count(*)
--     from public.service_category_master
--    where "group" in ('exam_board', 'competitive_exam')
--    group by 1, 2 order by 1, 2;
-- ---------------------------------------------------------------------
