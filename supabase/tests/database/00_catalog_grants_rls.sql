BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(15);

CREATE TEMP TABLE expected_secured_tables(name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO expected_secured_tables(name) VALUES
 ('profiling_households'),('profiling_residents'),('profiling_household_memberships'),('profiling_cycles'),
 ('profiling_submissions'),('profiling_resident_versions'),('profiling_consents'),('profiling_events'),
 ('profiling_import_batches'),('profiling_evidence_snapshots'),
 ('partner_entities'),('historical_programs'),('proposal_v2_profiles'),
 ('proposal_versions'),('proposal_budget_revisions'),('proposal_budget_items'),
 ('proposal_budget_funding_sources'),('proposal_budget_documents'),('program_handoffs'),
 ('program_budget_revisions'),('program_budget_items'),('program_financial_documents'),
 ('program_expenditures'),('liquidation_submissions'),('liquidation_expenditures'),
 ('ai_recommendation_reviews'),('ai_recommendation_notification_deliveries');

SELECT is(
  (SELECT count(*) FROM expected_secured_tables e WHERE to_regclass('public.' || e.name) IS NULL),
  0::bigint,
  'every required Phase 1/2 secured table exists after clean replay'
);
SELECT is(
  (SELECT count(*) FROM expected_secured_tables e JOIN pg_class c ON c.oid=to_regclass('public.' || e.name) WHERE NOT c.relrowsecurity),
  0::bigint,
  'every required Phase 1/2 table has RLS enabled'
);
SELECT is(
  (SELECT count(*) FROM expected_secured_tables e WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=e.name
  )),
  0::bigint,
  'every required Phase 1/2 table has at least one explicit policy'
);
SELECT is(
  (SELECT count(*) FROM expected_secured_tables e WHERE public.phase1_permission_module_for_table(e.name) IS NULL),
  0::bigint,
  'every required secured table is mapped to a deny-only permission module'
);
SELECT is(public.phase1_permission_module_for_table('proposal_budget_revisions'),'budgets','proposal budgets map to the budgets permission module');
SELECT is(public.phase1_permission_module_for_table('program_expenditures'),'budgets','program expenditures map to the budgets permission module');
SELECT is(public.phase1_permission_module_for_table('liquidation_submissions'),'budgets','liquidations map to the budgets permission module');

SELECT is(
  (SELECT count(*) FROM expected_secured_tables e JOIN pg_class c ON c.oid=to_regclass('public.' || e.name)
   WHERE has_table_privilege('anon',c.oid,'INSERT') OR has_table_privilege('anon',c.oid,'UPDATE') OR has_table_privilege('anon',c.oid,'DELETE')),
  0::bigint,
  'anon has no direct mutation privilege on secured tables'
);
SELECT is(
  (SELECT count(*) FROM expected_secured_tables e JOIN pg_class c ON c.oid=to_regclass('public.' || e.name)
   WHERE has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE')),
  0::bigint,
  'authenticated has no direct mutation privilege on RPC-only secured tables'
);

CREATE TEMP TABLE sensitive_functions(name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO sensitive_functions(name) VALUES
 ('phase1_create_profiling_submission'),('phase1_get_profiling_submission'),
 ('phase1_commit_profiling_import'),('phase2_configure_component'),
 ('phase2_save_proposal_graph'),('phase2_apply_proposal_action'),
 ('phase2_handoff_proposal'),('phase2_record_expenditure'),
 ('phase2_review_expenditure'),('phase2_create_liquidation'),
 ('phase3_record_recommendation_review'),('phase3_sync_recommendation_notifications');

SELECT is(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN sensitive_functions f ON f.name=p.proname
   WHERE n.nspname='public' AND EXISTS (
     SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
   )),
  0::bigint,
  'PUBLIC cannot execute sensitive Phase 1/2 functions'
);
SELECT is(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN sensitive_functions f ON f.name=p.proname
   WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE')),
  0::bigint,
  'anon cannot execute sensitive Phase 1/2 functions'
);
SELECT is(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN sensitive_functions f ON f.name=p.proname
   WHERE n.nspname='public' AND p.prosecdef AND NOT coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=%'),
  0::bigint,
  'every sensitive SECURITY DEFINER function fixes its search_path'
);
SELECT is((SELECT count(*) FROM public.phase2_component_runtime WHERE mode<>'off'),0::bigint,'all Phase 2 components default to runtime off');
SELECT is((SELECT count(*) FROM public.phase2_cutover_state WHERE write_authority<>'v1'),0::bigint,'all Phase 2 components default to V1 write authority');
SELECT is((SELECT count(*) FROM public.profiling_runtime_settings WHERE mode<>'off'),0::bigint,'profiling defaults to runtime off');

SELECT * FROM finish();
ROLLBACK;
