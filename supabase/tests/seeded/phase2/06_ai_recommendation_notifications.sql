BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(19);

SELECT ok(to_regclass('public.ai_recommendation_notification_deliveries') IS NOT NULL,'recommendation notification delivery history exists');
SELECT is(public.phase1_permission_module_for_table('ai_recommendation_notification_deliveries'),'ai_assistance','recommendation notifications use the AI-assistance deny module');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.ai_recommendation_notification_deliveries'::regclass),'delivery history forces RLS');
SELECT ok(has_function_privilege('service_role','public.phase3_sync_recommendation_notifications(text,jsonb)','EXECUTE'),'service worker may execute notification sync');
SELECT ok(NOT has_function_privilege('authenticated','public.phase3_sync_recommendation_notifications(text,jsonb)','EXECUTE'),'authenticated callers cannot execute notification sync');
SELECT ok(NOT has_function_privilege('anon','public.phase3_sync_recommendation_notifications(text,jsonb)','EXECUTE'),'anon cannot execute notification sync');
SELECT ok((
  SELECT p.prosecdef AND coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=pg_catalog, public%'
  FROM pg_proc p WHERE p.oid='public.phase3_sync_recommendation_notifications(text,jsonb)'::regprocedure
),'notification sync is a fixed-search-path security definer');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT is(
  (public.phase3_sync_recommendation_notifications('synthetic',jsonb_build_array(jsonb_build_object(
    'needId','f3300000-0000-4000-8000-000000000001',
    'recommendationFingerprint',repeat('a',64),'priorityLabel','high'
  )))->>'created')::integer,
  (SELECT count(*)::integer FROM public.users u
    WHERE u.status='active' AND u.is_active AND u.is_synthetic_test
      AND u.role IN('paraya_researcher','paraya_associate')
      AND public.phase2_role_has_capability(u.role,'ai.assist')
      AND coalesce((u.permissions->>'ai_assistance')::boolean,true) IS NOT FALSE),
  'high recommendation notifies every eligible synthetic Researcher and Associate'
);
RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.ai_recommendation_notification_deliveries WHERE recommendation_fingerprint=repeat('a',64)),
  (SELECT count(*) FROM public.users u
    WHERE u.status='active' AND u.is_active AND u.is_synthetic_test
      AND u.role IN('paraya_researcher','paraya_associate')
      AND public.phase2_role_has_capability(u.role,'ai.assist')
      AND coalesce((u.permissions->>'ai_assistance')::boolean,true) IS NOT FALSE),
  'one delivery exists per eligible recipient'
);
SELECT is((SELECT count(*) FROM public.ai_recommendation_notification_deliveries WHERE recommendation_fingerprint=repeat('a',64) AND recipient_user_id='f2200000-0000-4000-8000-000000000002'),0::bigint,'Director is not alerted for an unendorsed non-critical recommendation');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT is(
  (public.phase3_sync_recommendation_notifications('synthetic',jsonb_build_array(jsonb_build_object(
    'needId','f3300000-0000-4000-8000-000000000001',
    'recommendationFingerprint',repeat('a',64),'priorityLabel','high'
  )))->>'created')::integer,
  0,
  'identical scheduled retry is idempotent'
);
RESET ROLE;

INSERT INTO public.ai_recommendation_reviews(need_id,recommendation_fingerprint,action,actor_id)
VALUES('f3300000-0000-4000-8000-000000000001',repeat('b',64),'endorsed','f2200000-0000-4000-8000-000000000004');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT is(
  (public.phase3_sync_recommendation_notifications('synthetic',jsonb_build_array(jsonb_build_object(
    'needId','f3300000-0000-4000-8000-000000000001',
    'recommendationFingerprint',repeat('b',64),'priorityLabel','high'
  )))->>'created')::integer,
  (SELECT count(*)::integer FROM public.users u
    WHERE u.status='active' AND u.is_active AND u.is_synthetic_test
      AND u.role IN('paraya_researcher','paraya_associate','paraya_director')
      AND public.phase2_role_has_capability(u.role,'ai.assist')
      AND coalesce((u.permissions->>'ai_assistance')::boolean,true) IS NOT FALSE),
  'current Researcher endorsement also alerts every eligible Director'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.ai_recommendation_notification_deliveries d JOIN public.users u ON u.id=d.recipient_user_id WHERE d.recommendation_fingerprint=repeat('b',64) AND u.role='paraya_director'),
  (SELECT count(*) FROM public.users u
    WHERE u.status='active' AND u.is_active AND u.is_synthetic_test AND u.role='paraya_director'
      AND public.phase2_role_has_capability(u.role,'ai.assist')
      AND coalesce((u.permissions->>'ai_assistance')::boolean,true) IS NOT FALSE),
  'endorsed delivery reaches each eligible Director once'
);

INSERT INTO public.ai_recommendation_reviews(need_id,recommendation_fingerprint,action,reason_code,actor_id)
VALUES('f3300000-0000-4000-8000-000000000001',repeat('c',64),'dismissed','outside_current_scope','f2200000-0000-4000-8000-000000000004');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT is(
  (public.phase3_sync_recommendation_notifications('synthetic',jsonb_build_array(jsonb_build_object(
    'needId','f3300000-0000-4000-8000-000000000001',
    'recommendationFingerprint',repeat('c',64),'priorityLabel','high'
  )))->>'skippedDismissed')::integer,
  1,
  'a current dismissed fingerprint creates no new notices'
);
SELECT throws_ok(
  $$SELECT public.phase3_sync_recommendation_notifications('synthetic','[{"needId":"f3300000-0000-4000-8000-000000000001","recommendationFingerprint":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","priorityLabel":"critical"}]'::jsonb)$$,
  '40001','recommendation priority is stale or invalid','caller cannot forge recommendation priority'
);
SELECT throws_ok(
  $$SELECT public.phase3_sync_recommendation_notifications('live','[{"needId":"f3300000-0000-4000-8000-000000000001","recommendationFingerprint":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","priorityLabel":"high"}]'::jsonb)$$,
  '42501','recommendation need is outside the active mode','synthetic root cannot be processed in live mode'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM public.ai_recommendation_notification_deliveries WHERE recommendation_fingerprint=repeat('c',64)),0::bigint,'dismissed fingerprint has no delivery rows');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE action='ai.recommendation.notifications.sync'),2::bigint,'material sync runs append aggregate audit events');
SELECT throws_ok(
  $$UPDATE public.ai_recommendation_notification_deliveries SET created_at=now() WHERE recommendation_fingerprint=repeat('a',64)$$,
  '42501','ai_recommendation_notification_deliveries is append-only','delivery history cannot be updated'
);

SELECT * FROM finish();
ROLLBACK;
