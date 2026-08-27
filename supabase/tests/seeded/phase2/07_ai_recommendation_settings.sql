BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(14);

SELECT ok(to_regclass('public.ai_recommendation_settings') IS NOT NULL,'recommendation settings exist');
SELECT is(public.phase1_permission_module_for_table('ai_recommendation_settings'),'ai_assistance','settings use the AI-assistance deny module');
SELECT is((SELECT sufficient_coverage_percent FROM public.ai_recommendation_settings WHERE id),80::smallint,'initial sufficient-coverage threshold is 80 percent');
SELECT is((SELECT row_version FROM public.ai_recommendation_settings WHERE id),1::bigint,'initial settings version is one');
SELECT ok(public.phase2_role_has_capability('paraya_director','ai.recommendation.configure'),'Director can configure recommendation settings');
SELECT ok(NOT public.phase2_role_has_capability('paraya_researcher','ai.recommendation.configure'),'Researcher cannot configure recommendation settings');
SELECT ok(has_function_privilege('authenticated','public.phase3_update_recommendation_settings(integer,bigint)','EXECUTE'),'authenticated may execute the guarded settings RPC');
SELECT ok(NOT has_function_privilege('anon','public.phase3_update_recommendation_settings(integer,bigint)','EXECUTE'),'anon cannot execute the settings RPC');
SELECT is((SELECT count(*) FROM pg_proc p WHERE p.oid='public.phase3_update_recommendation_settings(integer,bigint)'::regprocedure AND EXISTS(
  SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) privilege
  WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
)),0::bigint,'PUBLIC cannot execute the settings RPC');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000002',true);
SELECT lives_ok(
  $$SELECT public.phase3_update_recommendation_settings(85,1)$$,
  'Director can update the threshold with the current version'
);
SELECT throws_ok(
  $$SELECT public.phase3_update_recommendation_settings(90,1)$$,
  '40001','stale recommendation settings version','stale settings writes fail'
);
SELECT throws_ok(
  $$SELECT public.phase3_update_recommendation_settings(101,2)$$,
  '22023','invalid recommendation settings','out-of-range settings fail'
);
RESET ROLE;

SELECT is((SELECT sufficient_coverage_percent FROM public.ai_recommendation_settings WHERE id),85::smallint,'winning threshold is retained');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE action='ai.recommendation.settings.updated'),1::bigint,'winning update has one audit event');

SELECT * FROM finish();
ROLLBACK;
