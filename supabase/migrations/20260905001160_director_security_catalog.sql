-- Forward-only catalogue repair for retained domain evidence. This also runs in
-- the Phase 1 gate, where the optional 01150 tables do not yet exist.
BEGIN;
SET LOCAL search_path=pg_catalog,public;

CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  -- Retained domain payloads inherit their source module, not Admin audit access.
  WHEN p_table='community_need_review_events' THEN 'community_needs'
  WHEN p_table='survey_template_events' THEN 'surveys'
  WHEN p_table='report_content_versions' THEN 'reports'
  -- Preserve the latest Phase 6 mappings and the original Phase 1 legacy aliases.
  WHEN p_table IN('report_lifecycle_events','phase6_delivery_runtime','notification_delivery_events') THEN 'audit_logs'
  WHEN p_table='notification_delivery_outbox' THEN 'communication'
  WHEN p_table='phase5_integrity_runtime' OR p_table='finance_integrity_events' THEN 'audit_logs'
  WHEN p_table='finance_integrity_proofs' THEN 'financial_integrity'
  WHEN p_table='phase4_component_runtime' OR p_table='volunteer_invitation_events' THEN 'audit_logs'
  WHEN p_table LIKE 'volunteer%' OR p_table='participation_forms' THEN 'volunteers'
  WHEN p_table LIKE 'proposal_budget_%' OR p_table='budget_categories' OR p_table='budget_review_events' OR p_table LIKE 'program_budget_%' OR p_table LIKE 'program_financial_%' OR p_table='program_expenditures' OR p_table LIKE 'liquidation_%' OR p_table='program_finance_events' THEN 'budgets'
  WHEN p_table LIKE 'partner_contact%' OR p_table LIKE 'partnership_%' OR p_table LIKE 'partner_entit%' OR p_table='partner_type_policies' OR p_table='legacy_account_partner_mappings' THEN 'partnerships'
  WHEN p_table LIKE 'historical_program%' THEN 'historical_programs'
  WHEN p_table LIKE 'proposal%' OR p_table IN('project_proposals','project_templates') THEN 'proposals'
  WHEN p_table LIKE 'program%' OR p_table='activity_photos' THEN 'programs'
  WHEN p_table IN('phase2_component_runtime','phase2_release_attestations','phase2_cutover_state') THEN 'audit_logs'
  WHEN p_table='users' THEN 'user_management' WHEN p_table='audit_logs' THEN 'audit_logs'
  WHEN p_table IN('barangays','partnership_history') THEN 'partnerships' WHEN p_table LIKE 'survey%' THEN 'surveys'
  WHEN p_table='community_needs' THEN 'community_needs' WHEN p_table='field_observations' THEN 'observations'
  WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets','skill_categories') THEN 'skills_assets'
  WHEN p_table='attendance' THEN 'attendance' WHEN p_table='activity_logs' THEN 'activity_logs' WHEN p_table LIKE 'donation%' THEN 'donations'
  WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' OR p_table IN('followup_assessments','qualitative_data') THEN 'impact'
  WHEN p_table LIKE 'analytics%' THEN 'analytics' WHEN p_table LIKE 'ai_recommendation%' OR p_table='chatbot_logs' THEN 'ai_assistance' WHEN p_table LIKE 'ai_report%' THEN 'reports'
  WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments','discussion_posts','discussion_replies') THEN 'communication'
  WHEN p_table IN('domain_correction_events','system_backups') OR p_table LIKE 'phase2_storage_read_event%' THEN 'audit_logs'
  WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles','households','residents','household_memberships') THEN 'profiling'
  ELSE NULL END;
$function$;
REVOKE ALL ON FUNCTION public.phase1_permission_module_for_table(text) FROM PUBLIC,anon;

DO $retained_evidence_guards$
DECLARE table_name text; module_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['community_need_review_events','survey_template_events','report_content_versions'] LOOP
  IF to_regclass(format('public.%I',table_name)) IS NULL THEN CONTINUE; END IF;
  module_name:=public.phase1_permission_module_for_table(table_name);
  IF module_name IS NULL THEN RAISE EXCEPTION 'retained evidence module mapping is required'; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  -- Keep existing positive read/RPC boundaries. These policies only subtract.
  EXECUTE format('DROP POLICY IF EXISTS phase1_deny_override_guard ON public.%I',table_name);
  EXECUTE format('CREATE POLICY phase1_deny_override_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.phase1_current_permission_module_allowed(%L)) WITH CHECK (public.phase1_current_permission_module_allowed(%L))',table_name,module_name,module_name);
  EXECUTE format('DROP POLICY IF EXISTS phase0_active_account_guard ON public.%I',table_name);
  EXECUTE format('CREATE POLICY phase0_active_account_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.phase0_current_account_is_active())) WITH CHECK ((SELECT public.phase0_current_account_is_active()))',table_name);
  -- TRUNCATE bypasses row policies/triggers: inherited baseline grants must not
  -- permit destruction of otherwise append-only community-need review evidence.
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon',table_name);
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.%I FROM authenticated',table_name);
 END LOOP;
END;
$retained_evidence_guards$;
COMMIT;
