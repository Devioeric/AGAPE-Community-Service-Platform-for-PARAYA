BEGIN;
SELECT plan(8);

SELECT is(
  (SELECT count(*) FROM public.users WHERE is_synthetic_test),
  17::bigint,
  'the reviewed fixture contains exactly its deterministic synthetic identities'
);
SELECT is(
  (SELECT count(DISTINCT role) FROM public.users WHERE is_synthetic_test AND role IN(
    'admin','paraya_director','paraya_associate','paraya_researcher','finance_officer',
    'barangay_captain','barangay_secretary','barangay_mother_leader','volunteer'
  )),
  9::bigint,
  'all nine approved login roles are represented'
);
SELECT is(
  (SELECT count(*) FROM public.users WHERE is_synthetic_test AND is_active IS FALSE AND status IN('active','pending','suspended')),
  3::bigint,
  'inactive, pending, and suspended account states are represented'
);
SELECT is(
  (SELECT count(*) FROM public.users WHERE is_synthetic_test AND role IN('office','student_org','department')),
  3::bigint,
  'all three historical-only institutional identities are represented'
);
SELECT ok(
  NOT EXISTS(SELECT 1 FROM public.users WHERE is_synthetic_test AND email NOT LIKE '%@release-gate.invalid'),
  'every fixture identity uses the reserved invalid email domain'
);
SELECT is((SELECT count(*) FROM public.barangays WHERE is_synthetic_test),2::bigint,'two synthetic barangays exist');
SELECT is((SELECT count(*) FROM public.phase2_component_runtime WHERE mode<>'off'),0::bigint,'all Phase 2 components remain off after seeding');
SELECT is((SELECT count(*) FROM public.phase2_cutover_state WHERE write_authority<>'v1'),0::bigint,'V1 remains authoritative after seeding');

SELECT * FROM finish();
ROLLBACK;
