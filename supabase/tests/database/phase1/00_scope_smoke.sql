BEGIN;
SELECT plan(2);
SELECT ok(to_regclass('public.profiling_runtime_settings') IS NOT NULL,'Phase 1 runtime exists');
SELECT ok(to_regclass('public.partner_entities') IS NULL,'Phase 2 tables are absent from Phase 1 scope');
SELECT * FROM finish();
ROLLBACK;
