-- Deterministic synthetic identities for disposable release-gate testing only.
-- No name, email, UUID, contact, or geography below represents a real person
-- or organization. This file must never run against a linked/shared project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.barangays (
  id, name, municipality, province, contact_person, contact_phone, contact_email,
  total_population, total_households, partnership_start, latitude, longitude,
  is_active, profile_code_prefix, is_synthetic_test
) VALUES
  ('f2100000-0000-4000-8000-000000000001', 'Synthetic Barangay Alpha', 'Test Municipality', 'Test Province', NULL, NULL, NULL, 100, 25, NULL, NULL, NULL, true, 'SYNA', true),
  ('f2100000-0000-4000-8000-000000000002', 'Synthetic Barangay Beta',  'Test Municipality', 'Test Province', NULL, NULL, NULL, 120, 30, NULL, NULL, NULL, true, 'SYNB', true)
ON CONFLICT (id) DO UPDATE SET is_synthetic_test=true;

WITH fixture(id,email,full_name,app_role,account_status,is_active,barangay_id,org_name,permissions) AS (
  VALUES
    ('f2200000-0000-4000-8000-000000000001'::uuid,'admin@release-gate.invalid','Synthetic Admin','admin','active',true,NULL::uuid,NULL::text,'{}'::jsonb),
    ('f2200000-0000-4000-8000-000000000002'::uuid,'director@release-gate.invalid','Synthetic Director','paraya_director','active',true,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000003'::uuid,'associate@release-gate.invalid','Synthetic Associate','paraya_associate','active',true,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000004'::uuid,'researcher@release-gate.invalid','Synthetic Researcher','paraya_researcher','active',true,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000005'::uuid,'finance@release-gate.invalid','Synthetic Finance','finance_officer','active',true,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000006'::uuid,'captain-alpha@release-gate.invalid','Synthetic Captain','barangay_captain','active',true,'f2100000-0000-4000-8000-000000000001'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000007'::uuid,'secretary-alpha@release-gate.invalid','Synthetic Secretary','barangay_secretary','active',true,'f2100000-0000-4000-8000-000000000001'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000008'::uuid,'mother-alpha@release-gate.invalid','Synthetic Mother Leader','barangay_mother_leader','active',true,'f2100000-0000-4000-8000-000000000001'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000009'::uuid,'volunteer@release-gate.invalid','Synthetic Volunteer','volunteer','active',true,'f2100000-0000-4000-8000-000000000001'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000010'::uuid,'pending@release-gate.invalid','Synthetic Pending','volunteer','pending',false,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000011'::uuid,'suspended@release-gate.invalid','Synthetic Suspended','volunteer','suspended',false,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000012'::uuid,'denied-finance@release-gate.invalid','Synthetic Denied Finance','finance_officer','active',true,NULL,NULL,'{"budgets":false}'),
    ('f2200000-0000-4000-8000-000000000013'::uuid,'office-history@release-gate.invalid','Synthetic Historical Office','office','active',true,NULL,'Synthetic Office','{}'),
    ('f2200000-0000-4000-8000-000000000014'::uuid,'organization-history@release-gate.invalid','Synthetic Historical Organization','student_org','active',true,NULL,'Synthetic Organization','{}'),
    ('f2200000-0000-4000-8000-000000000015'::uuid,'department-history@release-gate.invalid','Synthetic Historical Department','department','active',true,NULL,'Synthetic Department','{}'),
    ('f2200000-0000-4000-8000-000000000016'::uuid,'mother-unassigned@release-gate.invalid','Synthetic Unassigned Mother Leader','barangay_mother_leader','active',true,'f2100000-0000-4000-8000-000000000002'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000017'::uuid,'inactive@release-gate.invalid','Synthetic Inactive','volunteer','active',false,NULL,NULL,'{}')
)
INSERT INTO auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,
  crypt('SyntheticReleaseGateOnly!2026',gen_salt('bf')),now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name',full_name,'role',app_role),now(),now(),'','','',''
FROM fixture
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
SELECT gen_random_uuid(),u.id,u.id::text,jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true),'email',now(),now(),now()
FROM auth.users u
WHERE u.email LIKE '%@release-gate.invalid'
ON CONFLICT (provider,provider_id) DO NOTHING;

WITH fixture(id,email,full_name,app_role,account_status,is_active,barangay_id,org_name,permissions) AS (
  VALUES
    ('f2200000-0000-4000-8000-000000000001'::uuid,'admin@release-gate.invalid','Synthetic Admin','admin','active',true,NULL::uuid,NULL::text,'{}'::jsonb),
    ('f2200000-0000-4000-8000-000000000002'::uuid,'director@release-gate.invalid','Synthetic Director','paraya_director','active',true,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000003'::uuid,'associate@release-gate.invalid','Synthetic Associate','paraya_associate','active',true,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000004'::uuid,'researcher@release-gate.invalid','Synthetic Researcher','paraya_researcher','active',true,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000005'::uuid,'finance@release-gate.invalid','Synthetic Finance','finance_officer','active',true,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000006'::uuid,'captain-alpha@release-gate.invalid','Synthetic Captain','barangay_captain','active',true,'f2100000-0000-4000-8000-000000000001'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000007'::uuid,'secretary-alpha@release-gate.invalid','Synthetic Secretary','barangay_secretary','active',true,'f2100000-0000-4000-8000-000000000001'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000008'::uuid,'mother-alpha@release-gate.invalid','Synthetic Mother Leader','barangay_mother_leader','active',true,'f2100000-0000-4000-8000-000000000001'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000009'::uuid,'volunteer@release-gate.invalid','Synthetic Volunteer','volunteer','active',true,'f2100000-0000-4000-8000-000000000001'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000010'::uuid,'pending@release-gate.invalid','Synthetic Pending','volunteer','pending',false,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000011'::uuid,'suspended@release-gate.invalid','Synthetic Suspended','volunteer','suspended',false,NULL,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000012'::uuid,'denied-finance@release-gate.invalid','Synthetic Denied Finance','finance_officer','active',true,NULL,NULL,'{"budgets":false}'),
    ('f2200000-0000-4000-8000-000000000013'::uuid,'office-history@release-gate.invalid','Synthetic Historical Office','office','active',true,NULL,'Synthetic Office','{}'),
    ('f2200000-0000-4000-8000-000000000014'::uuid,'organization-history@release-gate.invalid','Synthetic Historical Organization','student_org','active',true,NULL,'Synthetic Organization','{}'),
    ('f2200000-0000-4000-8000-000000000015'::uuid,'department-history@release-gate.invalid','Synthetic Historical Department','department','active',true,NULL,'Synthetic Department','{}'),
    ('f2200000-0000-4000-8000-000000000016'::uuid,'mother-unassigned@release-gate.invalid','Synthetic Unassigned Mother Leader','barangay_mother_leader','active',true,'f2100000-0000-4000-8000-000000000002'::uuid,NULL,'{}'),
    ('f2200000-0000-4000-8000-000000000017'::uuid,'inactive@release-gate.invalid','Synthetic Inactive','volunteer','active',false,NULL,NULL,'{}')
)
INSERT INTO public.users(id,email,full_name,role,status,is_active,barangay_id,org_name,permissions,is_synthetic_test,created_at,updated_at)
SELECT id,email,full_name,app_role,account_status,is_active,barangay_id,org_name,permissions,true,now(),now()
FROM fixture
ON CONFLICT (id) DO UPDATE SET
  status=excluded.status,is_active=excluded.is_active,barangay_id=excluded.barangay_id,
  permissions=excluded.permissions,is_synthetic_test=true,updated_at=now();

INSERT INTO public.barangay_sitios(id,barangay_id,name,aliases,is_active,created_by)
VALUES
 ('f2300000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','Synthetic Sitio North','{}',true,'f2200000-0000-4000-8000-000000000004'),
 ('f2300000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001','Synthetic Sitio South','{}',true,'f2200000-0000-4000-8000-000000000004'),
 ('f2300000-0000-4000-8000-000000000003','f2100000-0000-4000-8000-000000000002','Synthetic Sitio East','{}',true,'f2200000-0000-4000-8000-000000000004')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mother_leader_sitio_assignments(id,mother_leader_id,sitio_id,effective_from,effective_to,assigned_by)
VALUES
 ('f2400000-0000-4000-8000-000000000001','f2200000-0000-4000-8000-000000000008','f2300000-0000-4000-8000-000000000001',current_date-30,NULL,'f2200000-0000-4000-8000-000000000004'),
 ('f2400000-0000-4000-8000-000000000002','f2200000-0000-4000-8000-000000000008','f2300000-0000-4000-8000-000000000002',current_date-60,current_date-1,'f2200000-0000-4000-8000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- Runtime rows are intentionally left off and V1 remains authoritative.
UPDATE public.profiling_runtime_settings
SET mode='off',synthetic_user_ids='{}',synthetic_barangay_ids='{}',privacy_approved_at=NULL,privacy_approved_by=NULL
WHERE id=true;
UPDATE public.phase2_component_runtime
SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state SET write_authority='v1',changed_at=now();
