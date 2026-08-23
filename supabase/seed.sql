-- ============================================================================
-- AGAPE LEGACY DEVELOPMENT DATASET — disposable compatibility only
-- ============================================================================
-- Populates every module with ≥ 10 realistic records spread across the 11 roles
-- and 10 partner barangays in Bocaue, Bulacan. Designed to be:
--
--   • Idempotent  — every INSERT uses ON CONFLICT DO NOTHING. Safe to re-run.
--   • Self-contained — creates auth.users + auth.identities so seeded accounts
--     can log in immediately. Shared dev password: "Agape2026!"
--   • Schema-aligned — column lists match the current migrations (R-1, R-6,
--     finance_officer_role, attendance, sitio_columns, household_profile_extended,
--     program_item_approvals, proposal_community_validation, etc.). Run all
--     verified canonical timestamped migrations first, then run this file only
--     in the isolated legacy-seed compatibility replay.
--
-- Usage:
--   1. Start the isolated disposable Supabase compatibility stack.
--   2. Replay only the verified canonical timestamped migrations.
--   3. Run this file only through the isolated legacy-seed compatibility gate.
--   4. Never treat these rows as release or production data.
--
-- Seeded login emails (all use password "Agape2026!"):
--   admin@agape.dyci.edu.ph                — System Administrator
--   director@paraya.dyci.edu.ph            — PARAYA Director
--   associate@paraya.dyci.edu.ph           — PARAYA Associate
--   researcher@paraya.dyci.edu.ph          — PARAYA Researcher
--   finance@paraya.dyci.edu.ph             — Finance Officer
--   captain.lolomboy@bocaue.gov.ph         — Barangay Captain (Lolomboy)
--   secretary.lolomboy@bocaue.gov.ph       — Barangay Secretary (Lolomboy)
--   motherleader.lolomboy@bocaue.gov.ph    — Mother Leader (Lolomboy)
--   osas@paraya.dyci.edu.ph                — Office (OSAS)
--   csg@paraya.dyci.edu.ph                 — Student Org (CSG)
--   cics@paraya.dyci.edu.ph                — Department (CICS)
--   volunteer.santos@dyci.edu.ph           — Volunteer (CICS, Year 3)
--   volunteer.cruz@dyci.edu.ph             — Volunteer (CCEA, Year 4)
--   volunteer.reyes@dyci.edu.ph            — Volunteer (CBA, Year 2)
-- ============================================================================

-- Extension required for the bcrypt hashing of the shared dev password.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. AUTH USERS (14 accounts)
-- ════════════════════════════════════════════════════════════════════════════
-- All accounts share the dev password "Agape2026!". This block creates both
-- the auth.users row and the matching auth.identities row Supabase requires
-- for email/password login on modern versions.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000001',
   'authenticated', 'authenticated', 'admin@agape.dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Maria Clara Reyes","role":"admin"}'::jsonb,
   NOW() - INTERVAL '8 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000002',
   'authenticated', 'authenticated', 'director@paraya.dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Dr. Jose Rizaldy Bautista","role":"paraya_director"}'::jsonb,
   NOW() - INTERVAL '8 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000003',
   'authenticated', 'authenticated', 'associate@paraya.dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Andrea Lim Hernandez","role":"paraya_associate"}'::jsonb,
   NOW() - INTERVAL '7 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000004',
   'authenticated', 'authenticated', 'researcher@paraya.dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Michelle de Guzman","role":"paraya_researcher"}'::jsonb,
   NOW() - INTERVAL '6 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000005',
   'authenticated', 'authenticated', 'finance@paraya.dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Roberto Mercado Santos","role":"finance_officer"}'::jsonb,
   NOW() - INTERVAL '6 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000006',
   'authenticated', 'authenticated', 'captain.lolomboy@bocaue.gov.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Capt. Ricardo Villanueva","role":"barangay_captain"}'::jsonb,
   NOW() - INTERVAL '5 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000007',
   'authenticated', 'authenticated', 'secretary.lolomboy@bocaue.gov.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Marisol Pangilinan","role":"barangay_secretary"}'::jsonb,
   NOW() - INTERVAL '5 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000008',
   'authenticated', 'authenticated', 'motherleader.lolomboy@bocaue.gov.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Aling Norma Estrella","role":"barangay_mother_leader"}'::jsonb,
   NOW() - INTERVAL '5 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000009',
   'authenticated', 'authenticated', 'osas@paraya.dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"OSAS Coordinator","role":"office","org_name":"OSAS"}'::jsonb,
   NOW() - INTERVAL '4 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000010',
   'authenticated', 'authenticated', 'csg@paraya.dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Central Student Government","role":"student_org","org_name":"CSG"}'::jsonb,
   NOW() - INTERVAL '4 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000011',
   'authenticated', 'authenticated', 'cics@paraya.dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"CICS Department","role":"department","org_name":"CICS"}'::jsonb,
   NOW() - INTERVAL '4 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000012',
   'authenticated', 'authenticated', 'volunteer.santos@dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Juan Miguel Santos","role":"volunteer"}'::jsonb,
   NOW() - INTERVAL '3 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000013',
   'authenticated', 'authenticated', 'volunteer.cruz@dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Patricia Anne Cruz","role":"volunteer"}'::jsonb,
   NOW() - INTERVAL '3 months', NOW(), '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-000000000014',
   'authenticated', 'authenticated', 'volunteer.reyes@dyci.edu.ph',
   crypt('Agape2026!', gen_salt('bf')),
   NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Mark Anthony Reyes","role":"volunteer"}'::jsonb,
   NOW() - INTERVAL '3 months', NOW(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;


-- ── Auth identities (one per user — required for password login) ───────────
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-000000000001', '{"sub":"11111111-1111-1111-1111-000000000001","email":"admin@agape.dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000002', '{"sub":"11111111-1111-1111-1111-000000000002","email":"director@paraya.dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000003', '11111111-1111-1111-1111-000000000003', '{"sub":"11111111-1111-1111-1111-000000000003","email":"associate@paraya.dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000004', '11111111-1111-1111-1111-000000000004', '{"sub":"11111111-1111-1111-1111-000000000004","email":"researcher@paraya.dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000005', '{"sub":"11111111-1111-1111-1111-000000000005","email":"finance@paraya.dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000006', '11111111-1111-1111-1111-000000000006', '{"sub":"11111111-1111-1111-1111-000000000006","email":"captain.lolomboy@bocaue.gov.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000007', '11111111-1111-1111-1111-000000000007', '{"sub":"11111111-1111-1111-1111-000000000007","email":"secretary.lolomboy@bocaue.gov.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000008', '11111111-1111-1111-1111-000000000008', '{"sub":"11111111-1111-1111-1111-000000000008","email":"motherleader.lolomboy@bocaue.gov.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000009', '11111111-1111-1111-1111-000000000009', '{"sub":"11111111-1111-1111-1111-000000000009","email":"osas@paraya.dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000010', '11111111-1111-1111-1111-000000000010', '{"sub":"11111111-1111-1111-1111-000000000010","email":"csg@paraya.dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000011', '11111111-1111-1111-1111-000000000011', '{"sub":"11111111-1111-1111-1111-000000000011","email":"cics@paraya.dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000012', '11111111-1111-1111-1111-000000000012', '{"sub":"11111111-1111-1111-1111-000000000012","email":"volunteer.santos@dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000013', '11111111-1111-1111-1111-000000000013', '{"sub":"11111111-1111-1111-1111-000000000013","email":"volunteer.cruz@dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000014', '11111111-1111-1111-1111-000000000014', '{"sub":"11111111-1111-1111-1111-000000000014","email":"volunteer.reyes@dyci.edu.ph","email_verified":true}'::jsonb, 'email', NOW(), NOW(), NOW())
ON CONFLICT (provider, provider_id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. BARANGAYS (10 partner barangays in Bocaue, Bulacan)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.barangays (
  id, name, municipality, province,
  contact_person, contact_phone, contact_email,
  total_population, total_households, partnership_start,
  latitude, longitude, is_active
) VALUES
  ('22222222-2222-2222-2222-000000000001', 'Antipona',    'Bocaue', 'Bulacan', 'Hon. Eduardo Magsino',    '+639175550101', 'antipona@bocaue.gov.ph',    4520,  1080, '2024-06-15', 14.7991, 120.9421, TRUE),
  ('22222222-2222-2222-2222-000000000002', 'Bagumbayan',  'Bocaue', 'Bulacan', 'Hon. Lilia Marquez',      '+639175550102', 'bagumbayan@bocaue.gov.ph',  7831,  1965, '2024-04-20', 14.7964, 120.9255, TRUE),
  ('22222222-2222-2222-2222-000000000003', 'Bambang',     'Bocaue', 'Bulacan', 'Hon. Rolando Aquino',     '+639175550103', 'bambang@bocaue.gov.ph',     5210,  1245, '2024-08-01', 14.8062, 120.9304, TRUE),
  ('22222222-2222-2222-2222-000000000004', 'Caingin',     'Bocaue', 'Bulacan', 'Hon. Teresita Buenaventura','+639175550104','caingin@bocaue.gov.ph',     3245,   810, '2025-01-10', 14.7805, 120.9385, TRUE),
  ('22222222-2222-2222-2222-000000000005', 'Duhat',       'Bocaue', 'Bulacan', 'Hon. Nestor Domingo',     '+639175550105', 'duhat@bocaue.gov.ph',       6190,  1530, '2024-09-12', 14.8052, 120.9420, TRUE),
  ('22222222-2222-2222-2222-000000000006', 'Igulot',      'Bocaue', 'Bulacan', 'Hon. Cecilia Ramos',      '+639175550106', 'igulot@bocaue.gov.ph',      4720,  1180, '2025-02-05', 14.7889, 120.9510, TRUE),
  ('22222222-2222-2222-2222-000000000007', 'Lolomboy',    'Bocaue', 'Bulacan', 'Capt. Ricardo Villanueva','+639175550107', 'lolomboy@bocaue.gov.ph',    9120,  2310, '2024-03-15', 14.7950, 120.9450, TRUE),
  ('22222222-2222-2222-2222-000000000008', 'Sulucan',     'Bocaue', 'Bulacan', 'Hon. Bayani Gatchalian',  '+639175550108', 'sulucan@bocaue.gov.ph',     3890,   945, '2025-03-20', 14.7842, 120.9305, TRUE),
  ('22222222-2222-2222-2222-000000000009', 'Turo',        'Bocaue', 'Bulacan', 'Hon. Imelda Castro',      '+639175550109', 'turo@bocaue.gov.ph',        5680,  1410, '2024-11-08', 14.7920, 120.9180, TRUE),
  ('22222222-2222-2222-2222-000000000010', 'Wakas',       'Bocaue', 'Bulacan', 'Hon. Ferdinand Roxas',    '+639175550110', 'wakas@bocaue.gov.ph',       4310,  1075, '2025-04-25', 14.7755, 120.9460, TRUE)
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. PUBLIC.USERS (matching the 14 auth.users above)
-- ════════════════════════════════════════════════════════════════════════════

-- Note: dropped the `phone` column from this INSERT because it lives in the
-- optional `user_notification_prefs.sql` migration. If you've run that
-- migration and want phone numbers populated, run the UPDATE block below
-- this INSERT (also commented out by default).
INSERT INTO public.users (id, email, full_name, role, status, is_active, barangay_id, org_name, permissions, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-000000000001', 'admin@agape.dyci.edu.ph',           'Maria Clara Reyes',           'admin',                   'active', TRUE, NULL,                                       NULL,    '{}'::jsonb, NOW() - INTERVAL '8 months', NOW()),
  ('11111111-1111-1111-1111-000000000002', 'director@paraya.dyci.edu.ph',       'Dr. Jose Rizaldy Bautista',   'paraya_director',         'active', TRUE, NULL,                                       NULL,    '{}'::jsonb, NOW() - INTERVAL '8 months', NOW()),
  ('11111111-1111-1111-1111-000000000003', 'associate@paraya.dyci.edu.ph',      'Andrea Lim Hernandez',        'paraya_associate',        'active', TRUE, NULL,                                       NULL,    '{}'::jsonb, NOW() - INTERVAL '7 months', NOW()),
  ('11111111-1111-1111-1111-000000000004', 'researcher@paraya.dyci.edu.ph',     'Michelle de Guzman',          'paraya_researcher',       'active', TRUE, NULL,                                       NULL,    '{}'::jsonb, NOW() - INTERVAL '6 months', NOW()),
  ('11111111-1111-1111-1111-000000000005', 'finance@paraya.dyci.edu.ph',        'Roberto Mercado Santos',      'finance_officer',         'active', TRUE, NULL,                                       NULL,    '{}'::jsonb, NOW() - INTERVAL '6 months', NOW()),
  ('11111111-1111-1111-1111-000000000006', 'captain.lolomboy@bocaue.gov.ph',    'Capt. Ricardo Villanueva',    'barangay_captain',        'active', TRUE, '22222222-2222-2222-2222-000000000007',     NULL,    '{}'::jsonb, NOW() - INTERVAL '5 months', NOW()),
  ('11111111-1111-1111-1111-000000000007', 'secretary.lolomboy@bocaue.gov.ph',  'Marisol Pangilinan',          'barangay_secretary',      'active', TRUE, '22222222-2222-2222-2222-000000000007',     NULL,    '{}'::jsonb, NOW() - INTERVAL '5 months', NOW()),
  ('11111111-1111-1111-1111-000000000008', 'motherleader.lolomboy@bocaue.gov.ph','Aling Norma Estrella',       'barangay_mother_leader',  'active', TRUE, '22222222-2222-2222-2222-000000000007',     NULL,    '{}'::jsonb, NOW() - INTERVAL '5 months', NOW()),
  ('11111111-1111-1111-1111-000000000009', 'osas@paraya.dyci.edu.ph',           'OSAS Coordinator',            'office',                  'active', TRUE, NULL,                                       'OSAS',  '{}'::jsonb, NOW() - INTERVAL '4 months', NOW()),
  ('11111111-1111-1111-1111-000000000010', 'csg@paraya.dyci.edu.ph',            'Central Student Government',  'student_org',             'active', TRUE, NULL,                                       'CSG',   '{}'::jsonb, NOW() - INTERVAL '4 months', NOW()),
  ('11111111-1111-1111-1111-000000000011', 'cics@paraya.dyci.edu.ph',           'CICS Department',             'department',              'active', TRUE, NULL,                                       'CICS',  '{}'::jsonb, NOW() - INTERVAL '4 months', NOW()),
  ('11111111-1111-1111-1111-000000000012', 'volunteer.santos@dyci.edu.ph',      'Juan Miguel Santos',          'volunteer',               'active', TRUE, '22222222-2222-2222-2222-000000000007',     NULL,    '{}'::jsonb, NOW() - INTERVAL '3 months', NOW()),
  ('11111111-1111-1111-1111-000000000013', 'volunteer.cruz@dyci.edu.ph',        'Patricia Anne Cruz',          'volunteer',               'active', TRUE, '22222222-2222-2222-2222-000000000002',     NULL,    '{}'::jsonb, NOW() - INTERVAL '3 months', NOW()),
  ('11111111-1111-1111-1111-000000000014', 'volunteer.reyes@dyci.edu.ph',       'Mark Anthony Reyes',          'volunteer',               'active', TRUE, '22222222-2222-2222-2222-000000000005',     NULL,    '{}'::jsonb, NOW() - INTERVAL '3 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- Optional: populate phone numbers if you've run user_notification_prefs.sql.
-- Uncomment the block below to add Filipino-format phone numbers to the
-- seeded users. Safe to run multiple times — UPDATE just overwrites.
--
-- UPDATE public.users SET phone = '+639175551001' WHERE id = '11111111-1111-1111-1111-000000000001';
-- UPDATE public.users SET phone = '+639175551002' WHERE id = '11111111-1111-1111-1111-000000000002';
-- UPDATE public.users SET phone = '+639175551003' WHERE id = '11111111-1111-1111-1111-000000000003';
-- UPDATE public.users SET phone = '+639175551004' WHERE id = '11111111-1111-1111-1111-000000000004';
-- UPDATE public.users SET phone = '+639175551005' WHERE id = '11111111-1111-1111-1111-000000000005';
-- UPDATE public.users SET phone = '+639175551006' WHERE id = '11111111-1111-1111-1111-000000000006';
-- UPDATE public.users SET phone = '+639175551007' WHERE id = '11111111-1111-1111-1111-000000000007';
-- UPDATE public.users SET phone = '+639175551008' WHERE id = '11111111-1111-1111-1111-000000000008';
-- UPDATE public.users SET phone = '+639175551009' WHERE id = '11111111-1111-1111-1111-000000000009';
-- UPDATE public.users SET phone = '+639175551010' WHERE id = '11111111-1111-1111-1111-000000000010';
-- UPDATE public.users SET phone = '+639175551011' WHERE id = '11111111-1111-1111-1111-000000000011';
-- UPDATE public.users SET phone = '+639175551012' WHERE id = '11111111-1111-1111-1111-000000000012';
-- UPDATE public.users SET phone = '+639175551013' WHERE id = '11111111-1111-1111-1111-000000000013';
-- UPDATE public.users SET phone = '+639175551014' WHERE id = '11111111-1111-1111-1111-000000000014';


-- ════════════════════════════════════════════════════════════════════════════
-- 4. VOLUNTEERS (10 — extends the 3 volunteer users + 7 more profile-only)
-- ════════════════════════════════════════════════════════════════════════════
-- The 3 logging-volunteers above + 7 more matching the volunteer accounts so
-- analytics has enough variety. Each volunteer row references a user_id.

INSERT INTO public.volunteers (id, user_id, student_id, department, year_level, total_hours, consented_to_photo_use, created_at, updated_at)
VALUES
  ('22220001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-000000000012', '2022-1-00345',  'CICS',  3, 48,  TRUE,  NOW() - INTERVAL '3 months', NOW()),
  ('22220001-0000-0000-0000-000000000002', '11111111-1111-1111-1111-000000000013', '2021-1-01102',  'CCEA',  4, 76,  TRUE,  NOW() - INTERVAL '3 months', NOW()),
  ('22220001-0000-0000-0000-000000000003', '11111111-1111-1111-1111-000000000014', '2023-1-00871',  'CBA',   2, 22,  FALSE, NOW() - INTERVAL '3 months', NOW()),
  -- Profile-only volunteers (no auth login — they exist in the volunteers
  -- table for analytics + signup variety only). user_id intentionally left
  -- NULL so we don't tie them to non-existent auth users.
  ('22220001-0000-0000-0000-000000000004', NULL,                                   '2022-1-00501',  'CICS',  3, 36,  TRUE,  NOW() - INTERVAL '4 months', NOW()),
  ('22220001-0000-0000-0000-000000000005', NULL,                                   '2022-1-00712',  'CAS',   3, 12,  TRUE,  NOW() - INTERVAL '4 months', NOW()),
  ('22220001-0000-0000-0000-000000000006', NULL,                                   '2021-1-01540',  'CCEA',  4, 92,  TRUE,  NOW() - INTERVAL '5 months', NOW()),
  ('22220001-0000-0000-0000-000000000007', NULL,                                   '2023-1-00088',  'CBA',   2, 16,  TRUE,  NOW() - INTERVAL '4 months', NOW()),
  ('22220001-0000-0000-0000-000000000008', NULL,                                   '2022-1-00264',  'CICS',  3, 54,  TRUE,  NOW() - INTERVAL '5 months', NOW()),
  ('22220001-0000-0000-0000-000000000009', NULL,                                   '2024-1-00012',  'CON',   1, 8,   FALSE, NOW() - INTERVAL '2 months', NOW()),
  ('22220001-0000-0000-0000-000000000010', NULL,                                   '2022-1-00903',  'CCEA',  3, 64,  TRUE,  NOW() - INTERVAL '5 months', NOW())
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. PARTNERSHIP HISTORY (10 events across the 10 barangays)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.partnership_history (id, barangay_id, officer_id, event_type, notes, date, created_at)
VALUES
  ('22220002-0000-0000-0000-000000000001', '22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-000000000002', 'Partnership Started',  'Initial MOA signing with Barangay Antipona for academic year 2024–2025.',                           '2024-06-15', NOW() - INTERVAL '11 months'),
  ('22220002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-000000000002', '11111111-1111-1111-1111-000000000002', 'Partnership Started',  'Bagumbayan formally partnered after community profiling visit.',                                    '2024-04-20', NOW() - INTERVAL '13 months'),
  ('22220002-0000-0000-0000-000000000003', '22222222-2222-2222-2222-000000000003', '11111111-1111-1111-1111-000000000003', 'Partnership Started',  'Bambang council approved partnership during regular session.',                                      '2024-08-01', NOW() - INTERVAL '9 months'),
  ('22220002-0000-0000-0000-000000000004', '22222222-2222-2222-2222-000000000007', '11111111-1111-1111-1111-000000000002', 'Partnership Started',  'Lolomboy designated as pilot barangay for the AGAPE system rollout.',                                '2024-03-15', NOW() - INTERVAL '14 months'),
  ('22220002-0000-0000-0000-000000000005', '22222222-2222-2222-2222-000000000007', '11111111-1111-1111-1111-000000000003', 'Site Visit',           'Quarterly courtesy call with Captain Villanueva — discussed Sitio Malusak flooding mitigation.',     '2025-01-12', NOW() - INTERVAL '4 months'),
  ('22220002-0000-0000-0000-000000000006', '22222222-2222-2222-2222-000000000005', '11111111-1111-1111-1111-000000000003', 'MOA Renewed',          'Duhat partnership renewed for AY 2025–2026 with expanded scope on livelihood training.',             '2025-03-01', NOW() - INTERVAL '2 months'),
  ('22220002-0000-0000-0000-000000000007', '22222222-2222-2222-2222-000000000006', '11111111-1111-1111-1111-000000000004', 'Community Profiling',  'Household profiling completed for Sitio San Roque (Igulot) — 42 households surveyed.',                '2025-02-18', NOW() - INTERVAL '3 months'),
  ('22220002-0000-0000-0000-000000000008', '22222222-2222-2222-2222-000000000004', '11111111-1111-1111-1111-000000000004', 'Needs Assessment',     'Caingin baseline needs assessment finalized — flood preparedness identified as top priority.',       '2025-02-28', NOW() - INTERVAL '3 months'),
  ('22220002-0000-0000-0000-000000000009', '22222222-2222-2222-2222-000000000009', '11111111-1111-1111-1111-000000000002', 'Program Launch',       'Launched Brigada Eskwela drive in Turo Elementary School — 120 volunteers fielded.',                 '2025-04-10', NOW() - INTERVAL '6 weeks'),
  ('22220002-0000-0000-0000-000000000010', '22222222-2222-2222-2222-000000000010', '11111111-1111-1111-1111-000000000003', 'Partnership Started',  'Wakas formally onboarded as the 10th partner barangay during a brief signing ceremony.',             '2025-04-25', NOW() - INTERVAL '4 weeks')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. PROJECT PROPOSALS (10 — mix of statuses, submitters, and SDG focus)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.project_proposals (
  id, title, rationale, objectives, target_beneficiaries, expected_beneficiary_count,
  barangay_id, start_date, end_date, budget, status, created_by, reviewed_by,
  is_income_generating, finance_clearance, finance_cleared_at, finance_cleared_by, finance_notes,
  prescreening_passed, prescreening_ran_at,
  community_validated, community_validation_notes, community_validated_at, community_validated_by,
  created_at, updated_at
) VALUES
  ('33333333-3333-3333-3333-000000000001',
   'Lolomboy Literacy Camp 2025',
   'Recent community needs assessment shows that 28% of out-of-school youth (ages 10–15) in Sitio Malusak read below grade level. Without intervention this cohort risks dropping out permanently.',
   'Conduct a 6-week literacy bootcamp delivering remedial reading sessions twice weekly to 80 OSY participants. Pair each participant with a CICS / CCEA student tutor.',
   'Out-of-school youth ages 10–15 in Sitio Malusak, Lolomboy',
   80,
   '22222222-2222-2222-2222-000000000007',
   '2025-06-01', '2025-07-15', 75000.00,
   'approved',
   '11111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000002',
   FALSE, TRUE, NOW() - INTERVAL '3 weeks', '11111111-1111-1111-1111-000000000005',
   'Budget aligns with PARAYA allocation. Cleared for implementation.',
   TRUE, NOW() - INTERVAL '4 weeks',
   TRUE, 'Consultation with Captain Villanueva and parent representatives held 2025-04-22.', NOW() - INTERVAL '4 weeks', '11111111-1111-1111-1111-000000000002',
   NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '3 weeks'),

  ('33333333-3333-3333-3333-000000000002',
   'Bagumbayan Backyard Vegetable Garden',
   'Bagumbayan barangay survey (Feb 2025) flagged food insecurity as the top economic concern — 41% of households report skipping at least one meal per week.',
   'Establish 50 backyard container gardens; conduct 4 training sessions on urban gardening; distribute starter seed kits.',
   'Households in Bagumbayan classified as low-income or below-poverty bracket',
   50,
   '22222222-2222-2222-2222-000000000002',
   '2025-07-01', '2025-09-30', 42000.00,
   'finance_review',
   '11111111-1111-1111-1111-000000000003', NULL,
   FALSE, FALSE, NULL, NULL, NULL,
   TRUE, NOW() - INTERVAL '10 days',
   TRUE, 'Validated with the Bagumbayan Women''s Cooperative.', NOW() - INTERVAL '12 days', '11111111-1111-1111-1111-000000000003',
   NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '10 days'),

  ('33333333-3333-3333-3333-000000000003',
   'CICS-led Digital Skills Workshop for Duhat Senior Citizens',
   'Duhat has the highest concentration of senior citizens among partner barangays (12% of population). Outreach interviews surfaced strong interest in basic smartphone and GCash literacy.',
   '6-week Saturday workshop covering: smartphone basics, GCash, video calls with family, online safety. 30 senior participants.',
   'Senior citizens (60+) registered with Duhat Senior Citizens Affairs Office',
   30,
   '22222222-2222-2222-2222-000000000005',
   '2025-08-15', '2025-09-26', 28500.00,
   'sdg_review',
   '11111111-1111-1111-1111-000000000011', NULL,
   FALSE, FALSE, NULL, NULL, NULL,
   TRUE, NOW() - INTERVAL '5 days',
   TRUE, 'Endorsed by Duhat OSCA chairperson during the May 8 community meeting.', NOW() - INTERVAL '6 days', '11111111-1111-1111-1111-000000000011',
   NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '5 days'),

  ('33333333-3333-3333-3333-000000000004',
   'Turo Brigada Eskwela 2025',
   'Annual back-to-school facility prep for Turo Elementary School. The school principal''s formal request enumerates 14 classrooms needing repainting, repair of broken windows, and deep cleaning before the June opening.',
   'Mobilize 120 student volunteers across 3 weekends to repaint classrooms, repair windows, and conduct deep cleaning. Distribute 200 school supply kits to identified scholar-recipients.',
   'Pupils of Turo Elementary School (Grades 1–6)',
   850,
   '22222222-2222-2222-2222-000000000009',
   '2025-05-10', '2025-05-31', 95000.00,
   'approved',
   '11111111-1111-1111-1111-000000000010', '11111111-1111-1111-1111-000000000002',
   FALSE, TRUE, NOW() - INTERVAL '6 weeks', '11111111-1111-1111-1111-000000000005',
   'Liquidation documentation complete for materials procurement.',
   TRUE, NOW() - INTERVAL '8 weeks',
   TRUE, 'School Principal Mrs. Lourdes Bautista and the PTA approved the activity plan.', NOW() - INTERVAL '8 weeks', '11111111-1111-1111-1111-000000000010',
   NOW() - INTERVAL '10 weeks', NOW() - INTERVAL '6 weeks'),

  ('33333333-3333-3333-3333-000000000005',
   'Antipona Maternal Health Symposium',
   'Antipona midwife reports a marked rise in adolescent pregnancies (ages 15–19) — 14 cases in the past 12 months versus 6 the prior year.',
   '2-day symposium on reproductive health, nutrition during pregnancy, and parenting fundamentals. Bring in 3 RNs from CON as resource speakers.',
   'Women of reproductive age (15–45) and adolescent girls (12–18) in Antipona',
   120,
   '22222222-2222-2222-2222-000000000001',
   '2025-09-12', '2025-09-13', 36500.00,
   'pre_screening',
   '11111111-1111-1111-1111-000000000004', NULL,
   FALSE, FALSE, NULL, NULL, NULL,
   NULL, NULL,
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),

  ('33333333-3333-3333-3333-000000000006',
   'Caingin Flood-Ready Households Drive',
   'Caingin is the most flood-prone of the 10 partner barangays. Sitio Pulo (closest to the Bocaue River) experiences knee-deep flooding 4+ times per rainy season.',
   'Pre-position emergency supplies in 100 households; conduct disaster preparedness drills; distribute waterproof document holders and emergency contact cards.',
   '100 high-risk households along the Bocaue River bank in Caingin',
   100,
   '22222222-2222-2222-2222-000000000004',
   '2025-06-15', '2025-07-30', 88000.00,
   'submitted',
   '11111111-1111-1111-1111-000000000009', NULL,
   FALSE, FALSE, NULL, NULL, NULL,
   NULL, NULL,
   TRUE, 'Sitio Pulo community meeting on 2025-05-04. 38 households attended.', NOW() - INTERVAL '15 days', '11111111-1111-1111-1111-000000000004',
   NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),

  ('33333333-3333-3333-3333-000000000007',
   'Sulucan Livelihood: Soap-Making Cooperative',
   'Sulucan women''s group has informally produced and sold homemade soaps for two years. A formalized cooperative + training would raise income and scale production. This proposal is income-generating, so finance scrutiny is heightened.',
   'Form a registered 25-member women''s cooperative. Train members in soap-making, basic bookkeeping, and product packaging. Provide initial capital for raw materials.',
   '25 women from Sulucan signed up for the women''s cooperative',
   25,
   '22222222-2222-2222-2222-000000000008',
   '2025-08-01', '2025-12-15', 65000.00,
   'finance_review',
   '11111111-1111-1111-1111-000000000003', NULL,
   TRUE, FALSE, NULL, NULL, NULL,
   TRUE, NOW() - INTERVAL '7 days',
   TRUE, 'Sulucan Women''s Group leadership co-drafted the activity plan.', NOW() - INTERVAL '8 days', '11111111-1111-1111-1111-000000000003',
   NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '7 days'),

  ('33333333-3333-3333-3333-000000000008',
   'Igulot Solid Waste Segregation Campaign',
   'Igulot lacks formal segregation enforcement. Spot checks during the Feb 2025 visit found 7 of 10 households mixing biodegradable + non-bio waste at curb.',
   'Door-to-door IEC campaign reaching 600 households. Install 12 color-coded community bins. Train 20 barangay tanod as enforcement partners.',
   '600 households across the 4 sitios of Igulot',
   2400,
   '22222222-2222-2222-2222-000000000006',
   '2025-10-01', '2025-11-30', 52000.00,
   'draft',
   '11111111-1111-1111-1111-000000000003', NULL,
   FALSE, FALSE, NULL, NULL, NULL,
   NULL, NULL,
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),

  ('33333333-3333-3333-3333-000000000009',
   'Wakas School Supplies Drive 2025',
   'Wakas Elementary reported 65 grade 1 enrollees from indigent households who lack school supplies. A focused drive can ensure all first-day learners arrive equipped.',
   'Collect supplies via on-campus drop boxes. Pack 65 supply kits (notebooks, pencils, ruler, sharpener, eraser, crayons). Distribute during Brigada Eskwela.',
   '65 incoming Grade 1 pupils of Wakas Elementary identified by class advisers',
   65,
   '22222222-2222-2222-2222-000000000010',
   '2025-05-20', '2025-06-08', 18500.00,
   'approved',
   '11111111-1111-1111-1111-000000000010', '11111111-1111-1111-1111-000000000003',
   FALSE, TRUE, NOW() - INTERVAL '2 weeks', '11111111-1111-1111-1111-000000000005',
   'Below the income-generating threshold. Cleared.',
   TRUE, NOW() - INTERVAL '3 weeks',
   TRUE, 'Coordinated with Wakas Elementary teaching staff during May 1 conference.', NOW() - INTERVAL '3 weeks', '11111111-1111-1111-1111-000000000010',
   NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '2 weeks'),

  ('33333333-3333-3333-3333-000000000010',
   'Bambang Youth Sports Clinic',
   'Bambang youth lack structured physical activity opportunities. A 4-Saturday basketball + volleyball clinic can engage 60 youth and identify potential varsity recruits for the upcoming DYCI scholarship program.',
   'Run weekly clinics with rotating coaches from DYCI Athletics. End with a fun tournament. Issue completion certificates.',
   '60 youth ages 11–17 in Bambang',
   60,
   '22222222-2222-2222-2222-000000000003',
   '2025-09-06', '2025-09-27', 24500.00,
   'rejected',
   '11111111-1111-1111-1111-000000000010', '11111111-1111-1111-1111-000000000002',
   FALSE, FALSE, NULL, NULL, NULL,
   FALSE, NOW() - INTERVAL '12 days',
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '12 days')
ON CONFLICT (id) DO NOTHING;


-- ── Proposal → SDG alignment (10 rows, one per proposal — at least) ────────
INSERT INTO public.proposal_sdg_alignment (id, proposal_id, sdg_number, indicator)
VALUES
  ('33330001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-000000000001',  4, '4.6.1 — Proportion of population achieving functional literacy'),
  ('33330001-0000-0000-0000-000000000002', '33333333-3333-3333-3333-000000000002', 11, '11.1.1 — Proportion of population with adequate household-level food security'),
  ('33330001-0000-0000-0000-000000000003', '33333333-3333-3333-3333-000000000003',  9, '9.c.1 — Proportion of population covered by mobile network and digital skills'),
  ('33330001-0000-0000-0000-000000000004', '33333333-3333-3333-3333-000000000004',  4, '4.a.1 — Proportion of schools with basic facilities and services'),
  ('33330001-0000-0000-0000-000000000005', '33333333-3333-3333-3333-000000000005', 17, '17.17.1 — Cross-sector partnerships supporting health outcomes'),
  ('33330001-0000-0000-0000-000000000006', '33333333-3333-3333-3333-000000000006', 11, '11.5.1 — Direct disaster economic loss reduction'),
  ('33330001-0000-0000-0000-000000000007', '33333333-3333-3333-3333-000000000007', 11, '11.b.2 — Proportion of communities with formalized livelihood structures'),
  ('33330001-0000-0000-0000-000000000008', '33333333-3333-3333-3333-000000000008', 11, '11.6.1 — Proportion of urban solid waste regularly collected and managed'),
  ('33330001-0000-0000-0000-000000000009', '33333333-3333-3333-3333-000000000009',  4, '4.1.1 — Proportion of children meeting minimum proficiency at school entry'),
  ('33330001-0000-0000-0000-000000000010', '33333333-3333-3333-3333-000000000010', 17, '17.17.1 — Cross-sector partnerships (youth development)')
ON CONFLICT (id) DO NOTHING;


-- ── Proposal reviews (10 — span pre-screening, SDG, finance, approval) ─────
INSERT INTO public.proposal_reviews (id, proposal_id, reviewer_id, stage, decision, comments, reviewed_at)
VALUES
  ('33330002-0000-0000-0000-000000000001', '33333333-3333-3333-3333-000000000001', '11111111-1111-1111-1111-000000000004', 'pre_screening',   'approved',        'Pre-screening passes — all 7 checks satisfied including mission keyword match and Community Validation attestation.',   NOW() - INTERVAL '4 weeks'),
  ('33330002-0000-0000-0000-000000000002', '33333333-3333-3333-3333-000000000001', '11111111-1111-1111-1111-000000000002', 'sdg_review',      'approved',        'SDG 4 alignment is well-articulated. Tutor-to-learner ratio realistic.',                                                  NOW() - INTERVAL '3 weeks 5 days'),
  ('33330002-0000-0000-0000-000000000003', '33333333-3333-3333-3333-000000000001', '11111111-1111-1111-1111-000000000005', 'finance_review',  'approved',        'Budget breakdown clear. Honoraria reasonable per DYCI rate guide.',                                                       NOW() - INTERVAL '3 weeks'),
  ('33330002-0000-0000-0000-000000000004', '33333333-3333-3333-3333-000000000004', '11111111-1111-1111-1111-000000000004', 'pre_screening',   'approved',        'Brigada Eskwela is recurring — alignment confirmed.',                                                                     NOW() - INTERVAL '8 weeks'),
  ('33330002-0000-0000-0000-000000000005', '33333333-3333-3333-3333-000000000004', '11111111-1111-1111-1111-000000000005', 'finance_review',  'approved',        'Materials list and supplier quotations attached. Cleared.',                                                                NOW() - INTERVAL '6 weeks'),
  ('33330002-0000-0000-0000-000000000006', '33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-000000000004', 'pre_screening',   'approved',        'Food security needs match. Awaiting Finance review.',                                                                      NOW() - INTERVAL '12 days'),
  ('33330002-0000-0000-0000-000000000007', '33333333-3333-3333-3333-000000000007', '11111111-1111-1111-1111-000000000004', 'pre_screening',   'approved',        'Income-generating — flagged for closer Finance review. Community attestation logged.',                                     NOW() - INTERVAL '8 days'),
  ('33330002-0000-0000-0000-000000000008', '33333333-3333-3333-3333-000000000003', '11111111-1111-1111-1111-000000000004', 'pre_screening',   'approved',        'Senior digital literacy fits SDG 9.c.1.',                                                                                  NOW() - INTERVAL '7 days'),
  ('33330002-0000-0000-0000-000000000009', '33333333-3333-3333-3333-000000000010', '11111111-1111-1111-1111-000000000004', 'pre_screening',   'rejected',        'Resubmit with stronger needs-assessment data — youth sports is welcome but the rationale lacks quantitative grounding.',  NOW() - INTERVAL '12 days'),
  ('33330002-0000-0000-0000-000000000010', '33333333-3333-3333-3333-000000000009', '11111111-1111-1111-1111-000000000005', 'finance_review',  'approved',        'Small drive, expenses transparent. Cleared.',                                                                              NOW() - INTERVAL '2 weeks')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. PROGRAMS (10 — born from approved proposals + a few standalone)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.programs (id, proposal_id, title, description, barangay_id, start_date, end_date, status, budget_allocated, budget_spent, created_by, created_at, updated_at)
VALUES
  ('44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', 'Lolomboy Literacy Camp 2025',                  'Twice-weekly remedial reading sessions for OSY in Sitio Malusak.',                                       '22222222-2222-2222-2222-000000000007', '2025-06-01', '2025-07-15', 'planning',  75000.00, 0.00,     '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '3 weeks', NOW()),
  ('44444444-4444-4444-4444-000000000002', '33333333-3333-3333-3333-000000000004', 'Turo Brigada Eskwela 2025',                    'Repainting, deep cleaning, and supply kit distribution at Turo Elementary.',                              '22222222-2222-2222-2222-000000000009', '2025-05-10', '2025-05-31', 'completed', 95000.00, 91420.00, '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '8 weeks', NOW() - INTERVAL '3 days'),
  ('44444444-4444-4444-4444-000000000003', '33333333-3333-3333-3333-000000000009', 'Wakas School Supplies Drive 2025',             'Collection + packing + distribution of 65 supply kits for Grade 1 indigents.',                            '22222222-2222-2222-2222-000000000010', '2025-05-20', '2025-06-08', 'active',    18500.00, 12180.00, '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '5 weeks', NOW()),
  ('44444444-4444-4444-4444-000000000004', NULL,                                   'Bagumbayan Community Health Fair',             'Quarterly free clinic in coordination with Bagumbayan RHU.',                                              '22222222-2222-2222-2222-000000000002', '2025-04-15', '2025-04-15', 'completed', 22000.00, 21450.00, '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '3 weeks'),
  ('44444444-4444-4444-4444-000000000005', NULL,                                   'Bambang Tree-Planting Day',                    'Earth Day reforestation along Bocaue riverbank.',                                                          '22222222-2222-2222-2222-000000000003', '2025-04-22', '2025-04-22', 'completed', 8500.00,  8240.00,  '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '4 weeks'),
  ('44444444-4444-4444-4444-000000000006', NULL,                                   'Antipona Youth Mental Health Conversations',   'Series of three Friday-afternoon group dialogues for youth ages 14–18.',                                  '22222222-2222-2222-2222-000000000001', '2025-03-07', '2025-03-21', 'completed', 14500.00, 14100.00, '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '12 weeks', NOW() - INTERVAL '8 weeks'),
  ('44444444-4444-4444-4444-000000000007', NULL,                                   'Caingin Flood Watch Pilot',                    'Pre-positioning of basic emergency supplies in 25 high-risk households (pilot scope).',                   '22222222-2222-2222-2222-000000000004', '2025-05-01', '2025-06-30', 'active',    35000.00, 14200.00, '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks', NOW()),
  ('44444444-4444-4444-4444-000000000008', NULL,                                   'Duhat Senior Welfare Visit',                   'Home visits + grocery packs for 30 senior citizens.',                                                      '22222222-2222-2222-2222-000000000005', '2025-04-05', '2025-04-12', 'completed', 19000.00, 18650.00, '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '7 weeks', NOW() - INTERVAL '5 weeks'),
  ('44444444-4444-4444-4444-000000000009', NULL,                                   'Igulot Junk-to-Funds Workshop',                'How-to workshop on transforming household scrap into income (with materials demo).',                       '22222222-2222-2222-2222-000000000006', '2025-05-17', '2025-05-17', 'completed', 6500.00,  6210.00,  '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '2 weeks'),
  ('44444444-4444-4444-4444-000000000010', NULL,                                   'Sulucan Pre-Coop Orientation',                 'Orientation for the soon-to-be soap-making cooperative members.',                                          '22222222-2222-2222-2222-000000000008', '2025-06-14', '2025-06-14', 'planning',  4500.00,  0.00,     '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '1 week',  NOW())
ON CONFLICT (id) DO NOTHING;


-- ── Program Activities (10 across programs) ────────────────────────────────
INSERT INTO public.program_activities (id, program_id, title, description, date, location, volunteer_count, beneficiary_count, status, approval_status, approved_by, approved_at, attendance_otp, attendance_otp_expires_at, attendance_otp_issued_at, attendance_otp_issued_by, report_1, report_2, created_by, created_at, updated_at)
VALUES
  ('45454545-4545-4545-4545-000000000001', '44444444-4444-4444-4444-000000000002', 'Brigada Eskwela — Repainting Day 1',         'Repaint 5 classrooms (Grade 1 wing).',                          '2025-05-10', 'Turo Elementary School',           42, 0,   'completed', 'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks', NULL,     NULL, NULL, NULL, 'Activity proceeded smoothly. 5 classrooms repainted on schedule.',     'Paint and brushes procured at PHP 18,420; supplier OR# 4421 on file.', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '4 weeks'),
  ('45454545-4545-4545-4545-000000000002', '44444444-4444-4444-4444-000000000002', 'Brigada Eskwela — Window Repair Day',        'Replace broken windows in 8 classrooms.',                       '2025-05-17', 'Turo Elementary School',           35, 0,   'completed', 'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '3 weeks', NULL,     NULL, NULL, NULL, 'All 8 windows repaired. 2 carpenters volunteered.',                       'Glass + frames PHP 12,800; OR# 4503.',                                  '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '3 weeks'),
  ('45454545-4545-4545-4545-000000000003', '44444444-4444-4444-4444-000000000002', 'Brigada Eskwela — Supply Kit Distribution',  'Distribute 200 school supply kits to scholar-recipients.',      '2025-05-24', 'Turo Elementary Gymnasium',        28, 200, 'completed', 'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '2 weeks', NULL,     NULL, NULL, NULL, 'All 200 kits distributed. Parents present.',                              'Supplies bulk-purchase PHP 42,200; itemized list attached.',            '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '2 weeks'),
  ('45454545-4545-4545-4545-000000000004', '44444444-4444-4444-4444-000000000003', 'Wakas Supplies — Drop-Off Box Setup',        'Install 4 drop-off boxes around the DYCI campus.',              '2025-05-22', 'DYCI Main Lobby',                  6,  0,   'completed', 'approved', '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '11 days',  NULL,     NULL, NULL, NULL, 'Boxes installed by lunch.',                                                'Box materials PHP 1,800; no liquidation needed.',                       '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '12 days',  NOW() - INTERVAL '11 days'),
  ('45454545-4545-4545-4545-000000000005', '44444444-4444-4444-4444-000000000003', 'Wakas Supplies — Kit Packing',               'Pack 65 kits using donated supplies.',                          '2025-06-01', 'CICS Computer Lab',                12, 0,   'ongoing',   'approved', '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '3 days',   '4F2K9X', NOW() + INTERVAL '2 hours', NOW() - INTERVAL '1 hour',  '11111111-1111-1111-1111-000000000003', NULL,                                                                NULL,                                                                    '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '4 days',   NOW()),
  ('45454545-4545-4545-4545-000000000006', '44444444-4444-4444-4444-000000000004', 'Bagumbayan Health Fair — Free Clinic Day',   'Free check-ups by 4 RNs + 2 doctors. BP, glucose, GenMed.',     '2025-04-15', 'Bagumbayan Brgy Hall Covered Court', 18, 215, 'completed', 'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '6 weeks', NULL,     NULL, NULL, NULL, '215 patients served. 28 referrals to Bocaue District Hospital.',          'Medicines + supplies PHP 21,450; itemized.',                            '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '7 weeks', NOW() - INTERVAL '6 weeks'),
  ('45454545-4545-4545-4545-000000000007', '44444444-4444-4444-4444-000000000005', 'Bambang Tree-Planting',                      'Plant 200 narra + bamboo seedlings along riverbank.',           '2025-04-22', 'Bambang Riverbank',                55, 0,   'completed', 'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '5 weeks', NULL,     NULL, NULL, NULL, '210 seedlings planted (slight overshoot). DENR rep present.',             'Seedlings PHP 6,800; tools rental PHP 1,440.',                          '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '5 weeks'),
  ('45454545-4545-4545-4545-000000000008', '44444444-4444-4444-4444-000000000007', 'Caingin — Emergency Kit Pre-positioning',    'Deliver bug-out bags to 25 high-risk households.',              '2025-05-15', 'Sitio Pulo, Caingin',              14, 25,  'completed', 'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '2 weeks', NULL,     NULL, NULL, NULL, '25 households received kits + safety briefing. Family heads signed acknowledgment forms.', 'Bag contents PHP 14,200; itemized invoice attached.',                   '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '2 weeks'),
  ('45454545-4545-4545-4545-000000000009', '44444444-4444-4444-4444-000000000008', 'Duhat — Senior Welfare Home Visits',         'Home visits + grocery packs for 30 senior citizens.',           '2025-04-12', 'Duhat (scattered)',                10, 30,  'completed', 'approved', '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '5 weeks', NULL,     NULL, NULL, NULL, 'All 30 packs delivered. 4 referrals to PARAYA medical follow-up.',         'Grocery packs PHP 18,650; OSCA Duhat acknowledgment form attached.',     '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '5 weeks'),
  ('45454545-4545-4545-4545-000000000010', '44444444-4444-4444-4444-000000000001', 'Lolomboy Literacy — Session 1',              'Opening session — diagnostic reading assessment + ice-breakers.','2025-06-07', 'Sitio Malusak Covered Court',      0,  80,  'planned',   'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '1 week', '7Q8N2P', NOW() + INTERVAL '1 day', NOW() - INTERVAL '2 days', '11111111-1111-1111-1111-000000000002', NULL,                                                                NULL,                                                                    '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;


-- ── Program Budgets (10 line items across programs) ────────────────────────
INSERT INTO public.program_budgets (id, program_id, category, allocated, spent, notes, approval_status, created_by)
VALUES
  ('46464646-4646-4646-4646-000000000001', '44444444-4444-4444-4444-000000000001', 'Materials',       42000.00,  0.00,     'Reading workbooks, manipulatives, printing.',           'approved', '11111111-1111-1111-1111-000000000002'),
  ('46464646-4646-4646-4646-000000000002', '44444444-4444-4444-4444-000000000001', 'Honoraria',       18000.00,  0.00,     'Stipends for 8 CICS/CCEA tutors.',                       'approved', '11111111-1111-1111-1111-000000000002'),
  ('46464646-4646-4646-4646-000000000003', '44444444-4444-4444-4444-000000000001', 'Transportation',  9000.00,   0.00,     'Tutor mobilization (jeepney + tricycle).',               'approved', '11111111-1111-1111-1111-000000000002'),
  ('46464646-4646-4646-4646-000000000004', '44444444-4444-4444-4444-000000000002', 'Supplies',        62800.00,  61420.00, 'Paint, brushes, glass, frames, cleaning.',               'approved', '11111111-1111-1111-1111-000000000002'),
  ('46464646-4646-4646-4646-000000000005', '44444444-4444-4444-4444-000000000002', 'Supply Kits',     32200.00,  30000.00, '200 supply kits bulk procurement.',                       'approved', '11111111-1111-1111-1111-000000000003'),
  ('46464646-4646-4646-4646-000000000006', '44444444-4444-4444-4444-000000000003', 'Supplies',        18500.00,  12180.00, 'Notebooks, pencils, crayons, etc. for 65 kits.',          'approved', '11111111-1111-1111-1111-000000000003'),
  ('46464646-4646-4646-4646-000000000007', '44444444-4444-4444-4444-000000000004', 'Medicines',       12000.00,  11500.00, 'Common GenMed drugs, vitamins, BP supplies.',             'approved', '11111111-1111-1111-1111-000000000003'),
  ('46464646-4646-4646-4646-000000000008', '44444444-4444-4444-4444-000000000004', 'Honoraria',       10000.00,  9950.00,  'Doctor + RN stipends.',                                   'approved', '11111111-1111-1111-1111-000000000003'),
  ('46464646-4646-4646-4646-000000000009', '44444444-4444-4444-4444-000000000007', 'Emergency Bags',  25000.00,  14200.00, 'Bug-out bag contents for 100 households (pilot 25 done).','approved', '11111111-1111-1111-1111-000000000002'),
  ('46464646-4646-4646-4646-000000000010', '44444444-4444-4444-4444-000000000010', 'Materials',       3000.00,   0.00,     'Orientation handouts + meals.',                            'pending',  '11111111-1111-1111-1111-000000000009')
ON CONFLICT (id) DO NOTHING;


-- ── Program Signups (10 across volunteers + programs) ──────────────────────
INSERT INTO public.program_signups (id, volunteer_id, program_id, status, approval_status, signed_up_at, confirmed_at)
VALUES
  ('47474747-4747-4747-4747-000000000001', '11111111-1111-1111-1111-000000000012', '44444444-4444-4444-4444-000000000001', 'confirmed', 'approved', NOW() - INTERVAL '2 weeks',  NOW() - INTERVAL '12 days'),
  ('47474747-4747-4747-4747-000000000002', '11111111-1111-1111-1111-000000000013', '44444444-4444-4444-4444-000000000001', 'confirmed', 'approved', NOW() - INTERVAL '2 weeks',  NOW() - INTERVAL '12 days'),
  ('47474747-4747-4747-4747-000000000003', '11111111-1111-1111-1111-000000000014', '44444444-4444-4444-4444-000000000002', 'confirmed', 'approved', NOW() - INTERVAL '6 weeks',  NOW() - INTERVAL '6 weeks'),
  ('47474747-4747-4747-4747-000000000004', '11111111-1111-1111-1111-000000000012', '44444444-4444-4444-4444-000000000003', 'confirmed', 'approved', NOW() - INTERVAL '4 weeks',  NOW() - INTERVAL '4 weeks'),
  ('47474747-4747-4747-4747-000000000005', '11111111-1111-1111-1111-000000000013', '44444444-4444-4444-4444-000000000004', 'confirmed', 'approved', NOW() - INTERVAL '7 weeks',  NOW() - INTERVAL '7 weeks'),
  ('47474747-4747-4747-4747-000000000006', '11111111-1111-1111-1111-000000000012', '44444444-4444-4444-4444-000000000005', 'confirmed', 'approved', NOW() - INTERVAL '6 weeks',  NOW() - INTERVAL '6 weeks'),
  ('47474747-4747-4747-4747-000000000007', '11111111-1111-1111-1111-000000000014', '44444444-4444-4444-4444-000000000007', 'pending',   'approved', NOW() - INTERVAL '1 week',   NULL),
  ('47474747-4747-4747-4747-000000000008', '11111111-1111-1111-1111-000000000013', '44444444-4444-4444-4444-000000000008', 'confirmed', 'approved', NOW() - INTERVAL '8 weeks',  NOW() - INTERVAL '7 weeks'),
  ('47474747-4747-4747-4747-000000000009', '11111111-1111-1111-1111-000000000014', '44444444-4444-4444-4444-000000000003', 'confirmed', 'approved', NOW() - INTERVAL '4 weeks',  NOW() - INTERVAL '4 weeks'),
  ('47474747-4747-4747-4747-000000000010', '11111111-1111-1111-1111-000000000012', '44444444-4444-4444-4444-000000000010', 'pending',   'pending',  NOW() - INTERVAL '3 days',   NULL)
ON CONFLICT (id) DO NOTHING;


-- ── Attendance (10 check-ins) ──────────────────────────────────────────────
INSERT INTO public.attendance (id, activity_id, volunteer_id, checked_in_at, method, notes)
VALUES
  ('48484848-4848-4848-4848-000000000001', '45454545-4545-4545-4545-000000000001', '11111111-1111-1111-1111-000000000014', NOW() - INTERVAL '4 weeks' + INTERVAL '8 hours',  'qr',     'On time'),
  ('48484848-4848-4848-4848-000000000002', '45454545-4545-4545-4545-000000000002', '11111111-1111-1111-1111-000000000014', NOW() - INTERVAL '3 weeks' + INTERVAL '8 hours',  'qr',     'On time'),
  ('48484848-4848-4848-4848-000000000003', '45454545-4545-4545-4545-000000000003', '11111111-1111-1111-1111-000000000012', NOW() - INTERVAL '2 weeks' + INTERVAL '8 hours',  'otp',    NULL),
  ('48484848-4848-4848-4848-000000000004', '45454545-4545-4545-4545-000000000003', '11111111-1111-1111-1111-000000000014', NOW() - INTERVAL '2 weeks' + INTERVAL '8 hours',  'otp',    NULL),
  ('48484848-4848-4848-4848-000000000005', '45454545-4545-4545-4545-000000000004', '11111111-1111-1111-1111-000000000012', NOW() - INTERVAL '11 days' + INTERVAL '9 hours', 'manual', 'Walked in early'),
  ('48484848-4848-4848-4848-000000000006', '45454545-4545-4545-4545-000000000005', '11111111-1111-1111-1111-000000000012', NOW() - INTERVAL '1 hour',                       'qr',     NULL),
  ('48484848-4848-4848-4848-000000000007', '45454545-4545-4545-4545-000000000006', '11111111-1111-1111-1111-000000000013', NOW() - INTERVAL '6 weeks' + INTERVAL '7 hours', 'manual', 'Helped triage at intake'),
  ('48484848-4848-4848-4848-000000000008', '45454545-4545-4545-4545-000000000007', '11111111-1111-1111-1111-000000000012', NOW() - INTERVAL '5 weeks' + INTERVAL '6 hours', 'qr',     NULL),
  ('48484848-4848-4848-4848-000000000009', '45454545-4545-4545-4545-000000000008', '11111111-1111-1111-1111-000000000014', NOW() - INTERVAL '2 weeks' + INTERVAL '10 hours','qr',     NULL),
  ('48484848-4848-4848-4848-000000000010', '45454545-4545-4545-4545-000000000009', '11111111-1111-1111-1111-000000000013', NOW() - INTERVAL '5 weeks' + INTERVAL '8 hours', 'manual', 'Was already at the barangay hall')
ON CONFLICT (activity_id, volunteer_id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 8. COMMUNITY NEEDS (10 — mix of categories, priorities, approval states)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.community_needs (id, barangay_id, submitted_by, category, title, description, priority, affected_count, sitio, approval_status, approved_by, approved_at, approval_notes, created_at)
VALUES
  ('55555555-5555-5555-5555-000000000001', '22222222-2222-2222-2222-000000000007', '11111111-1111-1111-1111-000000000008', 'health',        'Maternal nutrition gaps in Sitio Malusak',           'Mother-leaders observed inadequate iron/folate uptake among pregnant residents.',             'high',     14, 'Malusak',    'approved',       '11111111-1111-1111-1111-000000000006', NOW() - INTERVAL '5 weeks', 'Endorsed for Maternal Health Symposium proposal.',  NOW() - INTERVAL '6 weeks'),
  ('55555555-5555-5555-5555-000000000002', '22222222-2222-2222-2222-000000000004', '11111111-1111-1111-1111-000000000004', 'environmental','Recurring flooding in Sitio Pulo',                   'Knee-deep flooding 4+ times per rainy season. Bocaue River backflow.',                        'critical', 320,'Pulo',       'approved',       '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '4 weeks', NULL,                                                NOW() - INTERVAL '4 weeks'),
  ('55555555-5555-5555-5555-000000000003', '22222222-2222-2222-2222-000000000002', '11111111-1111-1111-1111-000000000007', 'economic',      'Food insecurity in Bagumbayan',                       '41% of surveyed households skip ≥1 meal per week.',                                            'high',     805,NULL,         'approved',       '11111111-1111-1111-1111-000000000006', NOW() - INTERVAL '8 weeks', 'Approved — basis for Backyard Garden proposal.',     NOW() - INTERVAL '10 weeks'),
  ('55555555-5555-5555-5555-000000000004', '22222222-2222-2222-2222-000000000005', '11111111-1111-1111-1111-000000000004', 'social',        'Senior citizens lack digital connection to family',  'Many seniors have smartphones from family but cannot operate them.',                            'medium',   60, NULL,         'approved',       '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '3 weeks', NULL,                                                NOW() - INTERVAL '3 weeks'),
  ('55555555-5555-5555-5555-000000000005', '22222222-2222-2222-2222-000000000007', '11111111-1111-1111-1111-000000000008', 'social',        'Rising adolescent pregnancy in Lolomboy',             'Confidential midwife report — 18 cases ages 14–17 in past 12 months.',                          'critical', 18, 'Malusak',    'approved',       '11111111-1111-1111-1111-000000000006', NOW() - INTERVAL '6 weeks', 'High-priority. Confidentiality emphasized.',         NOW() - INTERVAL '7 weeks'),
  ('55555555-5555-5555-5555-000000000006', '22222222-2222-2222-2222-000000000006', '11111111-1111-1111-1111-000000000004', 'environmental','Poor solid waste segregation in Igulot',              'Spot check shows 7 of 10 households mixing biodegradable + non-bio.',                          'medium',   600,NULL,         'approved',       '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '2 weeks', NULL,                                                NOW() - INTERVAL '2 weeks'),
  ('55555555-5555-5555-5555-000000000007', '22222222-2222-2222-2222-000000000008', '11111111-1111-1111-1111-000000000003', 'economic',      'Sulucan women lack formal livelihood income',         'Informal soap-making group needs structure + capital.',                                         'high',     25, NULL,         'approved',       '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks', NULL,                                                NOW() - INTERVAL '5 weeks'),
  ('55555555-5555-5555-5555-000000000008', '22222222-2222-2222-2222-000000000003', '11111111-1111-1111-1111-000000000007', 'social',        'Bambang youth report lack of recreation outlets',     'Youth interviewed during home visits — high mobile/social media dependency.',                  'low',      60, NULL,         'pending_captain', NULL,                                  NULL,                       NULL,                                                NOW() - INTERVAL '10 days'),
  ('55555555-5555-5555-5555-000000000009', '22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-000000000008', 'health',        'Antipona dengue surge',                                '6 confirmed dengue cases in past 14 days; standing water in 3 alleys.',                         'critical', 6,  'Centro',     'pending_captain', NULL,                                  NULL,                       NULL,                                                NOW() - INTERVAL '4 days'),
  ('55555555-5555-5555-5555-000000000010', '22222222-2222-2222-2222-000000000010', '11111111-1111-1111-1111-000000000007', 'social',        'Wakas grade 1 students arrive without school supplies','School class advisers report 65 grade 1 enrollees from indigent households unsupplied.',         'medium',   65, NULL,         'approved',       '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '3 weeks', 'Approved — basis for Wakas Supplies Drive.',         NOW() - INTERVAL '4 weeks')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 9. HOUSEHOLD PROFILES (10 — spread across barangays + sitios)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.household_profiles (id, barangay_id, household_number, head_of_household, family_name, member_count, income_bracket, primary_needs, sitio, notes, extended_data, collected_by, collected_at, created_at, updated_at)
VALUES
  ('56565656-5656-5656-5656-000000000001', '22222222-2222-2222-2222-000000000007', 'HH-001', 'Romeo Bautista',     'Bautista',     5, 'below_poverty', ARRAY['health','economic']::TEXT[],         'Malusak',  'Single-parent family. Eldest child works odd jobs.', '{"housing_type":"semi-permanent","water_source":"deep_well","electricity":true,"toilet":"sealed_pit","flood_prone":true,"breadwinner_employment":"informal"}'::jsonb,                                                                   '11111111-1111-1111-1111-000000000008', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks'),
  ('56565656-5656-5656-5656-000000000002', '22222222-2222-2222-2222-000000000007', 'HH-002', 'Linda Cruz',         'Cruz',         7, 'below_poverty', ARRAY['health','economic','social']::TEXT[],'Malusak',  'Pregnant teen daughter.',                            '{"housing_type":"makeshift","water_source":"shared_faucet","electricity":false,"toilet":"none","flood_prone":true,"breadwinner_employment":"unemployed"}'::jsonb,                                                                         '11111111-1111-1111-1111-000000000008', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks'),
  ('56565656-5656-5656-5656-000000000003', '22222222-2222-2222-2222-000000000007', 'HH-003', 'Dario Soriano',      'Soriano',      4, 'low_income',    ARRAY['economic']::TEXT[],                  'Centro',   NULL,                                                  '{"housing_type":"permanent","water_source":"piped","electricity":true,"toilet":"flush","flood_prone":false,"breadwinner_employment":"farming"}'::jsonb,                                                                                  '11111111-1111-1111-1111-000000000008', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks'),
  ('56565656-5656-5656-5656-000000000004', '22222222-2222-2222-2222-000000000002', 'HH-001', 'Susana del Rosario', 'del Rosario',  6, 'below_poverty', ARRAY['economic','health']::TEXT[],         NULL,       'Diabetic head of household.',                         '{"housing_type":"semi-permanent","water_source":"piped","electricity":true,"toilet":"flush","flood_prone":false,"breadwinner_employment":"informal"}'::jsonb,                                                                            '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '8 weeks', NOW() - INTERVAL '8 weeks', NOW() - INTERVAL '8 weeks'),
  ('56565656-5656-5656-5656-000000000005', '22222222-2222-2222-2222-000000000002', 'HH-002', 'Edgar Mateo',        'Mateo',        4, 'low_income',    ARRAY['economic']::TEXT[],                  NULL,       NULL,                                                  '{"housing_type":"permanent","water_source":"piped","electricity":true,"toilet":"flush","flood_prone":false,"breadwinner_employment":"contractual"}'::jsonb,                                                                              '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '8 weeks', NOW() - INTERVAL '8 weeks', NOW() - INTERVAL '8 weeks'),
  ('56565656-5656-5656-5656-000000000006', '22222222-2222-2222-2222-000000000004', 'HH-001', 'Bonifacio Garcia',   'Garcia',       8, 'below_poverty', ARRAY['environmental','economic']::TEXT[],  'Pulo',     'Most flood-affected family in Sitio Pulo.',           '{"housing_type":"makeshift","water_source":"deep_well","electricity":true,"toilet":"shared","flood_prone":true,"breadwinner_employment":"fishing","disaster_kit":false}'::jsonb,                                                          '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks'),
  ('56565656-5656-5656-5656-000000000007', '22222222-2222-2222-2222-000000000004', 'HH-002', 'Adoracion Tomas',    'Tomas',        3, 'below_poverty', ARRAY['environmental']::TEXT[],             'Pulo',     'Widow + two grandchildren.',                          '{"housing_type":"makeshift","water_source":"deep_well","electricity":false,"toilet":"sealed_pit","flood_prone":true,"breadwinner_employment":"none"}'::jsonb,                                                                              '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks'),
  ('56565656-5656-5656-5656-000000000008', '22222222-2222-2222-2222-000000000005', 'HH-001', 'Lola Pacing Domingo','Domingo',      2, 'low_income',    ARRAY['health','social']::TEXT[],           NULL,       '78 y/o head of household.',                           '{"housing_type":"permanent","water_source":"piped","electricity":true,"toilet":"flush","flood_prone":false,"senior_only":true,"phc_card":true}'::jsonb,                                                                                   '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '4 weeks'),
  ('56565656-5656-5656-5656-000000000009', '22222222-2222-2222-2222-000000000006', 'HH-001', 'Carmela Pascual',    'Pascual',      5, 'low_income',    ARRAY['environmental']::TEXT[],             'San Roque','No segregation practice at home.',                     '{"housing_type":"permanent","water_source":"piped","electricity":true,"toilet":"flush","flood_prone":false,"waste_segregation":"no"}'::jsonb,                                                                                            '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks'),
  ('56565656-5656-5656-5656-000000000010', '22222222-2222-2222-2222-000000000008', 'HH-001', 'Auring Mendoza',     'Mendoza',      5, 'low_income',    ARRAY['economic']::TEXT[],                  NULL,       'Mother active in soap-making group.',                  '{"housing_type":"semi-permanent","water_source":"piped","electricity":true,"toilet":"flush","flood_prone":false,"livelihood_member":true}'::jsonb,                                                                                       '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 10. BARANGAY SKILLS (10) + BARANGAY ASSETS (10)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.barangay_skills (id, barangay_id, skill_name, category, practitioner_count, proficiency_level, notes, created_by)
VALUES
  ('57575757-5757-5757-5757-000000000001', '22222222-2222-2222-2222-000000000007', 'Carpentry',                'trade',       12, 'intermediate', '4 with bench-carpenter experience.',                              '11111111-1111-1111-1111-000000000003'),
  ('57575757-5757-5757-5757-000000000002', '22222222-2222-2222-2222-000000000008', 'Soap-making',              'trade',       25, 'intermediate', 'Informal women''s group — looking to formalize.',                  '11111111-1111-1111-1111-000000000003'),
  ('57575757-5757-5757-5757-000000000003', '22222222-2222-2222-2222-000000000005', 'Backyard farming',         'agriculture', 18, 'beginner',     'Mostly tomato, eggplant, pechay.',                                 '11111111-1111-1111-1111-000000000004'),
  ('57575757-5757-5757-5757-000000000004', '22222222-2222-2222-2222-000000000001', 'Midwifery (informal)',     'health',      2,  'advanced',     'Two long-tenured hilots — refer to RHU.',                          '11111111-1111-1111-1111-000000000004'),
  ('57575757-5757-5757-5757-000000000005', '22222222-2222-2222-2222-000000000002', 'Sari-sari store ops',      'trade',       34, 'intermediate', 'Common micro-enterprise; opportunity for bookkeeping training.',  '11111111-1111-1111-1111-000000000003'),
  ('57575757-5757-5757-5757-000000000006', '22222222-2222-2222-2222-000000000009', 'Bamboo crafts',            'trade',       6,  'advanced',     'Old artisans — at risk of trade dying out.',                       '11111111-1111-1111-1111-000000000003'),
  ('57575757-5757-5757-5757-000000000007', '22222222-2222-2222-2222-000000000003', 'Reforestation labor',      'agriculture', 22, 'beginner',     'Joined the April 22 tree planting.',                               '11111111-1111-1111-1111-000000000003'),
  ('57575757-5757-5757-5757-000000000008', '22222222-2222-2222-2222-000000000006', 'Junk-shop recovery',       'other',       9,  'intermediate', 'Several households earning from scrap segregation.',               '11111111-1111-1111-1111-000000000003'),
  ('57575757-5757-5757-5757-000000000009', '22222222-2222-2222-2222-000000000007', 'Volunteer teaching',       'education',   8,  'beginner',     'Community members willing to assist literacy camp.',               '11111111-1111-1111-1111-000000000002'),
  ('57575757-5757-5757-5757-000000000010', '22222222-2222-2222-2222-000000000010', 'Welding',                  'trade',       4,  'intermediate', 'Two with TESDA NC II certification.',                              '11111111-1111-1111-1111-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.barangay_assets (id, barangay_id, asset_name, asset_type, quantity, condition, notes, created_by)
VALUES
  ('58585858-5858-5858-5858-000000000001', '22222222-2222-2222-2222-000000000007', 'Barangay Multi-Purpose Hall',   'facility',       1, 'good',      'Used for sessions + community meetings.',           '11111111-1111-1111-1111-000000000002'),
  ('58585858-5858-5858-5858-000000000002', '22222222-2222-2222-2222-000000000002', 'Covered Court',                  'facility',       1, 'good',      'Health Fair venue.',                                 '11111111-1111-1111-1111-000000000003'),
  ('58585858-5858-5858-5858-000000000003', '22222222-2222-2222-2222-000000000004', 'Evacuation Center (Brgy Hall)',  'facility',       1, 'fair',      'Roof leaks during typhoons.',                        '11111111-1111-1111-1111-000000000002'),
  ('58585858-5858-5858-5858-000000000004', '22222222-2222-2222-2222-000000000005', 'Senior Citizens Center',         'facility',       1, 'good',      'Newly renovated 2024.',                              '11111111-1111-1111-1111-000000000003'),
  ('58585858-5858-5858-5858-000000000005', '22222222-2222-2222-2222-000000000006', 'MRF (Materials Recovery)',       'infrastructure', 1, 'fair',      'Under-utilized — no segregation enforcement.',       '11111111-1111-1111-1111-000000000003'),
  ('58585858-5858-5858-5858-000000000006', '22222222-2222-2222-2222-000000000001', 'Health Outpost',                 'facility',       1, 'fair',      'Limited drug stock.',                                '11111111-1111-1111-1111-000000000004'),
  ('58585858-5858-5858-5858-000000000007', '22222222-2222-2222-2222-000000000003', 'Riverbank Open Space',           'natural',        1, 'good',      'Site of Earth Day tree planting.',                   '11111111-1111-1111-1111-000000000003'),
  ('58585858-5858-5858-5858-000000000008', '22222222-2222-2222-2222-000000000009', 'Elementary School Grounds',      'facility',       1, 'good',      'Brigada Eskwela host.',                              '11111111-1111-1111-1111-000000000002'),
  ('58585858-5858-5858-5858-000000000009', '22222222-2222-2222-2222-000000000008', 'Women''s Cooperative Workshop',   'facility',       1, 'fair',      'Shared space rented monthly.',                       '11111111-1111-1111-1111-000000000003'),
  ('58585858-5858-5858-5858-000000000010', '22222222-2222-2222-2222-000000000010', 'Wakas Multi-Purpose Hall',       'facility',       1, 'good',      'Recently re-floored.',                               '11111111-1111-1111-1111-000000000003')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 11. SURVEYS, QUESTIONS, RESPONSES, ANSWERS, TEMPLATES
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.surveys (id, title, description, category, status, target_barangay_id, created_by, published_at, methodology, parent_survey_id, opens_at, is_anonymous, is_editable, reminder_enabled, submission_type, created_at, updated_at)
VALUES
  ('66666666-6666-6666-6666-000000000001', 'Lolomboy Baseline Literacy Assessment',          'Pre-camp diagnostic for reading proficiency.',                        'social',        'published', '22222222-2222-2222-2222-000000000007', '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '4 weeks',  'quantitative', NULL, NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '5 weeks',  NOW() - INTERVAL '4 weeks'),
  ('66666666-6666-6666-6666-000000000002', 'Lolomboy Post-Literacy Camp Assessment',         'Post-camp re-test for the same 80 OSY learners.',                     'social',        'draft',     '22222222-2222-2222-2222-000000000007', '11111111-1111-1111-1111-000000000004', NULL,                          'quantitative', '66666666-6666-6666-6666-000000000001', NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '1 week',   NOW()),
  ('66666666-6666-6666-6666-000000000003', 'Bagumbayan Food Security Survey',                'Quantify food insecurity prevalence.',                                'economic',      'closed',    '22222222-2222-2222-2222-000000000002', '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '12 weeks', 'quantitative', NULL, NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '13 weeks', NOW() - INTERVAL '8 weeks'),
  ('66666666-6666-6666-6666-000000000004', 'Caingin Flood Risk Perception',                  'Resident perception of flood risk + preparedness.',                   'environmental', 'published', '22222222-2222-2222-2222-000000000004', '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '3 weeks',  'mixed',        NULL, NULL, FALSE, FALSE, TRUE,  'once', NOW() - INTERVAL '4 weeks',  NOW() - INTERVAL '3 weeks'),
  ('66666666-6666-6666-6666-000000000005', 'Duhat Senior Digital Skills Pre-test',           'Smartphone + GCash baseline.',                                        'social',        'published', '22222222-2222-2222-2222-000000000005', '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '2 weeks',  'quantitative', NULL, NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '3 weeks',  NOW() - INTERVAL '2 weeks'),
  ('66666666-6666-6666-6666-000000000006', 'Antipona Maternal Health Feedback',              'Post-symposium feedback survey.',                                     'health',        'draft',     '22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-000000000004', NULL,                          'qualitative',  NULL, NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '5 days',   NOW()),
  ('66666666-6666-6666-6666-000000000007', 'Sulucan Cooperative Member Profile',             'Capture skills + capital constraints of women''s coop members.',      'economic',      'published', '22222222-2222-2222-2222-000000000008', '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '2 weeks',  'mixed',        NULL, NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '3 weeks',  NOW() - INTERVAL '2 weeks'),
  ('66666666-6666-6666-6666-000000000008', 'Igulot Waste Segregation Self-Report',           'Household-level habits + barriers.',                                  'environmental', 'published', '22222222-2222-2222-2222-000000000006', '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '10 days',  'mixed',        NULL, NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '2 weeks',  NOW() - INTERVAL '10 days'),
  ('66666666-6666-6666-6666-000000000009', 'Wakas Indigent Family Verification',             'Verify which families need supply kits.',                             'social',        'closed',    '22222222-2222-2222-2222-000000000010', '11111111-1111-1111-1111-000000000004', NOW() - INTERVAL '5 weeks',  'quantitative', NULL, NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '6 weeks',  NOW() - INTERVAL '4 weeks'),
  ('66666666-6666-6666-6666-000000000010', 'Bambang Youth Engagement Survey',                'Recreational activity preferences for youth ages 11–17.',             'social',        'draft',     '22222222-2222-2222-2222-000000000003', '11111111-1111-1111-1111-000000000004', NULL,                          'mixed',        NULL, NULL, FALSE, FALSE, FALSE, 'once', NOW() - INTERVAL '4 days',   NOW())
ON CONFLICT (id) DO NOTHING;


-- ── Survey Questions (10 — across multiple surveys, mixed types) ───────────
INSERT INTO public.survey_questions (id, survey_id, question_text, question_type, options, is_required, order_index, section_title)
VALUES
  ('67676767-6767-6767-6767-000000000001', '66666666-6666-6666-6666-000000000001', 'Can you read short paragraphs aloud?',                              'multiple_choice', '["Yes, fluently","With some effort","With great difficulty","No"]'::jsonb, TRUE,  0, 'Reading Self-Assessment'),
  ('67676767-6767-6767-6767-000000000002', '66666666-6666-6666-6666-000000000001', 'How often do you read at home?',                                    'multiple_choice', '["Daily","A few times per week","Rarely","Never"]'::jsonb,                  TRUE,  1, 'Reading Self-Assessment'),
  ('67676767-6767-6767-6767-000000000003', '66666666-6666-6666-6666-000000000003', 'In the past month, how many days did your family skip a meal?',     'rating',          NULL,                                                                          TRUE,  0, 'Food Security'),
  ('67676767-6767-6767-6767-000000000004', '66666666-6666-6666-6666-000000000003', 'What is the main reason you skip meals?',                           'multiple_choice', '["Not enough money","No food at home","Saving for emergencies","Other"]'::jsonb, TRUE,  1, 'Food Security'),
  ('67676767-6767-6767-6767-000000000005', '66666666-6666-6666-6666-000000000004', 'During heavy rain, how worried are you about your home flooding?',  'rating',          NULL,                                                                          TRUE,  0, 'Flood Risk Perception'),
  ('67676767-6767-6767-6767-000000000006', '66666666-6666-6666-6666-000000000004', 'Do you have an emergency kit ready?',                                'multiple_choice', '["Yes, fully stocked","Partial","No"]'::jsonb,                              TRUE,  1, 'Flood Preparedness'),
  ('67676767-6767-6767-6767-000000000007', '66666666-6666-6666-6666-000000000004', 'Describe what you would do if a flood started right now.',          'text',            NULL,                                                                          FALSE, 2, 'Flood Preparedness'),
  ('67676767-6767-6767-6767-000000000008', '66666666-6666-6666-6666-000000000005', 'Which apps do you currently use? (Check all that apply)',           'checkbox',        '["Messenger","GCash","YouTube","Facebook","None"]'::jsonb,                  TRUE,  0, 'Digital Skills'),
  ('67676767-6767-6767-6767-000000000009', '66666666-6666-6666-6666-000000000007', 'How long have you been making soap?',                                'multiple_choice', '["<6 months","6–12 months","1–2 years","2+ years"]'::jsonb,                 TRUE,  0, 'Member Profile'),
  ('67676767-6767-6767-6767-000000000010', '66666666-6666-6666-6666-000000000008', 'Does your household segregate biodegradable waste?',                'multiple_choice', '["Always","Sometimes","Rarely","Never"]'::jsonb,                            TRUE,  0, 'Segregation Habits')
ON CONFLICT (id) DO NOTHING;


-- ── Survey Responses (10) ──────────────────────────────────────────────────
INSERT INTO public.survey_responses (id, survey_id, respondent_id, barangay_id, submitted_at, excluded)
VALUES
  ('68686868-6868-6868-6868-000000000001', '66666666-6666-6666-6666-000000000001', '11111111-1111-1111-1111-000000000012', '22222222-2222-2222-2222-000000000007', NOW() - INTERVAL '4 weeks',  FALSE),
  ('68686868-6868-6868-6868-000000000002', '66666666-6666-6666-6666-000000000001', '11111111-1111-1111-1111-000000000013', '22222222-2222-2222-2222-000000000007', NOW() - INTERVAL '4 weeks',  FALSE),
  ('68686868-6868-6868-6868-000000000003', '66666666-6666-6666-6666-000000000003', NULL,                                   '22222222-2222-2222-2222-000000000002', NOW() - INTERVAL '12 weeks', FALSE),
  ('68686868-6868-6868-6868-000000000004', '66666666-6666-6666-6666-000000000003', NULL,                                   '22222222-2222-2222-2222-000000000002', NOW() - INTERVAL '12 weeks', FALSE),
  ('68686868-6868-6868-6868-000000000005', '66666666-6666-6666-6666-000000000003', NULL,                                   '22222222-2222-2222-2222-000000000002', NOW() - INTERVAL '11 weeks', TRUE),
  ('68686868-6868-6868-6868-000000000006', '66666666-6666-6666-6666-000000000004', '11111111-1111-1111-1111-000000000014', '22222222-2222-2222-2222-000000000004', NOW() - INTERVAL '3 weeks',  FALSE),
  ('68686868-6868-6868-6868-000000000007', '66666666-6666-6666-6666-000000000005', NULL,                                   '22222222-2222-2222-2222-000000000005', NOW() - INTERVAL '2 weeks',  FALSE),
  ('68686868-6868-6868-6868-000000000008', '66666666-6666-6666-6666-000000000007', NULL,                                   '22222222-2222-2222-2222-000000000008', NOW() - INTERVAL '2 weeks',  FALSE),
  ('68686868-6868-6868-6868-000000000009', '66666666-6666-6666-6666-000000000008', NULL,                                   '22222222-2222-2222-2222-000000000006', NOW() - INTERVAL '10 days',  FALSE),
  ('68686868-6868-6868-6868-000000000010', '66666666-6666-6666-6666-000000000009', NULL,                                   '22222222-2222-2222-2222-000000000010', NOW() - INTERVAL '5 weeks',  FALSE)
ON CONFLICT (id) DO NOTHING;

-- Update the excluded row with an audit reason so analytics has a real
-- example of a Researcher-scrubbed response.
UPDATE public.survey_responses
   SET exclusion_reason = 'Duplicate submission from same household (verified by Mother Leader).',
       excluded_by      = '11111111-1111-1111-1111-000000000004',
       excluded_at      = NOW() - INTERVAL '11 weeks'
 WHERE id = '68686868-6868-6868-6868-000000000005' AND excluded = TRUE;


-- ── Survey Answers (10 — one per question above) ───────────────────────────
INSERT INTO public.survey_answers (id, response_id, question_id, answer_text, answer_options)
VALUES
  ('68680000-0000-0000-0000-000000000001', '68686868-6868-6868-6868-000000000001', '67676767-6767-6767-6767-000000000001', 'With some effort',     NULL),
  ('68680000-0000-0000-0000-000000000002', '68686868-6868-6868-6868-000000000001', '67676767-6767-6767-6767-000000000002', 'Rarely',                NULL),
  ('68680000-0000-0000-0000-000000000003', '68686868-6868-6868-6868-000000000002', '67676767-6767-6767-6767-000000000001', 'Yes, fluently',         NULL),
  ('68680000-0000-0000-0000-000000000004', '68686868-6868-6868-6868-000000000003', '67676767-6767-6767-6767-000000000003', '5',                     NULL),
  ('68680000-0000-0000-0000-000000000005', '68686868-6868-6868-6868-000000000003', '67676767-6767-6767-6767-000000000004', 'Not enough money',      NULL),
  ('68680000-0000-0000-0000-000000000006', '68686868-6868-6868-6868-000000000006', '67676767-6767-6767-6767-000000000005', '5',                     NULL),
  ('68680000-0000-0000-0000-000000000007', '68686868-6868-6868-6868-000000000006', '67676767-6767-6767-6767-000000000006', 'No',                    NULL),
  ('68680000-0000-0000-0000-000000000008', '68686868-6868-6868-6868-000000000006', '67676767-6767-6767-6767-000000000007', 'I would carry my children upstairs and call my brother.', NULL),
  ('68680000-0000-0000-0000-000000000009', '68686868-6868-6868-6868-000000000007', '67676767-6767-6767-6767-000000000008', NULL,                    ARRAY['Messenger','Facebook']),
  ('68680000-0000-0000-0000-000000000010', '68686868-6868-6868-6868-000000000009', '67676767-6767-6767-6767-000000000010', 'Sometimes',             NULL)
ON CONFLICT (id) DO NOTHING;


-- ── Survey Templates (10 shared instruments) ───────────────────────────────
INSERT INTO public.survey_templates (id, name, description, sections, questions, created_by)
VALUES
  ('69696969-6969-6969-6969-000000000001', 'Standard Household Profile',       'Demographics + housing + utilities + livelihood.',      '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000002', 'Food Security Baseline',           'Frequency + reason for skipped meals.',                  '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000003', 'Disaster Preparedness Audit',      'Emergency kit + plan + flood history.',                  '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000004', 'Adolescent Health Screening',      'For ages 12–18, parent consent required.',              '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000005', 'Senior Citizen Welfare Check',     'Health + cognitive + social isolation indicators.',     '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000006', 'Digital Literacy Assessment',      'Smartphone + apps + safety.',                            '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000007', 'Solid Waste Segregation Profile',  'Habits + barriers + willingness to comply.',            '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000008', 'Livelihood Member Onboarding',     'Skill + product + capital + market access.',            '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000009', 'Post-Program Feedback (Generic)',  'Five-point Likert + open feedback.',                    '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004'),
  ('69696969-6969-6969-6969-000000000010', 'Brigada Eskwela Activity Check',   'Per-volunteer task + hours + condition.',               '[]'::jsonb, '[]'::jsonb, '11111111-1111-1111-1111-000000000004')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 12. ACTIVITY LOGS (10 — volunteer-logged hours, mixed approval states)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.activity_logs (id, volunteer_id, program_id, date, hours, description, status, reviewed_by, reviewed_at, created_at, updated_at)
VALUES
  ('77777777-7777-7777-7777-000000000001', '11111111-1111-1111-1111-000000000014', '44444444-4444-4444-4444-000000000002', '2025-05-10', 8.0, 'Repainted 2 classrooms (Grade 1 wing).',                                                       'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '4 weeks',  NOW() - INTERVAL '4 weeks'),
  ('77777777-7777-7777-7777-000000000002', '11111111-1111-1111-1111-000000000014', '44444444-4444-4444-4444-000000000002', '2025-05-17', 8.0, 'Assisted in window-frame replacement.',                                                         'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks',  NOW() - INTERVAL '3 weeks'),
  ('77777777-7777-7777-7777-000000000003', '11111111-1111-1111-1111-000000000012', '44444444-4444-4444-4444-000000000002', '2025-05-24', 6.0, 'Supply kit packing + distribution.',                                                            'approved', '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '2 weeks',  NOW() - INTERVAL '2 weeks'),
  ('77777777-7777-7777-7777-000000000004', '11111111-1111-1111-1111-000000000013', '44444444-4444-4444-4444-000000000004', '2025-04-15', 7.0, 'Bagumbayan Health Fair triage station.',                                                        'approved', '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks',  NOW() - INTERVAL '6 weeks'),
  ('77777777-7777-7777-7777-000000000005', '11111111-1111-1111-1111-000000000012', '44444444-4444-4444-4444-000000000005', '2025-04-22', 6.0, 'Tree planting along Bambang riverbank.',                                                        'approved', '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks',  NOW() - INTERVAL '5 weeks'),
  ('77777777-7777-7777-7777-000000000006', '11111111-1111-1111-1111-000000000013', '44444444-4444-4444-4444-000000000008', '2025-04-12', 5.0, 'Duhat senior home visits — delivered 6 grocery packs.',                                          'approved', '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks',  NOW() - INTERVAL '5 weeks'),
  ('77777777-7777-7777-7777-000000000007', '11111111-1111-1111-1111-000000000012', '44444444-4444-4444-4444-000000000007', '2025-05-15', 4.0, 'Caingin emergency-kit pre-positioning — 8 households.',                                          'approved', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '2 weeks',  NOW() - INTERVAL '2 weeks'),
  ('77777777-7777-7777-7777-000000000008', '11111111-1111-1111-1111-000000000014', '44444444-4444-4444-4444-000000000003', '2025-05-22', 3.0, 'Drop-off box installation around the DYCI campus.',                                              'pending',  NULL,                                  NULL,                       NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days'),
  ('77777777-7777-7777-7777-000000000009', '11111111-1111-1111-1111-000000000013', '44444444-4444-4444-4444-000000000003', '2025-06-01', 5.0, 'Wakas supply kit packing.',                                                                       'pending',  NULL,                                  NULL,                       NOW() - INTERVAL '2 days',  NOW() - INTERVAL '2 days'),
  ('77777777-7777-7777-7777-000000000010', '11111111-1111-1111-1111-000000000012', NULL,                                   '2025-05-04', 2.0, 'Informal community visit + barangay coordination call.',                                          'rejected', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '4 weeks 1 day', NOW() - INTERVAL '4 weeks')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 13. VOLUNTEER CLASS SCHEDULES (10 — 0=Sunday … 6=Saturday)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.volunteer_class_schedules (id, volunteer_id, subject, day_of_week, start_time, end_time, location, notes)
VALUES
  ('78787878-7878-7878-7878-000000000001', '11111111-1111-1111-1111-000000000012', 'IT 211 — Data Structures',     1, '08:00', '10:30', 'CICS 305', NULL),
  ('78787878-7878-7878-7878-000000000002', '11111111-1111-1111-1111-000000000012', 'IT 213 — Web Programming',     3, '13:00', '16:00', 'CICS 207', 'Lab session'),
  ('78787878-7878-7878-7878-000000000003', '11111111-1111-1111-1111-000000000012', 'GE 6 — Ethics',                4, '08:00', '09:30', 'CICS 101', NULL),
  ('78787878-7878-7878-7878-000000000004', '11111111-1111-1111-1111-000000000013', 'EE 401 — Electronics II',      1, '10:30', '12:00', 'CCEA 312', NULL),
  ('78787878-7878-7878-7878-000000000005', '11111111-1111-1111-1111-000000000013', 'EE 405 — Comm Systems',        2, '14:00', '16:30', 'CCEA 219', NULL),
  ('78787878-7878-7878-7878-000000000006', '11111111-1111-1111-1111-000000000013', 'GE 8 — STS',                   5, '08:00', '09:30', 'CCEA 105', NULL),
  ('78787878-7878-7878-7878-000000000007', '11111111-1111-1111-1111-000000000014', 'BA 200 — Financial Management',1, '13:00', '14:30', 'CBA 305',  NULL),
  ('78787878-7878-7878-7878-000000000008', '11111111-1111-1111-1111-000000000014', 'BA 204 — Marketing',           2, '09:00', '10:30', 'CBA 211',  NULL),
  ('78787878-7878-7878-7878-000000000009', '11111111-1111-1111-1111-000000000014', 'PE 3 — Recreational Sports',   3, '15:00', '16:30', 'Gymnasium', NULL),
  ('78787878-7878-7878-7878-000000000010', '11111111-1111-1111-1111-000000000014', 'GE 4 — Filipino',              5, '10:30', '12:00', 'Annex 101', NULL)
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 14. DONATIONS (10) + DISTRIBUTIONS (10)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.donations (id, donor_name, donor_type, item_type, quantity, unit, received_date, program_id, barangay_id, notes, created_by, created_at, updated_at)
VALUES
  ('88888888-8888-8888-8888-000000000001', 'DYCI Alumni Association',          'organization', 'School Supplies', 200, 'sets',   '2025-05-15', '44444444-4444-4444-4444-000000000002', '22222222-2222-2222-2222-000000000009', 'Brigada Eskwela kits.',                                       '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks'),
  ('88888888-8888-8888-8888-000000000002', 'San Miguel Foundation',            'corporate',    'Canned Goods',    500, 'pcs',    '2025-05-08', '44444444-4444-4444-4444-000000000004', '22222222-2222-2222-2222-000000000002', 'For Bagumbayan health fair packs.',                            '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks'),
  ('88888888-8888-8888-8888-000000000003', 'Eng. Reynaldo Ocampo',             'individual',   'Cash',            30000, 'PHP',  '2025-04-20', '44444444-4444-4444-4444-000000000002', NULL,                                   'Earmarked for paint and brushes.',                            '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '7 weeks', NOW() - INTERVAL '7 weeks'),
  ('88888888-8888-8888-8888-000000000004', 'Bulacan Provincial Health Office', 'government',   'Medicine',        80,  'boxes',  '2025-04-10', '44444444-4444-4444-4444-000000000004', '22222222-2222-2222-2222-000000000002', 'Free medicines for health fair.',                              '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '8 weeks', NOW() - INTERVAL '8 weeks'),
  ('88888888-8888-8888-8888-000000000005', 'Anonymous Donor',                  'anonymous',    'Clothing',        12,  'bags',   '2025-05-02', NULL,                                   '22222222-2222-2222-2222-000000000004', 'Gently-used clothing for Caingin households.',                 '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '7 weeks', NOW() - INTERVAL '7 weeks'),
  ('88888888-8888-8888-8888-000000000006', 'Rotary Club of Bocaue',            'organization', 'Food Pack',       80,  'sets',   '2025-04-05', '44444444-4444-4444-4444-000000000008', '22222222-2222-2222-2222-000000000005', 'Senior citizen grocery packs.',                                '11111111-1111-1111-1111-000000000003', NOW() - INTERVAL '8 weeks', NOW() - INTERVAL '8 weeks'),
  ('88888888-8888-8888-8888-000000000007', 'CICS Faculty Pool',                'organization', 'Hygiene Kit',     65,  'sets',   '2025-05-25', '44444444-4444-4444-4444-000000000003', '22222222-2222-2222-2222-000000000010', 'Companion items for Wakas supply kits.',                       '11111111-1111-1111-1111-000000000011', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
  ('88888888-8888-8888-8888-000000000008', 'Mercury Drug Lolomboy',            'corporate',    'Medicine',        45,  'boxes',  '2025-03-21', NULL,                                   '22222222-2222-2222-2222-000000000007', 'Pediatric meds for Mother Leader emergency stock.',           '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '11 weeks', NOW() - INTERVAL '11 weeks'),
  ('88888888-8888-8888-8888-000000000009', 'DPWH Region III Office',           'government',   'Equipment',       10,  'sets',   '2025-04-25', '44444444-4444-4444-4444-000000000007', '22222222-2222-2222-2222-000000000004', 'Emergency tools (shovels, rope, bags) for flood preparedness.','11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks'),
  ('88888888-8888-8888-8888-000000000010', 'DYCI Parents Council',             'organization', 'Cash',            18000, 'PHP', '2025-05-10', '44444444-4444-4444-4444-000000000003', NULL,                                   'Pledged for Wakas supplies — donation receipt PR-2025-0510.', '11111111-1111-1111-1111-000000000010', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks')
ON CONFLICT (id) DO NOTHING;


INSERT INTO public.donation_distributions (id, donation_id, distributed_to, quantity, distribution_date, distribution_type, notes)
VALUES
  ('89898989-8989-8989-8989-000000000001', '88888888-8888-8888-8888-000000000001', 'Turo Elementary School Pupils', 200, '2025-05-24', 'regular',  '200 kits issued during Brigada distribution day.'),
  ('89898989-8989-8989-8989-000000000002', '88888888-8888-8888-8888-000000000002', 'Bagumbayan health fair attendees', 200, '2025-04-15', 'regular', 'Pasalubong packs paired with check-up.'),
  ('89898989-8989-8989-8989-000000000003', '88888888-8888-8888-8888-000000000002', 'Sitio Pulo flood-prone households', 300, '2025-05-12', 'disaster', 'Forwarded as emergency rations.'),
  ('89898989-8989-8989-8989-000000000004', '88888888-8888-8888-8888-000000000004', 'Bagumbayan free clinic stock',  80,  '2025-04-15', 'regular',  'Used during fair.'),
  ('89898989-8989-8989-8989-000000000005', '88888888-8888-8888-8888-000000000005', 'Sitio Pulo households',          12,  '2025-05-15', 'disaster', 'Delivered alongside emergency kits.'),
  ('89898989-8989-8989-8989-000000000006', '88888888-8888-8888-8888-000000000006', 'Duhat senior citizens',          80,  '2025-04-12', 'regular',  'Senior welfare home-visit packs.'),
  ('89898989-8989-8989-8989-000000000007', '88888888-8888-8888-8888-000000000007', 'Wakas Grade 1 pupils',           65,  '2025-06-08', 'regular',  'Companion to Wakas supply kits.'),
  ('89898989-8989-8989-8989-000000000008', '88888888-8888-8888-8888-000000000008', 'Lolomboy Mother Leader stock',   45,  '2025-03-25', 'regular',  'Lodged in Sitio Malusak medicine pantry.'),
  ('89898989-8989-8989-8989-000000000009', '88888888-8888-8888-8888-000000000009', 'Caingin Brgy Hall',              10,  '2025-04-28', 'disaster', 'Stored at the evacuation center.'),
  ('89898989-8989-8989-8989-000000000010', '88888888-8888-8888-8888-000000000010', 'Wakas Supply Drive Treasury',    18000, '2025-05-11', 'regular', 'Deposited; receipt logged.')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 15. IMPACT — INDICATORS, QUALITATIVE, FOLLOW-UPS
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.impact_indicators (id, program_id, indicator_type, value, unit, recorded_date, notes, created_by)
VALUES
  ('99999999-9999-9999-9999-000000000001', '44444444-4444-4444-4444-000000000002', 'beneficiaries_reached', 850,  'persons',    '2025-05-31', 'All Turo Elementary pupils benefited from cleaner classrooms.',         '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000002', '44444444-4444-4444-4444-000000000002', 'volunteer_hours',       1050, 'hours',      '2025-05-31', '105 volunteers × ~10 average hours.',                                   '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000003', '44444444-4444-4444-4444-000000000004', 'beneficiaries_reached', 215,  'persons',    '2025-04-15', 'Health fair attendees.',                                                 '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000004', '44444444-4444-4444-4444-000000000004', 'medications_distributed',460,'doses',      '2025-04-15', NULL,                                                                      '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000005', '44444444-4444-4444-4444-000000000005', 'trees_planted',         210,  'seedlings',  '2025-04-22', '210 narra + bamboo seedlings.',                                          '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000006', '44444444-4444-4444-4444-000000000008', 'beneficiaries_reached', 30,   'persons',    '2025-04-12', 'Senior welfare visits.',                                                  '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000007', '44444444-4444-4444-4444-000000000007', 'kits_distributed',      25,   'kits',       '2025-05-15', 'Caingin emergency kits pre-positioned.',                                 '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000008', '44444444-4444-4444-4444-000000000006', 'beneficiaries_reached', 45,   'persons',    '2025-03-21', 'Total attendance across 3 dialogue sessions.',                            '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000009', '44444444-4444-4444-4444-000000000009', 'trainings_conducted',   1,    'sessions',   '2025-05-17', 'Single-day workshop.',                                                    '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000010', '44444444-4444-4444-4444-000000000003', 'kits_distributed',      0,    'kits',       '2025-06-08', 'Distribution pending — drive in progress.',                              '11111111-1111-1111-1111-000000000004')
ON CONFLICT (id) DO NOTHING;


INSERT INTO public.impact_qualitative (id, program_id, type, content, subject_name, recorded_date, created_by)
VALUES
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000001', '44444444-4444-4444-4444-000000000002', 'testimonial',         'Sobrang saya namin sa mga bagong kuwarto. Parang bagong school na talaga.',                                                                          'Lourdes Bautista (Turo ES Principal)', '2025-06-01', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000002', '44444444-4444-4444-4444-000000000002', 'case_study',          'Grade 1 pupil Mark Jhon arrived without any supplies. Receiving a kit + new classroom transformed his energy on day one.',                            'Mrs. Lopez, Class Adviser',            '2025-06-02', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000003', '44444444-4444-4444-4444-000000000004', 'testimonial',         'Pinakamalapit na libreng check-up sa amin. Salamat sa PARAYA at SMC Foundation.',                                                                     'Susana del Rosario',                   '2025-04-15', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000004', '44444444-4444-4444-4444-000000000005', 'observation',         'Volunteers showed cross-departmental engagement (CCEA + CICS + CAS). Strong morale.',                                                                  NULL,                                   '2025-04-22', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000005', '44444444-4444-4444-4444-000000000008', 'testimonial',         'Hindi ako nag-iisa. Nakakatuwa na may bumibisita.',                                                                                                    'Lola Pacing Domingo',                  '2025-04-12', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000006', '44444444-4444-4444-4444-000000000007', 'pre_post_narrative',  'Pre: 14 of 25 households said they had no plan. Post: all 25 received a kit and now have a phone-listed neighbor coordinator.',                       NULL,                                   '2025-05-15', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000007', '44444444-4444-4444-4444-000000000006', 'testimonial',         'Nakakatulong na may pagkakataon kaming mag-usap nang bukas tungkol sa nararamdaman namin.',                                                            'Anonymous (youth participant)',         '2025-03-21', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000008', '44444444-4444-4444-4444-000000000009', 'case_study',          'A scrap-recovery training participant earned PHP 1,200 in the first two weeks after the workshop.',                                                  'Carmela Pascual',                       '2025-05-31', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000009', '44444444-4444-4444-4444-000000000004', 'observation',         'Triage line moved efficiently — average wait 22 minutes. Bottleneck was prescription writing.',                                                       NULL,                                   '2025-04-15', '11111111-1111-1111-1111-000000000004'),
  ('9A9A9A9A-9A9A-9A9A-9A9A-000000000010', '44444444-4444-4444-4444-000000000002', 'pre_post_narrative',  'Pre: classrooms had peeling paint and broken windows. Post: 14 of 14 target classrooms restored. Pupils visibly energized on day one.',                NULL,                                   '2025-06-01', '11111111-1111-1111-1111-000000000004')
ON CONFLICT (id) DO NOTHING;


INSERT INTO public.follow_up_records (id, program_id, followup_type, scheduled_date, status, notes, created_by)
VALUES
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000001', '44444444-4444-4444-4444-000000000002', 'immediate', '2025-06-07', 'completed', 'Same-week walk-through with the principal — all repairs confirmed durable.', '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000002', '44444444-4444-4444-4444-000000000002', '6_month',   '2025-11-15', 'pending',   'Check if repaint holds through rainy season.',                                 '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000003', '44444444-4444-4444-4444-000000000004', '6_month',   '2025-10-15', 'pending',   'Track referrals + RHU follow-up.',                                              '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000004', '44444444-4444-4444-4444-000000000005', '6_month',   '2025-10-22', 'pending',   'Survival rate of seedlings.',                                                   '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000005', '44444444-4444-4444-4444-000000000005', '12_month',  '2026-04-22', 'pending',   '1-yr survival + canopy assessment.',                                            '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000006', '44444444-4444-4444-4444-000000000008', '6_month',   '2025-10-12', 'pending',   'Senior wellness check.',                                                        '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000007', '44444444-4444-4444-4444-000000000007', 'immediate', '2025-05-22', 'completed', 'All 25 kits accounted for one week post-distribution.',                          '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000008', '44444444-4444-4444-4444-000000000006', '6_month',   '2025-09-21', 'pending',   'Reach out to participating youth via barangay coordinator.',                     '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000009', '44444444-4444-4444-4444-000000000009', '12_month',  '2026-05-17', 'pending',   'Did Igulot junk-to-funds become a sustained livelihood?',                       '11111111-1111-1111-1111-000000000004'),
  ('9B9B9B9B-9B9B-9B9B-9B9B-000000000010', '44444444-4444-4444-4444-000000000002', '12_month',  '2026-05-31', 'pending',   'One-year durability of repairs.',                                                '11111111-1111-1111-1111-000000000004')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 16. AI REPORTS (10) + ANALYTICS SNAPSHOTS (10)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.ai_reports (id, title, period_start, period_end, narrative, status, generated_by, reviewed_by, approved_at, snapshot_id)
VALUES
  ('AAAA0000-0000-0000-0000-000000000001', 'AGAPE Monthly Narrative — April 2025',     '2025-04-01', '2025-04-30', 'In April 2025, PARAYA delivered 4 programs across 4 barangays. Bagumbayan Health Fair, Bambang Tree Planting, Duhat Senior Welfare visits, and Antipona Youth Mental Health closed sessions accounted for 305 direct beneficiaries and 178 volunteer hours. Key insight: dialogues on youth mental health saw consistent week-over-week growth (12 → 18 → 15 participants).', 'approved', '11111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks',  NULL),
  ('AAAA0000-0000-0000-0000-000000000002', 'AGAPE Monthly Narrative — May 2025',       '2025-05-01', '2025-05-31', 'May 2025 was a high-activity month: Brigada Eskwela in Turo Elementary, Caingin Flood Watch Pilot rollout, Igulot Junk-to-Funds, and the start of Wakas Supplies Drive. 1,090 beneficiaries reached; 1,287 volunteer hours logged.',                                                                                                                                          'reviewed', '11111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000003', NULL,                       NULL),
  ('AAAA0000-0000-0000-0000-000000000003', 'AGAPE Q1 Narrative — Jan–Mar 2025',         '2025-01-01', '2025-03-31', 'Q1 2025 focused on community profiling and Antipona Youth Mental Health Conversations.',                                                                                                                                                                                                                                                                                            'approved', '11111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '7 weeks',  NULL),
  ('AAAA0000-0000-0000-0000-000000000004', 'Turo Brigada Eskwela 2025 — Program Report','2025-05-10', '2025-05-31', 'Across three Saturdays, 105 volunteers refurbished 14 classrooms at Turo Elementary School, distributed 200 supply kits to scholar-recipients, and engaged 850 indirect beneficiaries (entire pupil population).',                                                                                                                                                                'approved', '11111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '3 days',   NULL),
  ('AAAA0000-0000-0000-0000-000000000005', 'Bagumbayan Health Fair — Activity Brief',  '2025-04-15', '2025-04-15', 'Single-day fair reached 215 patients; 28 referrals to Bocaue District Hospital. Top complaints: hypertension and respiratory infection.',                                                                                                                                                                                                                                          'approved', '11111111-1111-1111-1111-000000000003', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '5 weeks',  NULL),
  ('AAAA0000-0000-0000-0000-000000000006', 'Bambang Tree Planting — Activity Brief',   '2025-04-22', '2025-04-22', '210 seedlings planted along the Bambang riverbank with 55 volunteers. DENR rep present.',                                                                                                                                                                                                                                                                                          'approved', '11111111-1111-1111-1111-000000000003', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks',  NULL),
  ('AAAA0000-0000-0000-0000-000000000007', 'Caingin Flood Watch — Pilot Wrap-Up',      '2025-05-01', '2025-05-15', '25 of 100 target households equipped with bug-out bags. Pilot scope concluded. Next phase pending full proposal approval.',                                                                                                                                                                                                                                                       'reviewed', '11111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000003', NULL,                       NULL),
  ('AAAA0000-0000-0000-0000-000000000008', 'SDG Footprint AY 2024–2025 (interim)',     '2024-08-01', '2025-04-30', 'Across 9 months: SDG 4 covered by 5 programs (Brigada Eskwela, Wakas Drive, Antipona Mental Health, Literacy Camp planning, Duhat Digital Skills proposal). SDG 11 covered by 3. SDG 9 by 1 active proposal.',                                                                                                                                                                       'approved', '11111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000002', NOW() - INTERVAL '4 weeks',  NULL),
  ('AAAA0000-0000-0000-0000-000000000009', 'Volunteer Engagement — May 2025',          '2025-05-01', '2025-05-31', '3 active volunteer leads contributing 31, 22, and 16 hours respectively. CICS and CCEA lead departments. Engagement skewed toward facility-prep work; opportunity to balance toward research/data tasks.',                                                                                                                                                                            'draft',    '11111111-1111-1111-1111-000000000004', NULL,                                  NULL,                       NULL),
  ('AAAA0000-0000-0000-0000-000000000010', 'Donations Quarterly Summary — Q2 2025',    '2025-04-01', '2025-06-30', 'Through Q2: PHP 48,000 cash + 925 items received from 10 donors. Distribution efficiency: 92% (of received items distributed within 3 weeks).',                                                                                                                                                                                                                                       'draft',    '11111111-1111-1111-1111-000000000003', NULL,                                  NULL,                       NULL)
ON CONFLICT (id) DO NOTHING;


INSERT INTO public.analytics_snapshots (id, period_type, period_start, period_end, data, generated_by, trigger, created_at)
VALUES
  ('BBBB0000-0000-0000-0000-000000000001', 'monthly',  '2025-01-01','2025-01-31', '{"programs_active":2,"new_signups":4,"volunteer_hours":52,"beneficiaries":120,"donations_value":4500}'::jsonb,  '11111111-1111-1111-1111-000000000002', 'manual', NOW() - INTERVAL '17 weeks'),
  ('BBBB0000-0000-0000-0000-000000000002', 'monthly',  '2025-02-01','2025-02-28', '{"programs_active":3,"new_signups":9,"volunteer_hours":108,"beneficiaries":215,"donations_value":12000}'::jsonb,'11111111-1111-1111-1111-000000000002', 'manual', NOW() - INTERVAL '13 weeks'),
  ('BBBB0000-0000-0000-0000-000000000003', 'monthly',  '2025-03-01','2025-03-31', '{"programs_active":3,"new_signups":12,"volunteer_hours":146,"beneficiaries":305,"donations_value":18500}'::jsonb,'11111111-1111-1111-1111-000000000002', 'manual', NOW() - INTERVAL '9 weeks'),
  ('BBBB0000-0000-0000-0000-000000000004', 'monthly',  '2025-04-01','2025-04-30', '{"programs_active":4,"new_signups":15,"volunteer_hours":178,"beneficiaries":510,"donations_value":54500}'::jsonb,'11111111-1111-1111-1111-000000000002', 'manual', NOW() - INTERVAL '4 weeks'),
  ('BBBB0000-0000-0000-0000-000000000005', 'monthly',  '2025-05-01','2025-05-31', '{"programs_active":6,"new_signups":24,"volunteer_hours":1287,"beneficiaries":1090,"donations_value":86200}'::jsonb,'11111111-1111-1111-1111-000000000002', 'cron',  NOW() - INTERVAL '3 days'),
  ('BBBB0000-0000-0000-0000-000000000006', 'quarterly','2025-01-01','2025-03-31', '{"programs_active":3,"new_signups":25,"volunteer_hours":306,"beneficiaries":640,"donations_value":35000}'::jsonb, '11111111-1111-1111-1111-000000000002', 'manual', NOW() - INTERVAL '9 weeks'),
  ('BBBB0000-0000-0000-0000-000000000007', 'quarterly','2025-04-01','2025-06-30', '{"programs_active":7,"new_signups":48,"volunteer_hours":1690,"beneficiaries":1820,"donations_value":172500}'::jsonb,'11111111-1111-1111-1111-000000000002', 'manual', NOW() - INTERVAL '2 days'),
  ('BBBB0000-0000-0000-0000-000000000008', 'yearly',   '2024-01-01','2024-12-31', '{"programs_active":12,"new_signups":124,"volunteer_hours":4820,"beneficiaries":3540,"donations_value":420000}'::jsonb,'11111111-1111-1111-1111-000000000002','manual',NOW() - INTERVAL '20 weeks'),
  ('BBBB0000-0000-0000-0000-000000000009', 'monthly',  '2024-12-01','2024-12-31', '{"programs_active":2,"new_signups":3,"volunteer_hours":30,"beneficiaries":80,"donations_value":2500}'::jsonb,    '11111111-1111-1111-1111-000000000002', 'manual', NOW() - INTERVAL '21 weeks'),
  ('BBBB0000-0000-0000-0000-000000000010', 'monthly',  '2024-11-01','2024-11-30', '{"programs_active":2,"new_signups":3,"volunteer_hours":24,"beneficiaries":65,"donations_value":3200}'::jsonb,    '11111111-1111-1111-1111-000000000002', 'manual', NOW() - INTERVAL '25 weeks')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 17. NOTIFICATIONS (10 — spread across user roles)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.notifications (id, user_id, type, title, message, is_read, action_url, created_at)
VALUES
  ('CCCC0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-000000000006', 'reminder',     'Community need awaiting your approval', '"Antipona dengue surge" was just submitted by a Mother Leader. Please review and approve to forward to PARAYA.',  FALSE, '/barangay/approvals', NOW() - INTERVAL '4 days'),
  ('CCCC0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-000000000012', 'info',         'You''ve been confirmed for Lolomboy Literacy Camp',  'See you on June 7 at the Sitio Malusak Covered Court.',                                                            TRUE,  '/volunteer/programs', NOW() - INTERVAL '12 days'),
  ('CCCC0000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-000000000005', 'reminder',     'Finance clearance pending: Sulucan Soap-Making',     'This is an income-generating proposal requiring your independent clearance.',                                       FALSE, '/officer/finance',     NOW() - INTERVAL '7 days'),
  ('CCCC0000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-000000000013', 'success',      'Hours approved',                                      '7 hours from your Bagumbayan Health Fair shift on April 15 have been approved.',                                    TRUE,  '/volunteer/hours',     NOW() - INTERVAL '6 weeks'),
  ('CCCC0000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-000000000002', 'info',         'Pre-screening completed',                             'Lolomboy Literacy Camp 2025 passed all 7 pre-screening checks.',                                                    TRUE,  '/officer/proposals',   NOW() - INTERVAL '4 weeks'),
  ('CCCC0000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-000000000007', 'warning',      'Survey closing soon',                                 'Caingin Flood Risk Perception survey closes in 3 days. Encourage households to respond.',                            FALSE, '/barangay/surveys',    NOW() - INTERVAL '2 days'),
  ('CCCC0000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-000000000010', 'success',      'Proposal approved',                                   'Wakas School Supplies Drive 2025 has been approved by the Director.',                                                TRUE,  '/partner/proposals',   NOW() - INTERVAL '2 weeks'),
  ('CCCC0000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-000000000014', 'reminder',     'Upcoming activity',                                   'Wakas Supply Kit Packing on June 1, 9:00 AM. Don''t forget to scan the QR at the venue.',                            FALSE, '/volunteer/check-in',  NOW() - INTERVAL '4 days'),
  ('CCCC0000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-000000000008', 'info',         'New survey assigned',                                 'You''ve been assigned to facilitate Lolomboy Baseline Literacy Assessment with Sitio Malusak households.',           TRUE,  '/barangay/surveys',    NOW() - INTERVAL '4 weeks'),
  ('CCCC0000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-000000000001', 'warning',      'Backup reminder',                                     'Monthly backup verification is due this Friday. Confirm the latest Supabase auto-snapshot.',                          FALSE, '/admin/backup',        NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 18. FORUM (10 threads + 10 replies)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.forum_threads (id, title, body, category, author_id, pinned, locked, created_at, updated_at)
VALUES
  ('DDDD0000-0000-0000-0000-000000000001', 'Welcome to AGAPE Forum',                       'Hi PARAYA team! Please use this space to share updates, surface questions, and coordinate cross-barangay activities. Stay kind, stay constructive.', 'announcement', '11111111-1111-1111-1111-000000000002', TRUE,  FALSE, NOW() - INTERVAL '12 weeks', NOW() - INTERVAL '12 weeks'),
  ('DDDD0000-0000-0000-0000-000000000002', 'Brigada Eskwela 2025 — sign-up open',          'We''re looking for 100 volunteers across 3 Saturdays in May. Sign-up is on the Programs page. CICS / CCEA / CAS departments — please help us recruit!',  'programs',     '11111111-1111-1111-1111-000000000003', FALSE, FALSE, NOW() - INTERVAL '10 weeks', NOW() - INTERVAL '10 weeks'),
  ('DDDD0000-0000-0000-0000-000000000003', 'Question: how do I claim hours after a typhoon-cancelled activity?', 'If the activity was officially cancelled, do I still log my 1-hour travel time? Asking for transparency in my record.',                                'question',     '11111111-1111-1111-1111-000000000014', FALSE, FALSE, NOW() - INTERVAL '8 weeks',  NOW() - INTERVAL '8 weeks'),
  ('DDDD0000-0000-0000-0000-000000000004', 'Sitio Malusak literacy camp — tutor briefing', 'Tutors, please attend the 30-minute briefing on June 5, 3 PM, at CICS 305. We''ll review pacing + protective behaviors.',                                'programs',     '11111111-1111-1111-1111-000000000002', FALSE, FALSE, NOW() - INTERVAL '2 weeks',  NOW() - INTERVAL '2 weeks'),
  ('DDDD0000-0000-0000-0000-000000000005', 'Schedule conflict on Saturdays for CICS Year 3', 'A bunch of us have a Saturday Capstone class. Can we make sign-up flexible by sub-activity?',                                                              'schedule',     '11111111-1111-1111-1111-000000000012', FALSE, FALSE, NOW() - INTERVAL '6 weeks',  NOW() - INTERVAL '6 weeks'),
  ('DDDD0000-0000-0000-0000-000000000006', 'Suggestion: ride-share thread for Bocaue trips', 'It''d be useful to pool jeepney/tricycle rides for early-morning activities. Open to organizing if there''s appetite.',                                       'general',      '11111111-1111-1111-1111-000000000013', FALSE, FALSE, NOW() - INTERVAL '5 weeks',  NOW() - INTERVAL '5 weeks'),
  ('DDDD0000-0000-0000-0000-000000000007', 'Lolomboy — preparing for rainy season',         'Captain Villanueva and I met yesterday. The barangay is keen to revisit the bug-out bag protocol. Looping in @PARAYA for guidance.',                       'barangay',     '11111111-1111-1111-1111-000000000007', FALSE, FALSE, NOW() - INTERVAL '3 weeks',  NOW() - INTERVAL '3 weeks'),
  ('DDDD0000-0000-0000-0000-000000000008', 'Partner accounts: how to add a budget item that needs PARAYA validation?', 'When I add a budget item to a program my Office submitted, it goes ''pending''. What''s the typical turnaround?',                                          'question',     '11111111-1111-1111-1111-000000000009', FALSE, FALSE, NOW() - INTERVAL '4 weeks',  NOW() - INTERVAL '4 weeks'),
  ('DDDD0000-0000-0000-0000-000000000009', 'Photo consent reminder',                        'When uploading activity photos, please confirm the volunteer/beneficiary consented to photo use. The volunteers table tracks this per-person.',              'announcement', '11111111-1111-1111-1111-000000000001', TRUE,  FALSE, NOW() - INTERVAL '7 weeks',  NOW() - INTERVAL '7 weeks'),
  ('DDDD0000-0000-0000-0000-000000000010', 'AY 2025–2026 partnership renewals',             'We''re renewing partnerships with Antipona, Bagumbayan, Bambang, Caingin, and Duhat next month. Heads-up.',                                                'announcement', '11111111-1111-1111-1111-000000000002', FALSE, FALSE, NOW() - INTERVAL '1 week',   NOW() - INTERVAL '1 week')
ON CONFLICT (id) DO NOTHING;


INSERT INTO public.forum_posts (id, thread_id, author_id, body, created_at, updated_at)
VALUES
  ('EEEE0000-0000-0000-0000-000000000001', 'DDDD0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-000000000012', 'Signed up. See you guys at Turo Elementary!',                                                                NOW() - INTERVAL '10 weeks', NOW() - INTERVAL '10 weeks'),
  ('EEEE0000-0000-0000-0000-000000000002', 'DDDD0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-000000000013', 'I''ll be there — happy to help with windows.',                                                                NOW() - INTERVAL '10 weeks', NOW() - INTERVAL '10 weeks'),
  ('EEEE0000-0000-0000-0000-000000000003', 'DDDD0000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-000000000003', 'For officially cancelled activities, only log hours that you actually rendered. Travel time alone isn''t loggable. Thanks for asking!',  NOW() - INTERVAL '8 weeks',  NOW() - INTERVAL '8 weeks'),
  ('EEEE0000-0000-0000-0000-000000000004', 'DDDD0000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-000000000012', 'See you on June 5. Noted.',                                                                                    NOW() - INTERVAL '2 weeks',  NOW() - INTERVAL '2 weeks'),
  ('EEEE0000-0000-0000-0000-000000000005', 'DDDD0000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-000000000003', 'Good point — we''ll look into per-activity sign-up granularity. Tracking in the volunteer module backlog.',     NOW() - INTERVAL '6 weeks',  NOW() - INTERVAL '6 weeks'),
  ('EEEE0000-0000-0000-0000-000000000006', 'DDDD0000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-000000000014', '+1 — I''d join a ride-share thread for Caingin.',                                                              NOW() - INTERVAL '5 weeks',  NOW() - INTERVAL '5 weeks'),
  ('EEEE0000-0000-0000-0000-000000000007', 'DDDD0000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-000000000002', 'Adding this to next week''s coordination meeting agenda.',                                                     NOW() - INTERVAL '3 weeks',  NOW() - INTERVAL '3 weeks'),
  ('EEEE0000-0000-0000-0000-000000000008', 'DDDD0000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-000000000003', 'Typical turnaround is 2–3 working days. We try not to let validations sit longer than a week.',                NOW() - INTERVAL '4 weeks',  NOW() - INTERVAL '4 weeks'),
  ('EEEE0000-0000-0000-0000-000000000009', 'DDDD0000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-000000000003', 'Confirmed — the volunteers table has the consent flag. Use it.',                                              NOW() - INTERVAL '7 weeks',  NOW() - INTERVAL '7 weeks'),
  ('EEEE0000-0000-0000-0000-000000000010', 'DDDD0000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-000000000006', 'Lolomboy is in. Looking forward to AY 2025–2026.',                                                              NOW() - INTERVAL '1 week',   NOW() - INTERVAL '1 week')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 19. AUDIT LOGS (10 sample entries — covers each level + action type)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.audit_logs (id, user_id, user_email, action, resource_type, resource_id, level, ip_address, metadata, created_at)
VALUES
  ('FFFF0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-000000000001', 'admin@agape.dyci.edu.ph',          'User created (direct)',          'users',             '11111111-1111-1111-1111-000000000012', 'info',    '203.123.45.10', '{"role":"volunteer","department":"CICS"}'::jsonb,                                                  NOW() - INTERVAL '3 months'),
  ('FFFF0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-000000000001', 'admin@agape.dyci.edu.ph',          'User invited',                   'users',             NULL,                                   'info',    '203.123.45.10', '{"email":"finance@paraya.dyci.edu.ph","role":"finance_officer"}'::jsonb,                            NOW() - INTERVAL '6 months'),
  ('FFFF0000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-000000000005', 'finance@paraya.dyci.edu.ph',       'Finance clearance granted',      'project_proposals', '33333333-3333-3333-3333-000000000001', 'info',    '203.123.45.12', '{"proposal":"Lolomboy Literacy Camp 2025","amount":75000}'::jsonb,                                  NOW() - INTERVAL '3 weeks'),
  ('FFFF0000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-000000000002', 'director@paraya.dyci.edu.ph',      'Proposal status changed',        'project_proposals', '33333333-3333-3333-3333-000000000010', 'warning', '203.123.45.14', '{"from":"pre_screening","to":"rejected","reason":"insufficient_needs_data"}'::jsonb,                NOW() - INTERVAL '12 days'),
  ('FFFF0000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-000000000001', 'admin@agape.dyci.edu.ph',          'Password reset sent',            'users',             '11111111-1111-1111-1111-000000000007', 'info',    '203.123.45.10', '{"method":"email"}'::jsonb,                                                                          NOW() - INTERVAL '5 weeks'),
  ('FFFF0000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-000000000006', 'captain.lolomboy@bocaue.gov.ph',   'Community need approved',        'community_needs',   '55555555-5555-5555-5555-000000000005', 'info',    '203.123.45.18', '{"barangay":"Lolomboy","category":"social"}'::jsonb,                                                NOW() - INTERVAL '6 weeks'),
  ('FFFF0000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-000000000001', 'admin@agape.dyci.edu.ph',          'Backup info viewed',             'system',            NULL,                                   'info',    '203.123.45.10', '{"page":"/admin/backup"}'::jsonb,                                                                    NOW() - INTERVAL '8 days'),
  ('FFFF0000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-000000000005', 'finance@paraya.dyci.edu.ph',       'Finance revision requested',     'project_proposals', '33333333-3333-3333-3333-000000000007', 'warning', '203.123.45.12', '{"reason":"Income-generating proposal needs itemized cashflow projection."}'::jsonb,                NOW() - INTERVAL '6 days'),
  ('FFFF0000-0000-0000-0000-000000000009', NULL,                                   'unknown',                          'Login failed',                   'auth',              NULL,                                   'error',   '156.45.21.88',  '{"email":"director@paraya.dyci.edu.ph","reason":"invalid_credentials","attempts":3}'::jsonb,        NOW() - INTERVAL '14 days'),
  ('FFFF0000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-000000000002', 'director@paraya.dyci.edu.ph',      'AI narrative report generated',  'ai_reports',        'AAAA0000-0000-0000-0000-000000000002', 'info',    '203.123.45.14', '{"period":"May 2025","model":"claude-sonnet-4-6"}'::jsonb,                                          NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- DONE — Refresh PostgREST cache so new rows show up immediately in the API
-- ════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ Quick verification queries (paste into the SQL Editor after seeding):  │
-- │                                                                          │
-- │   SELECT role, COUNT(*) FROM public.users GROUP BY role;                  │
-- │   SELECT COUNT(*) FROM public.barangays;            -- expect 10          │
-- │   SELECT status, COUNT(*) FROM public.project_proposals GROUP BY status;  │
-- │   SELECT status, COUNT(*) FROM public.programs GROUP BY status;           │
-- │   SELECT category, COUNT(*) FROM public.community_needs GROUP BY category;│
-- │   SELECT donor_type, SUM(quantity) FROM public.donations GROUP BY donor_type; │
-- │                                                                          │
-- │ Test login: admin@agape.dyci.edu.ph   /   Agape2026!                      │
-- └────────────────────────────────────────────────────────────────────────┘
