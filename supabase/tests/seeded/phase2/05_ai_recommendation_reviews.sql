BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(19);

SELECT ok(to_regclass('public.ai_recommendation_reviews') IS NOT NULL,'recommendation review history exists');
SELECT is(public.phase1_permission_module_for_table('ai_recommendation_reviews'),'ai_assistance','recommendation reviews use the AI-assistance deny module');
SELECT ok(public.phase2_role_has_capability('paraya_director','ai.recommendation.review'),'Director can review recommendations');
SELECT ok(public.phase2_role_has_capability('paraya_researcher','ai.recommendation.review'),'Researcher can review recommendations');
SELECT ok(NOT public.phase2_role_has_capability('paraya_associate','ai.recommendation.review'),'Associate cannot finalize recommendation review');
SELECT ok(NOT public.phase2_role_has_capability('admin','ai.recommendation.review'),'Admin remains outside advisory operations');
SELECT ok(has_function_privilege('authenticated','public.phase3_record_recommendation_review(uuid,text,text,text)','EXECUTE'),'authenticated may execute the reviewed RPC');
SELECT ok(NOT has_function_privilege('anon','public.phase3_record_recommendation_review(uuid,text,text,text)','EXECUTE'),'anon cannot execute recommendation review');
SELECT is((
  SELECT count(*) FROM pg_proc p
  WHERE p.oid='public.phase3_record_recommendation_review(uuid,text,text,text)'::regprocedure
    AND EXISTS(
      SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) privilege
      WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
    )
),0::bigint,'PUBLIC cannot execute recommendation review');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000002',true);
SELECT throws_ok(
  $$SELECT public.phase3_record_recommendation_review('f3300000-0000-4000-8000-000000000001',repeat('1',64),'dismissed',NULL)$$,
  '22023','invalid recommendation review reason','dismissal requires a controlled reason'
);
SELECT lives_ok(
  $$SELECT public.phase3_record_recommendation_review('f3300000-0000-4000-8000-000000000001',repeat('1',64),'endorsed',NULL)$$,
  'Director can endorse an approved open need'
);
SELECT lives_ok(
  $$SELECT public.phase3_record_recommendation_review('f3300000-0000-4000-8000-000000000001',repeat('1',64),'endorsed',NULL)$$,
  'identical endorsement retry is idempotent'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM public.ai_recommendation_reviews WHERE need_id='f3300000-0000-4000-8000-000000000001'),1::bigint,'idempotent retry writes one review');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE action='ai.recommendation.endorsed' AND resource_id='f3300000-0000-4000-8000-000000000001'),1::bigint,'winning endorsement has one durable audit');
SELECT throws_ok(
  $$UPDATE public.ai_recommendation_reviews SET action='dismissed' WHERE need_id='f3300000-0000-4000-8000-000000000001'$$,
  '42501','ai_recommendation_reviews is append-only','recommendation reviews cannot be updated'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000004',true);
SELECT lives_ok(
  $$SELECT public.phase3_record_recommendation_review('f3300000-0000-4000-8000-000000000001',repeat('1',64),'dismissed','data_quality_concern')$$,
  'Researcher can dismiss with a controlled reason'
);
RESET ROLE;
SELECT is((SELECT count(*) FROM public.ai_recommendation_reviews WHERE need_id='f3300000-0000-4000-8000-000000000001'),2::bigint,'changed human review appends history');
SELECT is((SELECT action FROM public.ai_recommendation_reviews WHERE need_id='f3300000-0000-4000-8000-000000000001' ORDER BY event_sequence DESC LIMIT 1),'dismissed','latest review action is retained');

SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','',true);
UPDATE public.users SET permissions='{"ai_assistance":false}' WHERE id='f2200000-0000-4000-8000-000000000004';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000004',true);
SELECT throws_ok(
  $$SELECT public.phase3_record_recommendation_review('f3300000-0000-4000-8000-000000000001',repeat('2',64),'endorsed',NULL)$$,
  '42501','forbidden','deny-only AI override removes recommendation review'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
