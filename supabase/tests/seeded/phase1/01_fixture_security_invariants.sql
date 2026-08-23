BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(8);

SELECT is((SELECT count(*) FROM public.users WHERE email LIKE '%@release-gate.invalid' AND NOT is_synthetic_test),0::bigint,'all reserved identities are synthetic');
SELECT is((SELECT count(*) FROM public.users WHERE role='admin' AND is_synthetic_test),1::bigint,'one synthetic Admin exists');
SELECT is((SELECT count(*) FROM public.users WHERE role IN ('office','student_org','department') AND is_synthetic_test),3::bigint,'three historical-only identities exist');
SELECT is((SELECT count(*) FROM public.users WHERE is_synthetic_test AND (NOT is_active OR status <> 'active')),3::bigint,'pending, suspended, and inactive fixtures exist');
SELECT ok(EXISTS(SELECT 1 FROM public.users WHERE email='deny-profiling@release-gate.invalid' AND permissions @> '{"profiling":false}'::jsonb),'profiling deny override exists');
SELECT ok(EXISTS(SELECT 1 FROM public.users WHERE email='mother-unassigned@release-gate.invalid'),'unassigned Mother Leader exists');
SELECT ok(EXISTS(SELECT 1 FROM public.users WHERE email='mother-expired@release-gate.invalid'),'expired Mother Leader exists');
SELECT is((SELECT count(*) FROM public.profiling_runtime_settings WHERE mode <> 'off'),0::bigint,'fixture restores runtime off');

SELECT * FROM finish();
ROLLBACK;
