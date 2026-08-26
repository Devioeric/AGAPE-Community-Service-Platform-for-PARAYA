BEGIN;
SELECT plan(14);
SELECT is((SELECT count(*) FROM public.users WHERE is_synthetic_test),26::bigint,'deterministic Phase 1 identities');
SELECT is((SELECT count(DISTINCT role) FROM public.users WHERE is_synthetic_test AND role IN('admin','paraya_director','paraya_associate','paraya_researcher','finance_officer','barangay_captain','barangay_secretary','barangay_mother_leader','volunteer')),9::bigint,'all nine approved roles');
SELECT is((SELECT count(*) FROM public.users WHERE is_synthetic_test AND is_active IS FALSE),3::bigint,'pending suspended and inactive identities');
SELECT is((SELECT count(*) FROM public.users WHERE is_synthetic_test AND role IN('office','student_org','department')),3::bigint,'historical-only identities');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.users WHERE is_synthetic_test AND email NOT LIKE '%@release-gate.invalid'),'reserved invalid email domain');
SELECT is((SELECT count(*) FROM public.barangays WHERE is_synthetic_test),2::bigint,'two synthetic barangays');
SELECT is((SELECT count(*) FROM public.profiling_cycles WHERE id::text LIKE 'f2600000-%'),4::bigint,'all cycle states are seeded');
SELECT is((SELECT count(DISTINCT contact_outcome) FROM public.profiling_sample_units WHERE id::text LIKE 'f2710000-%'),5::bigint,'all sample outcomes are seeded');
SELECT is((SELECT count(DISTINCT status) FROM public.profiling_submissions WHERE id::text LIKE 'f2730000-%'),5::bigint,'all submission states are seeded');
SELECT ok(EXISTS(SELECT 1 FROM public.profiling_consents WHERE subject_type='adult') AND EXISTS(SELECT 1 FROM public.profiling_consents WHERE subject_type='guardian'),'adult and guardian consent');
SELECT ok(EXISTS(
  SELECT 1 FROM public.profiling_evidence_snapshots
  WHERE id='f27c0000-0000-4000-8000-000000000001'
    AND aggregate_data->>'schemaVersion'='agape.profiling.aggregate.v2'
    AND aggregate_data#>>'{sample,nonparticipatingHouseholds}'='0'
    AND aggregate_data#>>'{source,legacyExcluded}'='true'
),'completed evidence uses the strict de-identified aggregate contract');
SELECT ok(EXISTS(
  SELECT 1 FROM public.profiling_evidence_snapshots
  WHERE id='f27c0000-0000-4000-8000-000000000001'
    AND content_hash=encode(extensions.digest(aggregate_data::text,'sha256'),'hex')
),'completed evidence hash matches the immutable canonical payload');
SELECT is((SELECT mode FROM public.profiling_runtime_settings WHERE id=true),'off','profiling remains off');
SELECT ok(to_regclass('public.partner_entities') IS NULL,'Phase 1 fixture/test scope has no Phase 2 dependency');
SELECT * FROM finish();
ROLLBACK;
