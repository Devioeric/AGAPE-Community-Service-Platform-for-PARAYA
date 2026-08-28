BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(16);

SELECT is((SELECT mode FROM public.phase5_integrity_runtime WHERE component='finance_integrity'),'off','Finance integrity defaults off');
SELECT is((SELECT count(*) FROM pg_class WHERE oid IN(
  'public.phase5_integrity_runtime'::regclass,
  'public.finance_integrity_proofs'::regclass,
  'public.finance_integrity_events'::regclass
) AND relrowsecurity),3::bigint,'all Finance integrity tables have RLS');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN(
  'phase5_integrity_runtime','finance_integrity_proofs','finance_integrity_events'
)),3::bigint,'all Finance integrity tables have explicit RPC-only policies');
SELECT is(public.phase1_permission_module_for_table('finance_integrity_proofs'),'financial_integrity','proofs map to the financial integrity module');
SELECT ok(public.phase2_role_has_capability('paraya_director','integrity.finance.request'),'Director may request proofs');
SELECT ok(public.phase2_role_has_capability('finance_officer','integrity.finance.request'),'Finance may request proofs');
SELECT ok(public.phase2_role_has_capability('admin','integrity.provider.manage'),'Admin may configure provider metadata');
SELECT ok(NOT public.phase2_role_has_capability('admin','integrity.finance.read'),'Admin cannot read financial proofs');
SELECT is((SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN('phase5_configure_integrity_runtime','phase5_request_finance_integrity_proof','phase5_claim_finance_integrity_proofs','phase5_finalize_finance_integrity_proof')
  AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')),
  0::bigint,'PUBLIC cannot execute sensitive Finance integrity functions');
SELECT ok(NOT has_function_privilege('anon','public.phase5_request_finance_integrity_proof(text,uuid,bigint)','EXECUTE'),'anon cannot request proofs');
SELECT ok(has_function_privilege('anon','public.phase5_verify_finance_integrity_proof(uuid)','EXECUTE'),'anon may verify an opaque proof code');
SELECT ok(has_function_privilege('authenticated','public.phase5_request_finance_integrity_proof(text,uuid,bigint)','EXECUTE'),'authenticated may call the capability-checking request RPC');
SELECT ok(has_function_privilege('service_role','public.phase5_claim_finance_integrity_proofs(integer,integer)','EXECUTE'),'service role may claim queued proofs');
SELECT is((SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='liquidation_submissions'
  AND column_name IN('integrity_schema','integrity_snapshot','integrity_hash')),3::bigint,'verified liquidations retain canonical integrity fields');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid='public.finance_integrity_events'::regclass
  AND tgname='finance_integrity_events_immutable' AND NOT tgisinternal),1::bigint,'proof events are immutable');
SELECT is((SELECT count(*) FROM public.finance_integrity_proofs),0::bigint,'no proof is created merely by installing the feature');

SELECT * FROM finish();
ROLLBACK;
