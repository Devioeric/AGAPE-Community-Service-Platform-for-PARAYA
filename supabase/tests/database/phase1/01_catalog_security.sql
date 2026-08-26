BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(13);

CREATE TEMP TABLE phase1_application_tables AS
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r','p')
  AND c.relname <> 'spatial_ref_sys';

SELECT ok((SELECT count(*) > 0 FROM phase1_application_tables),'application table catalog is not empty');
SELECT is((SELECT count(*) FROM phase1_application_tables t JOIN pg_class c ON c.oid=to_regclass('public.'||t.table_name) WHERE NOT c.relrowsecurity),0::bigint,'every application table has RLS enabled');
SELECT is((SELECT count(*) FROM phase1_application_tables t WHERE public.phase1_permission_module_for_table(t.table_name) IS NULL),0::bigint,'every application table has a permission-module mapping');
SELECT diag('unsafe SECURITY DEFINER search_path: '||p.oid::regprocedure::text)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef AND NOT coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=%';
SELECT is((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND NOT coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=%'),0::bigint,'every SECURITY DEFINER function fixes search_path');
SELECT is((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'phase1_%' AND has_function_privilege('anon',p.oid,'EXECUTE')),0::bigint,'anon cannot execute Phase 1 functions');
SELECT is((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'phase1_%' AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')),0::bigint,'PUBLIC cannot execute Phase 1 functions');
SELECT is((SELECT count(*) FROM public.profiling_runtime_settings WHERE mode <> 'off'),0::bigint,'profiling runtime defaults off');
SELECT ok(to_regprocedure('public.phase1_current_has_capability(text)') IS NOT NULL,'canonical capability resolver exists');
SELECT ok(to_regprocedure('public.phase1_permission_module_for_table(text)') IS NOT NULL,'table permission resolver exists');
SELECT ok(to_regprocedure('public.phase0_current_invite_can_complete()') IS NOT NULL,'narrow invitation-completion proof exists');
SELECT ok(has_function_privilege('authenticated','public.phase0_current_invite_can_complete()','EXECUTE'),'authenticated invite session may call the narrow proof');
SELECT ok(NOT has_function_privilege('anon','public.phase0_current_invite_can_complete()','EXECUTE'),'anonymous callers cannot execute the invitation proof');
SELECT diag('Admin operational policy: '||schemaname||'.'||tablename||'.'||policyname)
FROM pg_policies WHERE schemaname='public'
  AND public.phase1_permission_module_for_table(tablename) NOT IN('audit_logs','user_management')
  AND (qual ILIKE '%role = ''admin''%' OR with_check ILIKE '%role = ''admin''%');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public'
  AND public.phase1_permission_module_for_table(tablename) NOT IN('audit_logs','user_management')
  AND (qual ILIKE '%role = ''admin''%' OR with_check ILIKE '%role = ''admin''%')),0::bigint,'policies do not grant Admin operational roaming');

SELECT * FROM finish();
ROLLBACK;
