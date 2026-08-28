BEGIN;
SET LOCAL search_path=public,extensions,pg_catalog;
SELECT plan(22);

SELECT is((SELECT mode FROM public.phase6_delivery_runtime WHERE channel='email'),'off','email delivery defaults off');
SELECT is((SELECT mode FROM public.phase6_delivery_runtime WHERE channel='sms'),'off','SMS delivery defaults off');
SELECT ok(public.phase2_role_has_capability('admin','communication.provider.manage'),'Admin may configure external delivery metadata');
SELECT ok(NOT public.phase2_role_has_capability('admin','report.read'),'Admin remains outside operational reports');
SELECT is((SELECT count(*) FROM pg_class WHERE oid IN(
  'public.report_lifecycle_events'::regclass,'public.phase6_delivery_runtime'::regclass,
  'public.notification_delivery_outbox'::regclass,'public.notification_delivery_events'::regclass) AND relrowsecurity),4::bigint,'Phase 6 governed tables have RLS');
SELECT is((SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'phase6_%'
  AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')),0::bigint,'PUBLIC cannot execute Phase 6 functions');

SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000002',true);

CREATE TEMP TABLE phase67_report AS
SELECT public.phase6_create_report(
  'Synthetic governed report','2026-01-01','2026-12-31',
  'Synthetic aggregate narrative with no personal or financial document data.',
  public.phase6_reporting_aggregate('2026-01-01','2026-12-31')) AS result;

SELECT is((SELECT result->>'schema' FROM (SELECT public.phase6_reporting_aggregate('2026-01-01','2026-12-31') result) x),'agape.reporting.aggregate.v1','reporting aggregate uses the strict schema');
SELECT is((SELECT result->>'source' FROM (SELECT public.phase6_reporting_aggregate('2026-01-01','2026-12-31') result) x),'approved_operational_records','reporting aggregate declares its approved source');
SELECT is((SELECT result->>'status' FROM phase67_report),'draft','report creation returns a draft');
SELECT is((SELECT (public.phase6_transition_report((result->>'id')::uuid,1,'review',NULL))->>'status' FROM phase67_report),'reviewed','report review is version checked');
SELECT is((SELECT (public.phase6_transition_report((result->>'id')::uuid,2,'approve',NULL))->>'status' FROM phase67_report),'approved','report approval freezes the reviewed version');
SELECT is((SELECT length(r.approved_hash) FROM public.ai_reports r,phase67_report t WHERE r.id=(t.result->>'id')::uuid),64,'approved report receives a SHA-256 hash');
SELECT is((SELECT count(*) FROM public.report_lifecycle_events e,phase67_report t WHERE e.report_id=(t.result->>'id')::uuid),3::bigint,'report lifecycle appends created, reviewed, and approved events');

SELECT is((public.phase7_get_dashboard_summary()->>'schema'),'agape.dashboard.summary.v1','Director receives the canonical dashboard schema');
SELECT ok(jsonb_array_length(public.phase7_get_dashboard_summary()->'cards')>0,'Director dashboard contains aggregate cards');

INSERT INTO public.notifications(id,user_id,title,message,type,is_read,channel,action_url)
VALUES('f2f00000-0000-4000-8000-000000000001','f2200000-0000-4000-8000-000000000002','Synthetic notice','Synthetic in-app notice','alert',false,'in_app','/officer');
SELECT is((SELECT count(*) FROM public.notification_delivery_outbox WHERE notification_id='f2f00000-0000-4000-8000-000000000001'),2::bigint,'one in-app notice creates email and SMS delivery decisions');
SELECT is((SELECT count(*) FROM public.notification_delivery_outbox WHERE notification_id='f2f00000-0000-4000-8000-000000000001' AND status='suppressed'),2::bigint,'disabled providers suppress both external channels');
SELECT is((SELECT count(*) FROM public.notification_delivery_events e JOIN public.notification_delivery_outbox o ON o.id=e.outbox_id WHERE o.notification_id='f2f00000-0000-4000-8000-000000000001' AND e.event_type='suppressed'),2::bigint,'suppression decisions are immutable events');

SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000001',true);
SELECT is((public.phase7_get_system_readiness()->>'schema'),'agape.system.readiness.v1','Admin receives the canonical readiness schema');
SELECT is((public.phase7_get_system_readiness()->'databaseModes'->>'profiling'),'off','readiness confirms profiling is off');
SELECT is((public.phase7_get_system_readiness()->'mutationAuthority'->>'proposals'),'v1','readiness confirms proposal authority remains V1');

SELECT set_config('request.jwt.claim.sub','f2200000-0000-4000-8000-000000000013',true);
SELECT throws_ok('SELECT public.phase7_get_dashboard_summary()','42501','historical account only','historical identities cannot use operational dashboards');

SELECT * FROM finish();
ROLLBACK;
