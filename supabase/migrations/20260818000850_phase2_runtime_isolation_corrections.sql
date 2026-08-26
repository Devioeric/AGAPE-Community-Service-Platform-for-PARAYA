-- Phase 2 dark-launch correction: fail-closed runtime/cutover state, target-bound
-- synthetic isolation, import-mode lineage, deterministic document paths, and
-- explicit historical-detail DTOs. All components finish off and V1 remains
-- authoritative. No production activation is performed here.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.phase2_component_runtime') IS NULL
     OR to_regclass('public.phase2_cutover_state') IS NULL
     OR to_regclass('public.historical_program_import_batches') IS NULL
     OR to_regclass('public.partner_entities') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 runtime isolation requires the complete Phase 2 foundation';
  END IF;
END;
$preflight$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.phase2_component_manage_capability(p_component text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE p_component
  WHEN 'partners' THEN 'partner.policy.manage'
  WHEN 'historical_programs' THEN 'historical_program.review'
  WHEN 'proposals' THEN 'proposal.catalog.manage'
  WHEN 'program_finance' THEN 'budget.category.manage'
  WHEN 'external_contact_email' THEN 'partner.policy.manage'
  ELSE NULL
 END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_component_entity_mode(p_component text,p_entity_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT CASE p_component
  WHEN 'partners' THEN (SELECT p.data_mode FROM public.partner_entities p WHERE p.id=p_entity_id)
  WHEN 'historical_programs' THEN (SELECT h.data_mode FROM public.historical_programs h WHERE h.id=p_entity_id)
  WHEN 'proposals' THEN (SELECT p.data_mode FROM public.proposal_v2_profiles p WHERE p.proposal_id=p_entity_id)
  WHEN 'program_finance' THEN (SELECT p.phase2_data_mode FROM public.programs p WHERE p.id=p_entity_id)
  WHEN 'external_contact_email' THEN (SELECT p.data_mode FROM public.partner_entities p WHERE p.id=p_entity_id)
  ELSE NULL
 END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_assert_actor_runtime(p_component text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase2_component_runtime; actor public.users;
BEGIN
  IF public.phase2_component_manage_capability(p_component) IS NULL THEN
    RAISE EXCEPTION 'unknown Phase 2 component' USING ERRCODE='22023';
  END IF;
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
DECLARE expected_mode text; actual_mode text; entity_ids uuid[];
BEGIN
  expected_mode:=public.phase2_assert_actor_runtime(p_component);
  IF p_entity_id IS NULL THEN RAISE EXCEPTION 'A target-bound runtime check is required' USING ERRCODE='42501'; END IF;
  SELECT synthetic_entity_ids INTO entity_ids FROM public.phase2_component_runtime WHERE component=p_component;
  actual_mode:=public.phase2_component_entity_mode(p_component,p_entity_id);
  IF actual_mode IS NULL OR actual_mode<>expected_mode THEN
    RAISE EXCEPTION 'target is outside the active Phase 2 data mode' USING ERRCODE='42501';
  END IF;
  IF expected_mode='synthetic' AND NOT p_entity_id=ANY(coalesce(entity_ids,'{}')) THEN
    RAISE EXCEPTION 'target is not synthetic-allowlisted' USING ERRCODE='42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_v1_writes_allowed(p_component text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT CASE WHEN p_component IN('partners','proposals')
  THEN coalesce((SELECT c.write_authority='v1' FROM public.phase2_cutover_state c WHERE c.component=p_component),false)
  ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_readiness(p_component text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase2_component_runtime; missing text[]; capability text;
BEGIN
  capability:=public.phase2_component_manage_capability(p_component);
  IF capability IS NULL THEN RAISE EXCEPTION 'unknown component' USING ERRCODE='22023'; END IF;
  IF NOT public.phase2_current_has_capability(capability) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO cfg FROM public.phase2_component_runtime WHERE component=p_component;
  IF cfg.component IS NULL THEN RAISE EXCEPTION 'runtime configuration is missing' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(required_gate ORDER BY required_gate),'{}') INTO missing
  FROM unnest(ARRAY['phase1_release','canonical_replay','jwt_rls_storage','rollback_rehearsal',p_component||'_configuration']) required_gate
  WHERE NOT EXISTS(SELECT 1 FROM public.phase2_release_attestations a WHERE a.gate_key=required_gate);
  RETURN jsonb_build_object('component',cfg.component,'mode',cfg.mode,'implementationDate',cfg.implementation_date,
    'missingAttestations',to_jsonb(missing),'readyForLive',cardinality(missing)=0,
    'writeAuthority',CASE WHEN p_component IN('partners','proposals')
      THEN (SELECT c.write_authority FROM public.phase2_cutover_state c WHERE c.component=p_component) ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_configure_component(
 p_component text,p_mode text,p_synthetic_user_ids uuid[] DEFAULT '{}',p_synthetic_entity_ids uuid[] DEFAULT '{}',
 p_implementation_date date DEFAULT NULL,p_configuration jsonb DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE missing_count integer; capability text; entity_id uuid; supplied_users uuid[]:=coalesce(p_synthetic_user_ids,'{}'); supplied_entities uuid[]:=coalesce(p_synthetic_entity_ids,'{}');
BEGIN
 capability:=public.phase2_component_manage_capability(p_component);
 IF capability IS NULL OR p_mode NOT IN('off','synthetic','live') THEN RAISE EXCEPTION 'invalid runtime request' USING ERRCODE='22023'; END IF;
 IF NOT public.phase2_current_has_capability(capability) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(coalesce(p_configuration,'{}'))<>'object' THEN RAISE EXCEPTION 'configuration must be an object' USING ERRCODE='22023'; END IF;
 IF p_mode='off' THEN supplied_users:='{}'; supplied_entities:='{}'; END IF;
 IF p_mode='synthetic' THEN
  IF cardinality(supplied_users)=0 OR cardinality(supplied_entities)=0 THEN RAISE EXCEPTION 'synthetic mode requires user and entity allowlists' USING ERRCODE='23514'; END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(supplied_users) id)<>cardinality(supplied_users)
     OR EXISTS(SELECT 1 FROM unnest(supplied_users) id WHERE NOT EXISTS(
       SELECT 1 FROM public.users u WHERE u.id=id AND u.is_synthetic_test IS TRUE AND u.status='active' AND u.is_active IS TRUE)) THEN
    RAISE EXCEPTION 'synthetic user allowlist is invalid' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(supplied_entities) id)<>cardinality(supplied_entities) THEN
    RAISE EXCEPTION 'synthetic entity allowlist contains duplicates' USING ERRCODE='23514';
  END IF;
  FOREACH entity_id IN ARRAY supplied_entities LOOP
    IF public.phase2_component_entity_mode(p_component,entity_id) IS DISTINCT FROM 'synthetic' THEN
      RAISE EXCEPTION 'synthetic entity allowlist is invalid' USING ERRCODE='23514';
    END IF;
  END LOOP;
 END IF;
 IF p_mode='live' THEN
  SELECT count(*) INTO missing_count FROM unnest(ARRAY['phase1_release','canonical_replay','jwt_rls_storage','rollback_rehearsal',p_component||'_configuration']) AS required(gate_key)
   WHERE NOT EXISTS(SELECT 1 FROM public.phase2_release_attestations a WHERE a.gate_key=required.gate_key);
  IF missing_count>0 THEN RAISE EXCEPTION 'live mode release attestations are incomplete' USING ERRCODE='42501'; END IF;
  IF p_component='historical_programs' AND p_implementation_date IS NULL THEN RAISE EXCEPTION 'implementation date is required' USING ERRCODE='22023'; END IF;
 END IF;
 UPDATE public.phase2_component_runtime SET mode=p_mode,synthetic_user_ids=supplied_users,synthetic_entity_ids=supplied_entities,
  implementation_date=p_implementation_date,configuration=coalesce(p_configuration,'{}'),updated_by=auth.uid(),updated_at=now()
 WHERE component=p_component;
 IF NOT FOUND THEN RAISE EXCEPTION 'runtime configuration is missing' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,level,metadata)
 VALUES(auth.uid(),'phase2.runtime.configure','phase2_component_runtime',p_component,'warning',jsonb_build_object('mode',p_mode));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_set_cutover_authority(p_component text,p_authority text,p_reconciliation_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE missing_count integer; component_mode text; capability text;
BEGIN
 capability:=CASE p_component WHEN 'partners' THEN 'partner.policy.manage' WHEN 'proposals' THEN 'proposal.catalog.manage' ELSE NULL END;
 IF capability IS NULL OR p_authority NOT IN('v1','v2') OR p_reconciliation_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid cutover request' USING ERRCODE='22023'; END IF;
 IF NOT public.phase2_current_has_capability(capability) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT mode INTO component_mode FROM public.phase2_component_runtime WHERE component=p_component FOR UPDATE;
 IF component_mode IS DISTINCT FROM 'off' THEN RAISE EXCEPTION 'component must be off while mutation authority changes' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.phase2_cutover_state WHERE component=p_component) THEN RAISE EXCEPTION 'cutover state is missing' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO missing_count FROM unnest(ARRAY['phase1_release','canonical_replay','jwt_rls_storage','rollback_rehearsal',p_component||'_configuration']) AS required(gate_key)
 WHERE NOT EXISTS(SELECT 1 FROM public.phase2_release_attestations a WHERE a.gate_key=required.gate_key);
 IF p_authority='v2' AND missing_count>0 THEN RAISE EXCEPTION 'cutover attestations are incomplete' USING ERRCODE='42501'; END IF;
 UPDATE public.phase2_cutover_state SET write_authority=p_authority,reconciliation_hash=p_reconciliation_hash,
  reconciled_at=now(),changed_by=auth.uid(),changed_at=now() WHERE component=p_component;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,level,metadata)
 VALUES(auth.uid(),'phase2.cutover.authority','phase2_cutover_state',p_component,'warning',jsonb_build_object('authority',p_authority,'reconciliation_hash',p_reconciliation_hash));
END;
$function$;

-- Historical import batches are immutable roots in the active data mode.
ALTER TABLE public.historical_program_import_batches ADD COLUMN IF NOT EXISTS data_mode text;
UPDATE public.historical_program_import_batches SET data_mode='live' WHERE data_mode IS NULL;
ALTER TABLE public.historical_program_import_batches ALTER COLUMN data_mode SET DEFAULT 'live';
ALTER TABLE public.historical_program_import_batches ALTER COLUMN data_mode SET NOT NULL;
ALTER TABLE public.historical_program_import_batches DROP CONSTRAINT IF EXISTS historical_program_import_batches_data_mode_check;
ALTER TABLE public.historical_program_import_batches ADD CONSTRAINT historical_program_import_batches_data_mode_check CHECK(data_mode IN('synthetic','live'));
ALTER TABLE public.historical_program_import_batches DROP CONSTRAINT IF EXISTS historical_program_import_batches_file_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS historical_import_file_actor_mode_unique ON public.historical_program_import_batches(file_hash,created_by,data_mode);

CREATE OR REPLACE FUNCTION public.phase2_guard_historical_import_batch()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; replaced public.historical_program_import_batches;
BEGIN
 SELECT mode INTO active_mode FROM public.phase2_component_runtime WHERE component='historical_programs';
 IF auth.uid() IS NULL AND current_user IN('postgres','supabase_admin') THEN
  IF NEW.data_mode NOT IN('synthetic','live') THEN RAISE EXCEPTION 'historical import batch mode is invalid' USING ERRCODE='23514'; END IF;
 ELSE
  IF active_mode NOT IN('synthetic','live') THEN RAISE EXCEPTION 'historical import component is off' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN NEW.data_mode:=active_mode; END IF;
  IF NEW.data_mode<>active_mode THEN RAISE EXCEPTION 'historical import batch mode mismatch' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.replaced_batch_id IS NOT NULL THEN
  SELECT * INTO replaced FROM public.historical_program_import_batches WHERE id=NEW.replaced_batch_id FOR UPDATE;
  IF replaced.id IS NULL OR replaced.created_by<>NEW.created_by OR replaced.data_mode<>NEW.data_mode
     OR replaced.status NOT IN('needs_correction','failed','purged') THEN
    RAISE EXCEPTION 'replacement batch lineage is invalid' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS historical_import_batch_mode_guard ON public.historical_program_import_batches;
CREATE TRIGGER historical_import_batch_mode_guard BEFORE INSERT OR UPDATE OF status ON public.historical_program_import_batches
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_historical_import_batch();

CREATE OR REPLACE FUNCTION public.phase2_guard_historical_duplicate_mode()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE batch_mode text; candidate_mode text; active_mode text;
BEGIN
 SELECT b.data_mode INTO batch_mode FROM public.historical_program_import_batches b WHERE b.id=NEW.batch_id;
 SELECT mode INTO active_mode FROM public.phase2_component_runtime WHERE component='historical_programs';
 IF batch_mode IS NULL THEN RAISE EXCEPTION 'duplicate decision batch is missing' USING ERRCODE='23514'; END IF;
 IF NOT(auth.uid() IS NULL AND current_user IN('postgres','supabase_admin'))
    AND (active_mode IS NULL OR active_mode='off' OR batch_mode<>active_mode) THEN
  RAISE EXCEPTION 'duplicate decision is outside the active import mode' USING ERRCODE='42501';
 END IF;
 IF NEW.candidate_program_id IS NOT NULL THEN
  SELECT h.data_mode INTO candidate_mode FROM public.historical_programs h WHERE h.id=NEW.candidate_program_id;
  IF candidate_mode IS DISTINCT FROM batch_mode THEN RAISE EXCEPTION 'duplicate candidate mode mismatch' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS historical_duplicate_mode_guard ON public.historical_program_duplicate_decisions;
CREATE TRIGGER historical_duplicate_mode_guard BEFORE INSERT OR UPDATE ON public.historical_program_duplicate_decisions
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_historical_duplicate_mode();

-- Responsible officers are active PARAYA users; legacy actor attribution is not rewritten.
CREATE OR REPLACE FUNCTION public.phase2_guard_responsible_officer()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE officer_id uuid;
BEGIN
 officer_id:=coalesce(nullif(to_jsonb(NEW)->>'responsible_officer_id','')::uuid,
  nullif(to_jsonb(NEW)->>'phase2_responsible_officer_id','')::uuid);
 IF officer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=officer_id
   AND u.status='active' AND u.is_active IS TRUE AND u.role IN('paraya_director','paraya_associate','paraya_researcher')) THEN
  RAISE EXCEPTION 'responsible officer must be an active PARAYA officer' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS partnership_terms_responsible_officer_guard ON public.partnership_terms;
CREATE TRIGGER partnership_terms_responsible_officer_guard BEFORE INSERT OR UPDATE OF responsible_officer_id ON public.partnership_terms
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_responsible_officer();
DROP TRIGGER IF EXISTS proposal_v2_responsible_officer_guard ON public.proposal_v2_profiles;
CREATE TRIGGER proposal_v2_responsible_officer_guard BEFORE INSERT OR UPDATE OF responsible_officer_id ON public.proposal_v2_profiles
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_responsible_officer();
DROP TRIGGER IF EXISTS programs_phase2_responsible_officer_guard ON public.programs;
CREATE TRIGGER programs_phase2_responsible_officer_guard BEFORE INSERT OR UPDATE OF phase2_responsible_officer_id ON public.programs
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_responsible_officer();

-- The authoritative V1 column still references the retired `proposals` table.
-- Preserve that historical link and route current `project_proposals` through a
-- separate additive key so neither source can silently reinterpret the other.
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS project_proposal_id uuid;
UPDATE public.programs p SET project_proposal_id=h.proposal_id
FROM public.program_handoffs h
WHERE h.program_id=p.id AND p.project_proposal_id IS NULL;
DO $block$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='programs_project_proposal_id_fkey' AND conrelid='public.programs'::regclass) THEN
  ALTER TABLE public.programs ADD CONSTRAINT programs_project_proposal_id_fkey
   FOREIGN KEY(project_proposal_id) REFERENCES public.project_proposals(id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='programs_project_proposal_id_key' AND conrelid='public.programs'::regclass) THEN
  ALTER TABLE public.programs ADD CONSTRAINT programs_project_proposal_id_key UNIQUE(project_proposal_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='programs_id_project_proposal_id_key' AND conrelid='public.programs'::regclass) THEN
  ALTER TABLE public.programs ADD CONSTRAINT programs_id_project_proposal_id_key UNIQUE(id,project_proposal_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='program_handoffs_program_proposal_fkey' AND conrelid='public.program_handoffs'::regclass) THEN
  ALTER TABLE public.program_handoffs ADD CONSTRAINT program_handoffs_program_proposal_fkey
   FOREIGN KEY(program_id,proposal_id) REFERENCES public.programs(id,project_proposal_id);
 END IF;
END $block$;

CREATE OR REPLACE FUNCTION public.phase2_route_program_proposal_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NEW.proposal_id IS NOT NULL AND NEW.project_proposal_id IS NOT NULL THEN
  RAISE EXCEPTION 'legacy and project proposal references cannot coexist' USING ERRCODE='23514';
 END IF;
 IF NEW.project_proposal_id IS NULL AND NEW.proposal_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.project_proposals q WHERE q.id=NEW.proposal_id) THEN
  IF EXISTS(SELECT 1 FROM public.proposals q WHERE q.id=NEW.proposal_id) THEN
   RAISE EXCEPTION 'ambiguous proposal reference requires reconciliation' USING ERRCODE='23514';
  END IF;
  NEW.project_proposal_id:=NEW.proposal_id;
  NEW.proposal_id:=NULL;
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS phase2_route_program_proposal_reference ON public.programs;
CREATE TRIGGER phase2_route_program_proposal_reference BEFORE INSERT OR UPDATE OF proposal_id,project_proposal_id ON public.programs
 FOR EACH ROW EXECUTE FUNCTION public.phase2_route_program_proposal_reference();

-- A V2 handoff must observe both proposal and program-finance modes.
CREATE OR REPLACE FUNCTION public.phase2_guard_handoff_program_mode()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE proposal_mode text; finance_mode text; proposal_runtime text; actor public.users; proposal_users uuid[]; finance_users uuid[]; project_proposal_id uuid;
BEGIN
 project_proposal_id:=coalesce(NEW.project_proposal_id,NEW.proposal_id);
 SELECT p.data_mode INTO proposal_mode FROM public.proposal_v2_profiles p WHERE p.proposal_id=project_proposal_id;
 IF proposal_mode IS NULL THEN RETURN NEW; END IF;
 SELECT mode,synthetic_user_ids INTO proposal_runtime,proposal_users FROM public.phase2_component_runtime WHERE component='proposals';
 SELECT mode,synthetic_user_ids INTO finance_mode,finance_users FROM public.phase2_component_runtime WHERE component='program_finance';
 IF proposal_runtime IS NULL OR finance_mode IS NULL OR proposal_runtime='off' OR finance_mode='off'
    OR proposal_runtime<>proposal_mode OR finance_mode<>proposal_mode OR NEW.phase2_data_mode<>proposal_mode THEN
  RAISE EXCEPTION 'handoff component modes do not match the approved proposal' USING ERRCODE='42501';
 END IF;
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE THEN RAISE EXCEPTION 'inactive handoff actor' USING ERRCODE='42501'; END IF;
 IF proposal_mode='synthetic' AND NOT(actor.is_synthetic_test IS TRUE AND actor.id=ANY(proposal_users) AND actor.id=ANY(finance_users)) THEN
  RAISE EXCEPTION 'handoff actor is not allowlisted for both components' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS programs_phase2_handoff_mode_guard ON public.programs;
CREATE TRIGGER programs_phase2_handoff_mode_guard BEFORE INSERT OR UPDATE OF proposal_id,project_proposal_id,phase2_data_mode ON public.programs
 FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_handoff_program_mode();

-- Document paths are a database-verifiable derivation of parent, content hash,
-- and MIME type. Direct RPC callers cannot bind a document to another root.
CREATE OR REPLACE FUNCTION public.phase2_guard_document_path()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE parent_id uuid; extension text; expected_path text; row_data jsonb:=to_jsonb(NEW);
BEGIN
 parent_id:=CASE TG_TABLE_NAME WHEN 'partnership_documents' THEN nullif(row_data->>'partner_id','')::uuid
  WHEN 'historical_program_documents' THEN nullif(row_data->>'historical_program_id','')::uuid
  WHEN 'proposal_budget_documents' THEN (SELECT r.proposal_id FROM public.proposal_budget_revisions r WHERE r.id=nullif(row_data->>'revision_id','')::uuid)
  ELSE nullif(row_data->>'program_id','')::uuid END;
 extension:=CASE row_data->>'mime_type' WHEN 'application/pdf' THEN 'pdf'
  WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx'
  WHEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' THEN 'xlsx'
  WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE NULL END;
 IF parent_id IS NULL OR extension IS NULL THEN RAISE EXCEPTION 'document parent or MIME type is invalid' USING ERRCODE='22023'; END IF;
 expected_path:=parent_id::text||'/'||(row_data->>'sha256')||'.'||extension;
 IF row_data->>'storage_path'<>expected_path THEN RAISE EXCEPTION 'document path is not server-derived' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS partnership_document_path_guard ON public.partnership_documents;
CREATE TRIGGER partnership_document_path_guard BEFORE INSERT OR UPDATE OF storage_path,sha256,mime_type,partner_id ON public.partnership_documents FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_document_path();
DROP TRIGGER IF EXISTS historical_document_path_guard ON public.historical_program_documents;
CREATE TRIGGER historical_document_path_guard BEFORE INSERT OR UPDATE OF storage_path,sha256,mime_type,historical_program_id ON public.historical_program_documents FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_document_path();
DROP TRIGGER IF EXISTS proposal_budget_document_path_guard ON public.proposal_budget_documents;
CREATE TRIGGER proposal_budget_document_path_guard BEFORE INSERT OR UPDATE OF storage_path,sha256,mime_type,revision_id ON public.proposal_budget_documents FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_document_path();
DROP TRIGGER IF EXISTS program_financial_document_path_guard ON public.program_financial_documents;
CREATE TRIGGER program_financial_document_path_guard BEFORE INSERT OR UPDATE OF storage_path,sha256,mime_type,program_id ON public.program_financial_documents FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_document_path();

CREATE OR REPLACE FUNCTION public.phase2_accept_document_risk(p_kind text,p_document_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE parent_id uuid; component text; changed integer;
BEGIN
 IF NOT public.phase2_current_has_capability('partner.policy.manage') OR length(btrim(coalesce(p_reason,'')))<20 THEN
  RAISE EXCEPTION 'Director risk acceptance and reason are required' USING ERRCODE='42501';
 END IF;
 IF p_kind='partnership' THEN SELECT d.partner_id INTO parent_id FROM public.partnership_documents d WHERE d.id=p_document_id; component:='partners';
 ELSIF p_kind='historical' THEN SELECT d.historical_program_id INTO parent_id FROM public.historical_program_documents d WHERE d.id=p_document_id; component:='historical_programs';
 ELSIF p_kind='proposal_budget' THEN SELECT r.proposal_id INTO parent_id FROM public.proposal_budget_documents d JOIN public.proposal_budget_revisions r ON r.id=d.revision_id WHERE d.id=p_document_id; component:='proposals';
 ELSIF p_kind='program_finance' THEN SELECT d.program_id INTO parent_id FROM public.program_financial_documents d WHERE d.id=p_document_id; component:='program_finance';
 ELSE RAISE EXCEPTION 'unknown document kind' USING ERRCODE='22023'; END IF;
 IF parent_id IS NULL THEN RAISE EXCEPTION 'document not found' USING ERRCODE='P0002'; END IF;
 PERFORM public.phase2_assert_runtime(component,parent_id);
 IF p_kind='partnership' THEN UPDATE public.partnership_documents SET scan_status='risk_accepted' WHERE id=p_document_id AND partner_id=parent_id AND scan_status='quarantined';
 ELSIF p_kind='historical' THEN UPDATE public.historical_program_documents SET scan_status='risk_accepted' WHERE id=p_document_id AND historical_program_id=parent_id AND scan_status='quarantined';
 ELSIF p_kind='proposal_budget' THEN UPDATE public.proposal_budget_documents d SET scan_status='risk_accepted' FROM public.proposal_budget_revisions r WHERE d.id=p_document_id AND r.id=d.revision_id AND r.proposal_id=parent_id AND d.scan_status='quarantined';
 ELSE UPDATE public.program_financial_documents SET scan_status='risk_accepted' WHERE id=p_document_id AND program_id=parent_id AND scan_status='quarantined'; END IF;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'document is already reviewed' USING ERRCODE='40001'; END IF;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,level,metadata)
 VALUES(auth.uid(),'phase2.document.risk_accept',p_kind,p_document_id::text,'warning',jsonb_build_object('reason',p_reason,'parent_id',parent_id,'component',component));
END;
$function$;

-- Allowlisted historical detail DTO; event timestamps use occurred_at.
CREATE OR REPLACE FUNCTION public.phase2_get_historical_program(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs',p_id);
 IF NOT public.phase2_current_has_capability('historical_program.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',h.id,'code',h.code,'title',h.title,'summary',h.summary,'category',h.category,
  'datePrecision',h.date_precision,'startsOn',h.starts_on,'endsOn',h.ends_on,'beneficiaryCount',h.beneficiary_count,
  'volunteerCount',h.volunteer_count,'volunteerHours',CASE WHEN h.volunteer_hours IS NULL THEN NULL ELSE h.volunteer_hours::text END,
  'budgetTotal',CASE WHEN h.budget_total IS NULL THEN NULL ELSE h.budget_total::text END,'currency',h.currency,
  'resources',h.resources,'historicalNeedDescription',h.historical_need_description,'outcomes',h.outcomes,'followUp',h.follow_up,
  'sourceType',h.source_type,'sourceNotes',h.source_notes,'status',h.status,'quality',h.quality,'rowVersion',h.row_version,
  'partners',coalesce((SELECT jsonb_agg(l.partner_id ORDER BY l.partner_id) FROM public.historical_program_partner_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'barangays',coalesce((SELECT jsonb_agg(l.barangay_id ORDER BY l.barangay_id) FROM public.historical_program_barangay_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'sdgs',coalesce((SELECT jsonb_agg(jsonb_build_object('number',s.sdg_number,'source',s.classification_source) ORDER BY s.sdg_number) FROM public.historical_program_sdg_links s WHERE s.historical_program_id=h.id),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'fromStatus',e.from_status,'toStatus',e.to_status,'quality',e.quality,'remarks',e.remarks,'occurredAt',e.occurred_at) ORDER BY e.occurred_at,e.id) FROM public.historical_program_events e WHERE e.historical_program_id=h.id),'[]'::jsonb)
 ) INTO result FROM public.historical_programs h WHERE h.id=p_id;
 IF result IS NULL THEN RAISE EXCEPTION 'historical program not found' USING ERRCODE='P0002'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'historical_program.read','historical_program',p_id::text);
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_purge_historical_imports()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE purged integer; active_mode text;
BEGIN
 SELECT mode INTO active_mode FROM public.phase2_component_runtime WHERE component='historical_programs';
 IF active_mode IS NULL OR active_mode='off' THEN RETURN 0; END IF;
 UPDATE public.historical_program_import_rows r SET sanitized_data=NULL,row_key='purged-'||r.id::text,errors='[]'
 FROM public.historical_program_import_batches b WHERE b.id=r.batch_id AND b.data_mode=active_mode
  AND b.status IN('needs_correction','failed') AND b.purge_after<=now() AND r.sanitized_data IS NOT NULL;
 GET DIAGNOSTICS purged=ROW_COUNT;
 UPDATE public.historical_program_import_batches SET status='purged'
 WHERE data_mode=active_mode AND status IN('needs_correction','failed') AND purge_after<=now();
 RETURN purged;
END;
$function$;

-- Security-definer helpers remain private; only reviewed entry points are granted.
REVOKE ALL ON FUNCTION public.phase2_component_manage_capability(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_component_entity_mode(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_assert_actor_runtime(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_assert_runtime(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_v1_writes_allowed(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_readiness(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_configure_component(text,text,uuid[],uuid[],date,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_set_cutover_authority(text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_guard_historical_import_batch() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_guard_historical_duplicate_mode() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_guard_responsible_officer() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_route_program_proposal_reference() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_guard_handoff_program_mode() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_guard_document_path() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_accept_document_risk(text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_historical_program(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_purge_historical_imports() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_v1_writes_allowed(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.phase2_get_readiness(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_configure_component(text,text,uuid[],uuid[],date,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_set_cutover_authority(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_accept_document_risk(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_historical_program(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_purge_historical_imports() TO service_role;

UPDATE public.phase2_component_runtime
SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state
SET write_authority='v1',reconciliation_hash=NULL,reconciled_at=NULL,changed_at=now();

COMMIT;
