-- Phase 2 completion/remediation gate.
-- Forward-only: the earlier Phase 2 migrations are treated as potentially applied.
-- All component modes remain off and V1 remains authoritative after this migration.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.phase2_component_runtime') IS NULL
     OR to_regclass('public.partner_entities') IS NULL
     OR to_regclass('public.proposal_v2_profiles') IS NULL
     OR to_regclass('public.program_expenditures') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 completion requires migrations 20260818000100 through 20260818000600';
  END IF;
END;
$preflight$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Every V2 root is explicitly synthetic or live. Existing/backfilled records are
-- live data and remain inaccessible while component runtime is off.
ALTER TABLE public.partner_entities
  ADD COLUMN IF NOT EXISTS data_mode text NOT NULL DEFAULT 'live'
  CHECK (data_mode IN ('synthetic','live'));
ALTER TABLE public.historical_programs
  ADD COLUMN IF NOT EXISTS data_mode text NOT NULL DEFAULT 'live'
  CHECK (data_mode IN ('synthetic','live'));
ALTER TABLE public.proposal_v2_profiles
  ADD COLUMN IF NOT EXISTS data_mode text NOT NULL DEFAULT 'live'
  CHECK (data_mode IN ('synthetic','live'));
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS phase2_data_mode text NOT NULL DEFAULT 'live'
  CHECK (phase2_data_mode IN ('synthetic','live'));
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS phase2_responsible_officer_id uuid REFERENCES public.users(id);

CREATE TABLE IF NOT EXISTS public.phase2_release_attestations (
  gate_key text PRIMARY KEY CHECK (gate_key IN (
    'phase1_release','canonical_replay','jwt_rls_storage','rollback_rehearsal',
    'partners_configuration','historical_programs_configuration',
    'proposals_configuration','program_finance_configuration','external_contact_email_configuration'
  )),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  environment text NOT NULL CHECK (length(btrim(environment)) BETWEEN 2 AND 80),
  notes text NOT NULL CHECK (length(btrim(notes)) BETWEEN 10 AND 2000),
  attested_by uuid REFERENCES public.users(id),
  attested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.phase2_cutover_state (
  component text PRIMARY KEY CHECK (component IN ('partners','proposals')),
  write_authority text NOT NULL DEFAULT 'v1' CHECK (write_authority IN ('v1','v2')),
  reconciliation_hash text CHECK (reconciliation_hash IS NULL OR reconciliation_hash ~ '^[0-9a-f]{64}$'),
  reconciled_at timestamptz,
  changed_by uuid REFERENCES public.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (write_authority = 'v1' OR (reconciliation_hash IS NOT NULL AND reconciled_at IS NOT NULL))
);
INSERT INTO public.phase2_cutover_state(component) VALUES ('partners'),('proposals')
ON CONFLICT (component) DO NOTHING;

ALTER TABLE public.proposal_budget_revisions ADD COLUMN IF NOT EXISTS frozen_snapshot jsonb;
ALTER TABLE public.proposal_versions ADD COLUMN IF NOT EXISTS budget_revision_id uuid REFERENCES public.proposal_budget_revisions(id);
ALTER TABLE public.partner_contact_email_outbox
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.partner_contact_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.partner_contact_email_outbox(id),
  from_status text,
  to_status text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 0,
  provider_code text,
  error_code text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.liquidation_expenditures (
  liquidation_id uuid NOT NULL REFERENCES public.liquidation_submissions(id),
  expenditure_id uuid NOT NULL REFERENCES public.program_expenditures(id),
  amount_snapshot numeric(14,2) NOT NULL CHECK (amount_snapshot > 0),
  released_at timestamptz,
  release_reason text,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (liquidation_id, expenditure_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS liquidation_expenditure_one_open_claim
  ON public.liquidation_expenditures(expenditure_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS public.phase2_storage_read_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  parent_type text NOT NULL,
  parent_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Composite ownership constraints prevent cross-proposal/program references.
CREATE UNIQUE INDEX IF NOT EXISTS proposal_versions_parent_identity ON public.proposal_versions(proposal_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS proposal_budget_revisions_parent_identity ON public.proposal_budget_revisions(proposal_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS proposal_target_areas_parent_identity ON public.proposal_target_areas(proposal_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS program_financial_documents_parent_identity ON public.program_financial_documents(program_id,id);

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proposal_v2_active_version_parent_fk') THEN
    ALTER TABLE public.proposal_v2_profiles ADD CONSTRAINT proposal_v2_active_version_parent_fk
      FOREIGN KEY(proposal_id,active_version_id) REFERENCES public.proposal_versions(proposal_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proposal_v2_active_budget_parent_fk') THEN
    ALTER TABLE public.proposal_v2_profiles ADD CONSTRAINT proposal_v2_active_budget_parent_fk
      FOREIGN KEY(proposal_id,active_budget_revision_id) REFERENCES public.proposal_budget_revisions(proposal_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proposal_need_target_parent_fk') THEN
    ALTER TABLE public.proposal_need_links_v2 ADD CONSTRAINT proposal_need_target_parent_fk
      FOREIGN KEY(proposal_id,target_area_id) REFERENCES public.proposal_target_areas(proposal_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proposal_beneficiary_target_parent_fk') THEN
    ALTER TABLE public.proposal_beneficiary_estimates ADD CONSTRAINT proposal_beneficiary_target_parent_fk
      FOREIGN KEY(proposal_id,target_area_id) REFERENCES public.proposal_target_areas(proposal_id,id);
  END IF;
END;
$constraints$;

-- Correct permission-module ordering. Budget/financial tables must never inherit
-- only the broader proposal/program deny override.
CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_table LIKE 'proposal_budget_%' OR p_table='budget_categories'
    OR p_table='budget_review_events' OR p_table LIKE 'program_budget_%'
    OR p_table LIKE 'program_financial_%' OR p_table='program_expenditures'
    OR p_table LIKE 'liquidation_%' OR p_table='program_finance_events' THEN 'budgets'
  WHEN p_table LIKE 'partner_contact%' OR p_table LIKE 'partnership_%'
    OR p_table LIKE 'partner_entit%' OR p_table='partner_type_policies'
    OR p_table='legacy_account_partner_mappings' THEN 'partnerships'
  WHEN p_table LIKE 'historical_program%' THEN 'historical_programs'
  WHEN p_table LIKE 'proposal%' OR p_table IN('project_proposals','project_templates') THEN 'proposals'
  WHEN p_table LIKE 'program%' OR p_table='activity_photos' THEN 'programs'
  WHEN p_table IN('phase2_component_runtime','phase2_release_attestations','phase2_cutover_state') THEN 'audit_logs'
  WHEN p_table='users' THEN 'user_management' WHEN p_table='audit_logs' THEN 'audit_logs'
  WHEN p_table IN('barangays','partnership_history') THEN 'partnerships'
  WHEN p_table LIKE 'volunteer%' THEN 'volunteers'
  WHEN p_table LIKE 'survey%' THEN 'surveys' WHEN p_table='community_needs' THEN 'community_needs'
  WHEN p_table='field_observations' THEN 'observations'
  WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets') THEN 'skills_assets'
  WHEN p_table='attendance' THEN 'attendance' WHEN p_table='activity_logs' THEN 'activity_logs'
  WHEN p_table LIKE 'donation%' THEN 'donations'
  WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' THEN 'impact'
  WHEN p_table LIKE 'analytics%' THEN 'analytics' WHEN p_table LIKE 'ai_report%' THEN 'reports'
  WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments') THEN 'communication'
  WHEN p_table='domain_correction_events' OR p_table LIKE 'phase2_storage_read_event%' THEN 'audit_logs'
  WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles','households','residents','household_memberships') THEN 'profiling'
  ELSE NULL
 END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_assert_actor_runtime(p_component text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase2_component_runtime; actor public.users;
BEGIN
  SELECT * INTO cfg FROM public.phase2_component_runtime WHERE component=p_component;
  IF cfg.component IS NULL THEN RAISE EXCEPTION 'Phase 2 runtime is not configured' USING ERRCODE='42501'; END IF;
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'inactive actor' USING ERRCODE='42501';
  END IF;
  IF cfg.mode='off' THEN RAISE EXCEPTION 'Phase 2 component is off' USING ERRCODE='42501'; END IF;
  IF cfg.mode='synthetic' AND NOT (actor.is_synthetic_test IS TRUE AND actor.id=ANY(cfg.synthetic_user_ids)) THEN
    RAISE EXCEPTION 'actor is not synthetic-allowlisted' USING ERRCODE='42501';
  END IF;
  RETURN cfg.mode;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_assert_runtime(p_component text,p_entity_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE expected_mode text; actual_mode text;
BEGIN
  expected_mode:=public.phase2_assert_actor_runtime(p_component);
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'A target-bound runtime check is required' USING ERRCODE='42501';
  END IF;
  actual_mode:=CASE p_component
    WHEN 'partners' THEN (SELECT data_mode FROM public.partner_entities WHERE id=p_entity_id)
    WHEN 'historical_programs' THEN (SELECT data_mode FROM public.historical_programs WHERE id=p_entity_id)
    WHEN 'proposals' THEN (SELECT data_mode FROM public.proposal_v2_profiles WHERE proposal_id=p_entity_id)
    WHEN 'program_finance' THEN (SELECT phase2_data_mode FROM public.programs WHERE id=p_entity_id)
    WHEN 'external_contact_email' THEN (SELECT p.data_mode FROM public.partner_entities p JOIN public.partner_contacts c ON c.partner_id=p.id WHERE c.id=p_entity_id)
    ELSE NULL END;
  IF actual_mode IS NULL OR actual_mode<>expected_mode THEN
    RAISE EXCEPTION 'target is outside the active Phase 2 data mode' USING ERRCODE='42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_v1_writes_allowed(p_component text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT coalesce((SELECT write_authority='v1' FROM public.phase2_cutover_state WHERE component=p_component),true);
$function$;

CREATE OR REPLACE FUNCTION public.phase2_assert_v2_write_authority(p_component text,p_mode text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE authority text;
BEGIN
 IF p_mode<>'live' THEN RETURN; END IF;
 SELECT write_authority INTO authority FROM public.phase2_cutover_state WHERE component=p_component;
 IF authority IS DISTINCT FROM 'v2' THEN RAISE EXCEPTION 'V2 is not the live mutation authority' USING ERRCODE='42501'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_readiness(p_component text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase2_component_runtime; missing text[];
BEGIN
  IF NOT (public.phase2_current_has_capability('partner.policy.manage')
    OR public.phase2_current_has_capability('historical_program.review')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO cfg FROM public.phase2_component_runtime WHERE component=p_component;
  IF cfg.component IS NULL THEN RAISE EXCEPTION 'unknown component' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(required_gate ORDER BY required_gate),'{}') INTO missing
  FROM unnest(ARRAY['phase1_release','canonical_replay','jwt_rls_storage','rollback_rehearsal',p_component||'_configuration']) required_gate
  WHERE NOT EXISTS(SELECT 1 FROM public.phase2_release_attestations a WHERE a.gate_key=required_gate);
  RETURN jsonb_build_object('component',cfg.component,'mode',cfg.mode,'implementationDate',cfg.implementation_date,
    'missingAttestations',to_jsonb(missing),'readyForLive',cardinality(missing)=0,
    'writeAuthority',(SELECT write_authority FROM public.phase2_cutover_state WHERE component=p_component));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_configure_component(
 p_component text,p_mode text,p_synthetic_user_ids uuid[] DEFAULT '{}',p_synthetic_entity_ids uuid[] DEFAULT '{}',
 p_implementation_date date DEFAULT NULL,p_configuration jsonb DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE missing_count integer;
BEGIN
 IF NOT public.phase2_current_has_capability(CASE WHEN p_component='historical_programs' THEN 'historical_program.review' ELSE 'partner.policy.manage' END)
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_mode NOT IN('off','synthetic','live') THEN RAISE EXCEPTION 'invalid mode' USING ERRCODE='22023'; END IF;
 IF p_mode='synthetic' AND cardinality(coalesce(p_synthetic_user_ids,'{}'))=0 THEN
  RAISE EXCEPTION 'synthetic mode requires allowlisted test users' USING ERRCODE='23514';
 END IF;
 IF p_mode='live' THEN
  SELECT count(*) INTO missing_count FROM unnest(ARRAY['phase1_release','canonical_replay','jwt_rls_storage','rollback_rehearsal',p_component||'_configuration']) AS required(gate_key)
   WHERE NOT EXISTS(SELECT 1 FROM public.phase2_release_attestations a WHERE a.gate_key=required.gate_key);
  IF missing_count>0 THEN RAISE EXCEPTION 'live mode release attestations are incomplete' USING ERRCODE='42501'; END IF;
  IF p_component='historical_programs' AND p_implementation_date IS NULL THEN RAISE EXCEPTION 'implementation date is required' USING ERRCODE='22023'; END IF;
 END IF;
 UPDATE public.phase2_component_runtime SET mode=p_mode,synthetic_user_ids=coalesce(p_synthetic_user_ids,'{}'),
  synthetic_entity_ids=coalesce(p_synthetic_entity_ids,'{}'),implementation_date=p_implementation_date,
  configuration=coalesce(p_configuration,'{}'),updated_by=auth.uid(),updated_at=now() WHERE component=p_component;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown component' USING ERRCODE='22023'; END IF;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,level,metadata)
 VALUES(auth.uid(),'phase2.runtime.configure','phase2_component_runtime',p_component,'warning',jsonb_build_object('mode',p_mode));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_set_cutover_authority(p_component text,p_authority text,p_reconciliation_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE missing_count integer; component_mode text;
BEGIN
 IF NOT public.phase2_current_has_capability('partner.policy.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_component NOT IN('partners','proposals') OR p_authority NOT IN('v1','v2') OR p_reconciliation_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid cutover request' USING ERRCODE='22023'; END IF;
 SELECT mode INTO component_mode FROM public.phase2_component_runtime WHERE component=p_component FOR UPDATE;
 IF component_mode IS DISTINCT FROM 'off' THEN RAISE EXCEPTION 'component must be off while mutation authority changes' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO missing_count FROM unnest(ARRAY['phase1_release','canonical_replay','jwt_rls_storage','rollback_rehearsal',p_component||'_configuration']) AS required(gate_key)
  WHERE NOT EXISTS(SELECT 1 FROM public.phase2_release_attestations a WHERE a.gate_key=required.gate_key);
 IF p_authority='v2' AND missing_count>0 THEN RAISE EXCEPTION 'cutover attestations are incomplete' USING ERRCODE='42501'; END IF;
 UPDATE public.phase2_cutover_state SET write_authority=p_authority,reconciliation_hash=p_reconciliation_hash,reconciled_at=now(),changed_by=auth.uid(),changed_at=now() WHERE component=p_component;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,level,metadata)
 VALUES(auth.uid(),'phase2.cutover.authority','phase2_cutover_state',p_component,'warning',jsonb_build_object('authority',p_authority,'reconciliation_hash',p_reconciliation_hash));
END;
$function$;

-- Finalized budget children cannot change, even through a service-role route.
CREATE OR REPLACE FUNCTION public.phase2_guard_budget_child_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE parent_status text;
DECLARE revision_id uuid;
BEGIN
  revision_id:=CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
  SELECT status INTO parent_status FROM public.proposal_budget_revisions WHERE id=revision_id;
  IF parent_status<>'draft' THEN RAISE EXCEPTION 'budget revision children are immutable after submission' USING ERRCODE='42501'; END IF;
  RETURN coalesce(NEW,OLD);
END;
$function$;
DROP TRIGGER IF EXISTS proposal_budget_items_finalized_guard ON public.proposal_budget_items;
CREATE TRIGGER proposal_budget_items_finalized_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_budget_items
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_budget_child_immutability();
DROP TRIGGER IF EXISTS proposal_budget_funding_finalized_guard ON public.proposal_budget_funding_sources;
CREATE TRIGGER proposal_budget_funding_finalized_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_budget_funding_sources
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_budget_child_immutability();
DROP TRIGGER IF EXISTS proposal_budget_documents_finalized_guard ON public.proposal_budget_documents;
CREATE TRIGGER proposal_budget_documents_finalized_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_budget_documents
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_budget_child_immutability();

CREATE OR REPLACE FUNCTION public.phase2_enforce_agreement_activation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE required boolean; policy_date date; doc public.partnership_documents;
BEGIN
 IF NEW.status<>'active' THEN RETURN NEW; END IF;
 SELECT p.agreement_required,p.effective_from INTO required,policy_date FROM public.partner_entities e
 JOIN public.partner_type_policies p ON p.entity_type=e.entity_type WHERE e.id=NEW.partner_id;
 IF NEW.agreement_document_id IS NOT NULL THEN
  SELECT * INTO doc FROM public.partnership_documents WHERE id=NEW.agreement_document_id;
  IF doc.id IS NULL OR doc.partner_id<>NEW.partner_id OR (doc.term_id IS NOT NULL AND doc.term_id<>NEW.id)
    OR doc.scan_status NOT IN('approved','risk_accepted')
    OR (doc.effective_on IS NOT NULL AND doc.effective_on>NEW.starts_on)
    OR (doc.expires_on IS NOT NULL AND doc.expires_on<NEW.starts_on) THEN
   RAISE EXCEPTION 'agreement document is not valid for this relationship' USING ERRCODE='23514';
  END IF;
 END IF;
 IF required AND NEW.starts_on>=policy_date AND NEW.agreement_document_id IS NULL
    AND (NEW.agreement_exception_reason IS NULL OR NEW.agreement_exception_due_on IS NULL
      OR NEW.agreement_exception_due_on<current_date) THEN
  RAISE EXCEPTION 'active relationship requires an approved agreement or current Director exception' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;

-- Append-only event streams introduced by this remediation.
DROP TRIGGER IF EXISTS partner_contact_email_events_immutable ON public.partner_contact_email_events;
CREATE TRIGGER partner_contact_email_events_immutable BEFORE UPDATE OR DELETE ON public.partner_contact_email_events
 FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
DROP TRIGGER IF EXISTS phase2_storage_read_events_immutable ON public.phase2_storage_read_events;
CREATE TRIGGER phase2_storage_read_events_immutable BEFORE UPDATE OR DELETE ON public.phase2_storage_read_events
 FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

-- Private, service-mediated document buckets. No ordinary authenticated object
-- access is granted; signed URLs are issued only by authorized application APIs.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('phase2-partnership-documents','phase2-partnership-documents',false,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']),
 ('phase2-historical-evidence','phase2-historical-evidence',false,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']),
 ('phase2-proposal-budget-evidence','phase2-proposal-budget-evidence',false,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']),
 ('phase2-program-financial-evidence','phase2-program-financial-evidence',false,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

DO $storage_policies$
DECLARE policy_name text;
BEGIN
 FOREACH policy_name IN ARRAY ARRAY['phase2_documents_authenticated_select','phase2_documents_authenticated_insert','phase2_documents_authenticated_update','phase2_documents_authenticated_delete'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects',policy_name);
 END LOOP;
 EXECUTE $$CREATE POLICY phase2_documents_authenticated_select ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING(bucket_id NOT IN ('phase2-partnership-documents','phase2-historical-evidence','phase2-proposal-budget-evidence','phase2-program-financial-evidence'))$$;
 EXECUTE $$CREATE POLICY phase2_documents_authenticated_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(bucket_id NOT IN ('phase2-partnership-documents','phase2-historical-evidence','phase2-proposal-budget-evidence','phase2-program-financial-evidence'))$$;
 EXECUTE $$CREATE POLICY phase2_documents_authenticated_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(bucket_id NOT IN ('phase2-partnership-documents','phase2-historical-evidence','phase2-proposal-budget-evidence','phase2-program-financial-evidence'))
  WITH CHECK(bucket_id NOT IN ('phase2-partnership-documents','phase2-historical-evidence','phase2-proposal-budget-evidence','phase2-program-financial-evidence'))$$;
 EXECUTE $$CREATE POLICY phase2_documents_authenticated_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING(bucket_id NOT IN ('phase2-partnership-documents','phase2-historical-evidence','phase2-proposal-budget-evidence','phase2-program-financial-evidence'))$$;
END;
$storage_policies$;

-- Every new table is RLS-enabled and direct writes are denied. Reads occur only
-- through fixed-shape RPCs and audited signed-URL routes.
DO $secure$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['phase2_release_attestations','phase2_cutover_state','partner_contact_email_events','liquidation_expenditures','phase2_storage_read_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('DROP POLICY IF EXISTS phase2_service_only ON public.%I',t);
  EXECUTE format('CREATE POLICY phase2_service_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false)',t);
 END LOOP;
END;
$secure$;

-- Keep every component disabled and V1 authoritative. Configuration and data are
-- retained; enabling requires evidence attestations and an explicit later action.
UPDATE public.phase2_component_runtime SET mode='off',updated_at=now();
UPDATE public.phase2_cutover_state SET write_authority='v1',changed_at=now();

REVOKE ALL ON FUNCTION public.phase2_assert_actor_runtime(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_assert_runtime(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_v1_writes_allowed(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_assert_v2_write_authority(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_readiness(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_configure_component(text,text,uuid[],uuid[],date,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_set_cutover_authority(text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_guard_budget_child_immutability() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_v1_writes_allowed(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.phase2_assert_v2_write_authority(text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.phase2_get_readiness(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_configure_component(text,text,uuid[],uuid[],date,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_set_cutover_authority(text,text,text) TO authenticated;

COMMIT;
