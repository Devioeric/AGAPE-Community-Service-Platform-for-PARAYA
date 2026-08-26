-- Deterministic Phase 1 fixture for disposable release-gate testing only.
-- Every identity and record is synthetic. Never execute against a linked project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.barangays(id,name,municipality,province,total_population,total_households,is_active,profile_code_prefix,is_synthetic_test)
VALUES
 ('f2100000-0000-4000-8000-000000000001','Synthetic Barangay Alpha','Test Municipality','Test Province',100,25,true,'SYNA',true),
 ('f2100000-0000-4000-8000-000000000002','Synthetic Barangay Beta','Test Municipality','Test Province',120,30,true,'SYNB',true)
ON CONFLICT(id) DO UPDATE SET is_synthetic_test=true;

WITH fixture(id,email,full_name,app_role,account_status,is_active,barangay_id,org_name,permissions) AS (
 VALUES
 ('f2200000-0000-4000-8000-000000000001'::uuid,'admin@release-gate.invalid','Synthetic Admin','admin','active',true,NULL::uuid,NULL::text,'{}'::jsonb),
 ('f2200000-0000-4000-8000-000000000002','director@release-gate.invalid','Synthetic Director','paraya_director','active',true,NULL,NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000003','associate@release-gate.invalid','Synthetic Associate','paraya_associate','active',true,NULL,NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000004','researcher@release-gate.invalid','Synthetic Researcher','paraya_researcher','active',true,NULL,NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000005','finance@release-gate.invalid','Synthetic Finance','finance_officer','active',true,NULL,NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000006','captain-alpha@release-gate.invalid','Synthetic Captain','barangay_captain','active',true,'f2100000-0000-4000-8000-000000000001',NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000007','secretary-alpha@release-gate.invalid','Synthetic Secretary','barangay_secretary','active',true,'f2100000-0000-4000-8000-000000000001',NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000008','mother-alpha@release-gate.invalid','Synthetic Mother Leader','barangay_mother_leader','active',true,'f2100000-0000-4000-8000-000000000001',NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000009','volunteer@release-gate.invalid','Synthetic Volunteer','volunteer','active',true,'f2100000-0000-4000-8000-000000000001',NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000010','pending@release-gate.invalid','Synthetic Pending','volunteer','pending',false,NULL,NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000011','suspended@release-gate.invalid','Synthetic Suspended','volunteer','suspended',false,NULL,NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000012','inactive@release-gate.invalid','Synthetic Inactive','volunteer','active',false,NULL,NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000013','office-history@release-gate.invalid','Synthetic Historical Office','office','active',true,NULL,'Synthetic Office','{}'),
 ('f2200000-0000-4000-8000-000000000014','organization-history@release-gate.invalid','Synthetic Historical Organization','student_org','active',true,NULL,'Synthetic Organization','{}'),
 ('f2200000-0000-4000-8000-000000000015','department-history@release-gate.invalid','Synthetic Historical Department','department','active',true,NULL,'Synthetic Department','{}'),
 ('f2200000-0000-4000-8000-000000000016','mother-unassigned@release-gate.invalid','Synthetic Unassigned Mother Leader','barangay_mother_leader','active',true,'f2100000-0000-4000-8000-000000000002',NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000017','mother-expired@release-gate.invalid','Synthetic Expired Mother Leader','barangay_mother_leader','active',true,'f2100000-0000-4000-8000-000000000001',NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000018','mother-cross-sitio@release-gate.invalid','Synthetic Cross Sitio Mother Leader','barangay_mother_leader','active',true,'f2100000-0000-4000-8000-000000000001',NULL,'{}'),
 ('f2200000-0000-4000-8000-000000000019','deny-profiling@release-gate.invalid','Synthetic Denied Profiling','paraya_researcher','active',true,NULL,NULL,'{"profiling":false}'),
 ('f2200000-0000-4000-8000-000000000020','deny-partnerships@release-gate.invalid','Synthetic Denied Partnerships','paraya_associate','active',true,NULL,NULL,'{"partnerships":false}'),
 ('f2200000-0000-4000-8000-000000000021','deny-proposals@release-gate.invalid','Synthetic Denied Proposals','paraya_associate','active',true,NULL,NULL,'{"proposals":false}'),
 ('f2200000-0000-4000-8000-000000000022','deny-programs@release-gate.invalid','Synthetic Denied Programs','paraya_associate','active',true,NULL,NULL,'{"programs":false}'),
 ('f2200000-0000-4000-8000-000000000023','deny-budgets@release-gate.invalid','Synthetic Denied Budgets','finance_officer','active',true,NULL,NULL,'{"budgets":false}'),
 ('f2200000-0000-4000-8000-000000000024','deny-surveys@release-gate.invalid','Synthetic Denied Surveys','paraya_associate','active',true,NULL,NULL,'{"surveys":false}'),
 ('f2200000-0000-4000-8000-000000000025','deny-analytics@release-gate.invalid','Synthetic Denied Analytics','paraya_director','active',true,NULL,NULL,'{"analytics":false}'),
 ('f2200000-0000-4000-8000-000000000026','deny-ai@release-gate.invalid','Synthetic Denied AI','paraya_associate','active',true,NULL,NULL,'{"ai_assistance":false}')
), auth_insert AS (
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,
  crypt('SyntheticReleaseGateOnly!2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('full_name',full_name,'role',app_role),now(),now(),'','','',''
 FROM fixture ON CONFLICT(id) DO NOTHING RETURNING id
)
INSERT INTO public.users(id,email,full_name,role,status,is_active,barangay_id,org_name,permissions,is_synthetic_test,created_at,updated_at)
SELECT id,email,full_name,app_role,account_status,is_active,barangay_id,org_name,permissions,true,now(),now() FROM fixture
ON CONFLICT(id) DO UPDATE SET status=excluded.status,is_active=excluded.is_active,barangay_id=excluded.barangay_id,permissions=excluded.permissions,is_synthetic_test=true,updated_at=now();

INSERT INTO auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
SELECT gen_random_uuid(),u.id,u.id::text,jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true),'email',now(),now(),now()
FROM auth.users u WHERE u.email LIKE '%@release-gate.invalid' ON CONFLICT(provider,provider_id) DO NOTHING;

INSERT INTO public.barangay_sitios(id,barangay_id,name,aliases,is_active,created_by) VALUES
 ('f2300000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','Synthetic Sitio North','{}',true,'f2200000-0000-4000-8000-000000000004'),
 ('f2300000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001','Synthetic Sitio South','{}',true,'f2200000-0000-4000-8000-000000000004'),
 ('f2300000-0000-4000-8000-000000000003','f2100000-0000-4000-8000-000000000002','Synthetic Sitio East','{}',true,'f2200000-0000-4000-8000-000000000004')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.mother_leader_sitio_assignments(id,mother_leader_id,sitio_id,effective_from,effective_to,assigned_by) VALUES
 ('f2400000-0000-4000-8000-000000000001','f2200000-0000-4000-8000-000000000008','f2300000-0000-4000-8000-000000000001','2026-01-01',NULL,'f2200000-0000-4000-8000-000000000004'),
 ('f2400000-0000-4000-8000-000000000002','f2200000-0000-4000-8000-000000000017','f2300000-0000-4000-8000-000000000002','2025-01-01','2025-12-31','f2200000-0000-4000-8000-000000000004'),
 ('f2400000-0000-4000-8000-000000000003','f2200000-0000-4000-8000-000000000018','f2300000-0000-4000-8000-000000000002','2026-01-01',NULL,'f2200000-0000-4000-8000-000000000004')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_privacy_notices(id,version,notice_text,controller_name,privacy_contact,retention_summary,effective_from,approved_by) VALUES
 ('f2500000-0000-4000-8000-000000000001','synthetic-v1','Synthetic notice for disposable release-gate workflows only.','Synthetic Controller','privacy@release-gate.invalid','Synthetic records are destroyed with the disposable stack.','2026-01-01','f2200000-0000-4000-8000-000000000002') ON CONFLICT(id) DO NOTHING;
UPDATE public.profiling_privacy_settings SET suppression_threshold=5,identifiable_exports_enabled=false,staging_retention_days=30,updated_by='f2200000-0000-4000-8000-000000000002',updated_at=now() WHERE id=true;

INSERT INTO public.official_population_snapshots(id,barangay_id,as_of_date,source_name,total_population,total_households,verified_at,verified_by,created_by) VALUES
 ('f2510000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','2025-09-30','Synthetic official source',100,25,now(),'f2200000-0000-4000-8000-000000000004','f2200000-0000-4000-8000-000000000004') ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_cycles(id,barangay_id,name,status,sample_method,target_households,collection_starts_on,collection_ends_on,privacy_notice_id,completed_at,completed_by,row_version,created_by) VALUES
 ('f2600000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','Synthetic Draft Cycle','draft','systematic',2,'2026-02-01','2026-02-28','f2500000-0000-4000-8000-000000000001',NULL,NULL,1,'f2200000-0000-4000-8000-000000000004'),
 ('f2600000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001','Synthetic Collecting Cycle','collecting','systematic',5,'2026-03-01','2026-03-31','f2500000-0000-4000-8000-000000000001',NULL,NULL,2,'f2200000-0000-4000-8000-000000000004'),
 ('f2600000-0000-4000-8000-000000000003','f2100000-0000-4000-8000-000000000001','Synthetic Validating Cycle','validating','systematic',2,'2026-04-01','2026-04-30','f2500000-0000-4000-8000-000000000001',NULL,NULL,3,'f2200000-0000-4000-8000-000000000004'),
 ('f2600000-0000-4000-8000-000000000004','f2100000-0000-4000-8000-000000000001','Synthetic Completed Cycle','completed','systematic',1,'2025-10-01','2025-10-31','f2500000-0000-4000-8000-000000000001','2025-11-01T00:00:00Z','f2200000-0000-4000-8000-000000000004',4,'f2200000-0000-4000-8000-000000000004')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_households(id,barangay_id,sitio_id,household_code,lifecycle_status,row_version) VALUES
 ('f2700000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000001','active',2),
 ('f2700000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000002','active',1),
 ('f2700000-0000-4000-8000-000000000003','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000002','SYNA-HH-000003','moved',2),
 ('f2700000-0000-4000-8000-000000000004','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000002','SYNA-HH-000004','active',1),
 ('f2700000-0000-4000-8000-000000000005','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000005','active',1),
 ('f2700000-0000-4000-8000-000000000006','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000006','active',1),
 ('f2700000-0000-4000-8000-000000000007','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000007','active',1),
 ('f2700000-0000-4000-8000-000000000008','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000008','active',1),
 ('f2700000-0000-4000-8000-000000000009','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000009','active',1),
 ('f2700000-0000-4000-8000-000000000010','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000010','active',1),
 ('f2700000-0000-4000-8000-000000000011','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000011','active',1),
 ('f2700000-0000-4000-8000-000000000012','f2100000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','SYNA-HH-000012','active',1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_code_counters(barangay_id,entity_type,next_value) VALUES
 ('f2100000-0000-4000-8000-000000000001','household',100),
 ('f2100000-0000-4000-8000-000000000001','resident',100)
ON CONFLICT(barangay_id,entity_type) DO UPDATE SET next_value=excluded.next_value;

INSERT INTO public.profiling_sample_units(id,cycle_id,sitio_id,sample_reference,contact_outcome,anonymous_household_size,refusal_recorded_at,recorded_by,household_id,row_version) VALUES
 ('f2710000-0000-4000-8000-000000000001','f2600000-0000-4000-8000-000000000002','f2300000-0000-4000-8000-000000000001','SMP-SYNCOL001','participated',3,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000001',1),
 ('f2710000-0000-4000-8000-000000000002','f2600000-0000-4000-8000-000000000002','f2300000-0000-4000-8000-000000000001','SMP-SYNCOL002','refused',2,'2026-03-05T00:00:00Z','f2200000-0000-4000-8000-000000000008',NULL,1),
 ('f2710000-0000-4000-8000-000000000003','f2600000-0000-4000-8000-000000000002','f2300000-0000-4000-8000-000000000001','SMP-SYNCOL003','unavailable',NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL,1),
 ('f2710000-0000-4000-8000-000000000004','f2600000-0000-4000-8000-000000000002','f2300000-0000-4000-8000-000000000002','SMP-SYNCOL004','ineligible',NULL,NULL,'f2200000-0000-4000-8000-000000000018',NULL,1),
 ('f2710000-0000-4000-8000-000000000005','f2600000-0000-4000-8000-000000000002','f2300000-0000-4000-8000-000000000001','SMP-SYNCOL005','not_contacted',NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL,1),
 ('f2710000-0000-4000-8000-000000000006','f2600000-0000-4000-8000-000000000003','f2300000-0000-4000-8000-000000000001','SMP-SYNVAL001','participated',2,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000002',1),
 ('f2710000-0000-4000-8000-000000000007','f2600000-0000-4000-8000-000000000004','f2300000-0000-4000-8000-000000000001','SMP-SYNDONE01','participated',2,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000005',1),
 ('f2710000-0000-4000-8000-000000000008','f2600000-0000-4000-8000-000000000003','f2300000-0000-4000-8000-000000000001','SMP-SYNLIFE01','participated',1,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000006',1),
 ('f2710000-0000-4000-8000-000000000009','f2600000-0000-4000-8000-000000000003','f2300000-0000-4000-8000-000000000001','SMP-SYNLIFE02','participated',1,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000007',1),
 ('f2710000-0000-4000-8000-000000000010','f2600000-0000-4000-8000-000000000003','f2300000-0000-4000-8000-000000000001','SMP-SYNLIFE03','participated',1,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000008',1),
 ('f2710000-0000-4000-8000-000000000011','f2600000-0000-4000-8000-000000000003','f2300000-0000-4000-8000-000000000001','SMP-SYNLIFE04','participated',1,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000009',1),
 ('f2710000-0000-4000-8000-000000000012','f2600000-0000-4000-8000-000000000003','f2300000-0000-4000-8000-000000000001','SMP-SYNLIFE05','participated',1,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000010',1),
 ('f2710000-0000-4000-8000-000000000013','f2600000-0000-4000-8000-000000000003','f2300000-0000-4000-8000-000000000001','SMP-SYNLIFE06','participated',1,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000011',1),
 ('f2710000-0000-4000-8000-000000000014','f2600000-0000-4000-8000-000000000003','f2300000-0000-4000-8000-000000000001','SMP-SYNREVISE1','participated',1,NULL,'f2200000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000012',1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_residents(id,barangay_id,resident_code,lifecycle_status,row_version) VALUES
 ('f2720000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','SYNA-RES-000001','active',2),
 ('f2720000-0000-4000-8000-000000000002','f2100000-0000-4000-8000-000000000001','SYNA-RES-000002','active',1),
 ('f2720000-0000-4000-8000-000000000003','f2100000-0000-4000-8000-000000000001','SYNA-RES-000003','inactive',2),
 ('f2720000-0000-4000-8000-000000000004','f2100000-0000-4000-8000-000000000001','SYNA-RES-000004','active',1),
 ('f2720000-0000-4000-8000-000000000005','f2100000-0000-4000-8000-000000000001','SYNA-RES-000005','active',1),
 ('f2720000-0000-4000-8000-000000000006','f2100000-0000-4000-8000-000000000001','SYNA-RES-000006','active',1),
 ('f2720000-0000-4000-8000-000000000007','f2100000-0000-4000-8000-000000000001','SYNA-RES-000007','active',1),
 ('f2720000-0000-4000-8000-000000000008','f2100000-0000-4000-8000-000000000001','SYNA-RES-000008','active',1),
 ('f2720000-0000-4000-8000-000000000009','f2100000-0000-4000-8000-000000000001','SYNA-RES-000009','active',1),
 ('f2720000-0000-4000-8000-000000000010','f2100000-0000-4000-8000-000000000001','SYNA-RES-000010','active',1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_submissions(id,cycle_id,sample_unit_id,household_id,sitio_id,status,submission_version,row_version,source_type,household_data,submitted_at,approved_at,approved_by,returned_at,returned_by,return_reason,created_by,supersedes_submission_id) VALUES
 ('f2730000-0000-4000-8000-000000000001','f2600000-0000-4000-8000-000000000002','f2710000-0000-4000-8000-000000000001','f2700000-0000-4000-8000-000000000001','f2300000-0000-4000-8000-000000000001','draft',1,1,'manual','{"income_bracket":"not_stated"}',NULL,NULL,NULL,NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000002','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000006','f2700000-0000-4000-8000-000000000002','f2300000-0000-4000-8000-000000000001','superseded',1,3,'manual','{}','2026-04-10T00:00:00Z',NULL,NULL,'2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007','Synthetic correction required','f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000003','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000006','f2700000-0000-4000-8000-000000000002','f2300000-0000-4000-8000-000000000001','pending',2,1,'manual','{}','2026-04-12T00:00:00Z',NULL,NULL,NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008','f2730000-0000-4000-8000-000000000002'),
 ('f2730000-0000-4000-8000-000000000004','f2600000-0000-4000-8000-000000000004','f2710000-0000-4000-8000-000000000007','f2700000-0000-4000-8000-000000000005','f2300000-0000-4000-8000-000000000001','superseded',1,2,'manual','{}','2025-10-10T00:00:00Z','2025-10-11T00:00:00Z','f2200000-0000-4000-8000-000000000007',NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000005','f2600000-0000-4000-8000-000000000004','f2710000-0000-4000-8000-000000000007','f2700000-0000-4000-8000-000000000005','f2300000-0000-4000-8000-000000000001','approved',2,1,'manual','{}','2025-10-12T00:00:00Z','2025-10-13T00:00:00Z','f2200000-0000-4000-8000-000000000007',NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008','f2730000-0000-4000-8000-000000000004'),
 ('f2730000-0000-4000-8000-000000000006','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000006','f2300000-0000-4000-8000-000000000001','approved',1,1,'manual','{}','2026-04-10T00:00:00Z','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007',NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000007','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000009','f2700000-0000-4000-8000-000000000007','f2300000-0000-4000-8000-000000000001','approved',1,1,'manual','{}','2026-04-10T00:00:00Z','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007',NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000008','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000010','f2700000-0000-4000-8000-000000000008','f2300000-0000-4000-8000-000000000001','approved',1,1,'manual','{}','2026-04-10T00:00:00Z','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007',NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000009','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000011','f2700000-0000-4000-8000-000000000009','f2300000-0000-4000-8000-000000000001','approved',1,1,'manual','{}','2026-04-10T00:00:00Z','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007',NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000010','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000012','f2700000-0000-4000-8000-000000000010','f2300000-0000-4000-8000-000000000001','approved',1,1,'manual','{}','2026-04-10T00:00:00Z','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007',NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000011','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000013','f2700000-0000-4000-8000-000000000011','f2300000-0000-4000-8000-000000000001','approved',1,1,'manual','{}','2026-04-10T00:00:00Z','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007',NULL,NULL,NULL,'f2200000-0000-4000-8000-000000000008',NULL),
 ('f2730000-0000-4000-8000-000000000012','f2600000-0000-4000-8000-000000000003','f2710000-0000-4000-8000-000000000014','f2700000-0000-4000-8000-000000000012','f2300000-0000-4000-8000-000000000001','returned',1,2,'manual','{}','2026-04-10T00:00:00Z',NULL,NULL,'2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007','Synthetic isolated revision race','f2200000-0000-4000-8000-000000000008',NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_resident_versions(id,submission_id,resident_id,profile_data,is_minor,relationship_to_head,is_household_head,version) VALUES
 ('f2740000-0000-4000-8000-000000000001','f2730000-0000-4000-8000-000000000004','f2720000-0000-4000-8000-000000000001','{"first_name":"Synthetic","last_name":"Adult","estimated_age":35}',false,'household_head',true,1),
 ('f2740000-0000-4000-8000-000000000002','f2730000-0000-4000-8000-000000000005','f2720000-0000-4000-8000-000000000001','{"first_name":"Synthetic","last_name":"Adult","estimated_age":36}',false,'household_head',true,2),
 ('f2740000-0000-4000-8000-000000000003','f2730000-0000-4000-8000-000000000005','f2720000-0000-4000-8000-000000000002','{"first_name":"Synthetic","last_name":"Minor","estimated_age":10}',true,'child',false,1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_resident_versions(id,submission_id,resident_id,profile_data,is_minor,relationship_to_head,is_household_head,version) VALUES
 ('f2740000-0000-4000-8000-000000000004','f2730000-0000-4000-8000-000000000006','f2720000-0000-4000-8000-000000000004','{"first_name":"Synthetic","last_name":"Transfer Source","estimated_age":30}',false,'household_head',true,1),
 ('f2740000-0000-4000-8000-000000000005','f2730000-0000-4000-8000-000000000007','f2720000-0000-4000-8000-000000000005','{"first_name":"Synthetic","last_name":"Transfer Target","estimated_age":31}',false,'household_head',true,1),
 ('f2740000-0000-4000-8000-000000000006','f2730000-0000-4000-8000-000000000008','f2720000-0000-4000-8000-000000000006','{"first_name":"Synthetic","last_name":"Death Race","estimated_age":60}',false,'household_head',true,1),
 ('f2740000-0000-4000-8000-000000000007','f2730000-0000-4000-8000-000000000009','f2720000-0000-4000-8000-000000000007','{"first_name":"Synthetic","last_name":"Merge Source","estimated_age":40}',false,'household_head',true,1),
 ('f2740000-0000-4000-8000-000000000008','f2730000-0000-4000-8000-000000000010','f2720000-0000-4000-8000-000000000008','{"first_name":"Synthetic","last_name":"Merge Target","estimated_age":41}',false,'household_head',true,1),
 ('f2740000-0000-4000-8000-000000000009','f2730000-0000-4000-8000-000000000011','f2720000-0000-4000-8000-000000000009','{"first_name":"Synthetic","last_name":"Consent Race","estimated_age":32}',false,'household_head',true,1),
 ('f2740000-0000-4000-8000-000000000010','f2730000-0000-4000-8000-000000000012','f2720000-0000-4000-8000-000000000010','{"household_row_key":"SMP-SYNREVISE1","first_name":"Synthetic","last_name":"Revision Race","estimated_age":33,"sex":"not_stated","civil_status":"not_stated","relationship_to_head":"household_head","education_level":"not_stated","school_category":"not_stated","employment_status":"not_stated","occupation_category":"not_stated","income_bracket":"not_stated","is_enrolled":false,"skills":[],"disability_support":[],"health_support":[],"planning_needs":[],"pregnancy_status":false,"is_solo_parent":false,"is_4ps_member":false}',false,'household_head',true,1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_household_memberships(id,household_id,resident_id,effective_from,effective_to,reason,created_by) VALUES
 ('f2750000-0000-4000-8000-000000000001','f2700000-0000-4000-8000-000000000005','f2720000-0000-4000-8000-000000000001','2025-10-01',NULL,'Synthetic membership','f2200000-0000-4000-8000-000000000004'),
 ('f2750000-0000-4000-8000-000000000002','f2700000-0000-4000-8000-000000000005','f2720000-0000-4000-8000-000000000002','2025-10-01',NULL,'Synthetic membership','f2200000-0000-4000-8000-000000000004'),
 ('f2750000-0000-4000-8000-000000000003','f2700000-0000-4000-8000-000000000003','f2720000-0000-4000-8000-000000000003','2025-01-01','2025-09-30','Synthetic closed membership','f2200000-0000-4000-8000-000000000004')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_household_memberships(id,household_id,resident_id,effective_from,effective_to,reason,created_by,activated_at,activated_by) VALUES
 ('f2750000-0000-4000-8000-000000000004','f2700000-0000-4000-8000-000000000006','f2720000-0000-4000-8000-000000000004','2026-04-01',NULL,'Synthetic transfer source','f2200000-0000-4000-8000-000000000004','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007'),
 ('f2750000-0000-4000-8000-000000000005','f2700000-0000-4000-8000-000000000007','f2720000-0000-4000-8000-000000000005','2026-04-01',NULL,'Synthetic transfer target','f2200000-0000-4000-8000-000000000004','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007'),
 ('f2750000-0000-4000-8000-000000000006','f2700000-0000-4000-8000-000000000008','f2720000-0000-4000-8000-000000000006','2026-04-01',NULL,'Synthetic death source','f2200000-0000-4000-8000-000000000004','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007'),
 ('f2750000-0000-4000-8000-000000000007','f2700000-0000-4000-8000-000000000009','f2720000-0000-4000-8000-000000000007','2026-04-01',NULL,'Synthetic merge source','f2200000-0000-4000-8000-000000000004','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007'),
 ('f2750000-0000-4000-8000-000000000008','f2700000-0000-4000-8000-000000000010','f2720000-0000-4000-8000-000000000008','2026-04-01',NULL,'Synthetic merge target','f2200000-0000-4000-8000-000000000004','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007'),
 ('f2750000-0000-4000-8000-000000000009','f2700000-0000-4000-8000-000000000011','f2720000-0000-4000-8000-000000000009','2026-04-01',NULL,'Synthetic consent source','f2200000-0000-4000-8000-000000000004','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007'),
 ('f2750000-0000-4000-8000-000000000010','f2700000-0000-4000-8000-000000000012','f2720000-0000-4000-8000-000000000010','2026-04-01',NULL,'Synthetic revision source','f2200000-0000-4000-8000-000000000004','2026-04-11T00:00:00Z','f2200000-0000-4000-8000-000000000007')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_consents(id,submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,guardian_relationship,recorded_at,recorded_by,effective_from,effective_to,withdrawal_reason) VALUES
 ('f2760000-0000-4000-8000-000000000001','f2730000-0000-4000-8000-000000000005','household',NULL,'granted','f2500000-0000-4000-8000-000000000001','Synthetic Household Signer',NULL,'2025-10-12T00:00:00Z','f2200000-0000-4000-8000-000000000008','2025-10-12',NULL,NULL),
 ('f2760000-0000-4000-8000-000000000002','f2730000-0000-4000-8000-000000000005','adult','f2720000-0000-4000-8000-000000000001','granted','f2500000-0000-4000-8000-000000000001','Synthetic Adult',NULL,'2025-10-12T00:00:00Z','f2200000-0000-4000-8000-000000000008','2025-10-12',NULL,NULL),
 ('f2760000-0000-4000-8000-000000000003','f2730000-0000-4000-8000-000000000005','guardian','f2720000-0000-4000-8000-000000000002','granted','f2500000-0000-4000-8000-000000000001','Synthetic Guardian','parent','2025-10-12T00:00:00Z','f2200000-0000-4000-8000-000000000008','2025-10-12',NULL,NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_consents(id,submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,guardian_relationship,recorded_at,recorded_by,effective_from,effective_to,withdrawal_reason) VALUES
 ('f2760000-0000-4000-8000-000000000004','f2730000-0000-4000-8000-000000000006','adult','f2720000-0000-4000-8000-000000000004','granted','f2500000-0000-4000-8000-000000000001','Synthetic Transfer Source',NULL,'2026-04-10T00:00:00Z','f2200000-0000-4000-8000-000000000008','2026-04-01',NULL,NULL),
 ('f2760000-0000-4000-8000-000000000005','f2730000-0000-4000-8000-000000000007','adult','f2720000-0000-4000-8000-000000000005','granted','f2500000-0000-4000-8000-000000000001','Synthetic Transfer Target',NULL,'2026-04-10T00:00:00Z','f2200000-0000-4000-8000-000000000008','2026-04-01',NULL,NULL),
 ('f2760000-0000-4000-8000-000000000006','f2730000-0000-4000-8000-000000000008','adult','f2720000-0000-4000-8000-000000000006','granted','f2500000-0000-4000-8000-000000000001','Synthetic Death Race',NULL,'2026-04-10T00:00:00Z','f2200000-0000-4000-8000-000000000008','2026-04-01',NULL,NULL),
 ('f2760000-0000-4000-8000-000000000007','f2730000-0000-4000-8000-000000000009','adult','f2720000-0000-4000-8000-000000000007','granted','f2500000-0000-4000-8000-000000000001','Synthetic Merge Source',NULL,'2026-04-10T00:00:00Z','f2200000-0000-4000-8000-000000000008','2026-04-01',NULL,NULL),
 ('f2760000-0000-4000-8000-000000000008','f2730000-0000-4000-8000-000000000010','adult','f2720000-0000-4000-8000-000000000008','granted','f2500000-0000-4000-8000-000000000001','Synthetic Merge Target',NULL,'2026-04-10T00:00:00Z','f2200000-0000-4000-8000-000000000008','2026-04-01',NULL,NULL),
 ('f2760000-0000-4000-8000-000000000009','f2730000-0000-4000-8000-000000000011','adult','f2720000-0000-4000-8000-000000000009','granted','f2500000-0000-4000-8000-000000000001','Synthetic Consent Race',NULL,'2026-04-10T00:00:00Z','f2200000-0000-4000-8000-000000000008','2026-04-01',NULL,NULL),
 ('f2760000-0000-4000-8000-000000000010','f2730000-0000-4000-8000-000000000012','adult','f2720000-0000-4000-8000-000000000010','granted','f2500000-0000-4000-8000-000000000001','Synthetic Revision Race',NULL,'2026-04-10T00:00:00Z','f2200000-0000-4000-8000-000000000008','2026-04-01',NULL,NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_lifecycle_events(id,entity_type,entity_id,action,effective_on,from_status,to_status,reason,actor_id) VALUES
 ('f2770000-0000-4000-8000-000000000001','resident','f2720000-0000-4000-8000-000000000003','inactive','2025-10-01','active','inactive','Synthetic lifecycle fixture','f2200000-0000-4000-8000-000000000004') ON CONFLICT(id) DO NOTHING;

INSERT INTO public.profiling_import_batches(id,cycle_id,sitio_id,status,source_type,file_hash,template_version,household_row_count,resident_row_count,fatal_error_count,created_by) VALUES
 ('f2780000-0000-4000-8000-000000000001','f2600000-0000-4000-8000-000000000002','f2300000-0000-4000-8000-000000000001','needs_correction','csv',repeat('1',64),'phase1.synthetic.v1',1,1,1,'f2200000-0000-4000-8000-000000000008') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.profiling_import_rows(id,batch_id,sheet_name,row_number,row_key,sanitized_data) VALUES
 ('f2790000-0000-4000-8000-000000000001','f2780000-0000-4000-8000-000000000001','Households',2,'SYN-ROW-1','{"sample_reference":"SMP-SYNCOL001"}') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.profiling_import_errors(id,batch_id,import_row_id,sheet_name,row_number,field_name,message,is_fatal) VALUES
 ('f27a0000-0000-4000-8000-000000000001','f2780000-0000-4000-8000-000000000001','f2790000-0000-4000-8000-000000000001','Households',2,'income_bracket','Synthetic controlled-value error',true) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.profiling_duplicate_candidates(id,cycle_id,batch_id,candidate_type,left_reference,right_reference,confidence,status) VALUES
 ('f27b0000-0000-4000-8000-000000000001','f2600000-0000-4000-8000-000000000002','f2780000-0000-4000-8000-000000000001','household','SYN-ROW-1','SYNA-HH-000001',0.8000,'unresolved') ON CONFLICT(id) DO NOTHING;
WITH evidence(payload) AS (VALUES ('{
  "schemaVersion":"agape.profiling.aggregate.v2",
  "cycle":{"id":"f2600000-0000-4000-8000-000000000004","name":"Synthetic Completed Cycle","status":"completed","reportingDate":"2025-10-31"},
  "sample":{"method":"systematic","targetHouseholds":1,"registeredHouseholds":1,"participatingHouseholds":1,"nonparticipatingHouseholds":0,"approvedHouseholds":1,"approvedResidents":2,"coveragePercent":100,"responseRatePercent":100},
  "source":{"kind":"approved_sample","legacyExcluded":true,"evidenceSnapshotId":"f27c0000-0000-4000-8000-000000000001"},
  "official":{"totalPopulation":100,"totalHouseholds":25,"sourceName":"Synthetic official source","asOfDate":"2025-09-30","verified":true},
  "asOf":"2025-11-01T00:00:00+00:00",
  "privacy":{"suppressionThreshold":5,"complementarySuppression":true},
  "dataQuality":{"pendingPackages":0,"returnedPackages":0,"excludedPackages":0,"unresolvedDuplicates":0},
  "cells":[{"dimension":"sex","key":"not_stated","count":{"suppressed":true,"value":null,"label":"<5"}}]
}'::jsonb))
INSERT INTO public.profiling_evidence_snapshots(id,cycle_id,generated_at,generated_by,aggregate_schema_version,aggregate_data,content_hash)
SELECT 'f27c0000-0000-4000-8000-000000000001','f2600000-0000-4000-8000-000000000004','2025-11-01T00:00:00Z','f2200000-0000-4000-8000-000000000004','agape.profiling.aggregate.v2',payload,encode(extensions.digest(payload::text,'sha256'),'hex')
FROM evidence ON CONFLICT(id) DO NOTHING;

UPDATE public.profiling_runtime_settings SET mode='off',synthetic_user_ids='{}',synthetic_barangay_ids='{}',privacy_approved_at=NULL,privacy_approved_by=NULL,updated_at=now() WHERE id=true;
