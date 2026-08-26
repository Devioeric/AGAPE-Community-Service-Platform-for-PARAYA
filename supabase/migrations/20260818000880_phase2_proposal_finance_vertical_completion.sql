-- Complete the Phase 2 structured-proposal, budget, frozen handoff, and
-- monitored-program-finance verticals. This is additive and forward-only.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.proposal_v2_profiles') IS NULL
     OR to_regclass('public.program_budget_revisions') IS NULL
     OR to_regclass('public.liquidation_expenditures') IS NULL
     OR to_regprocedure('public.phase2_assert_runtime(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 proposal/finance completion requires the verified Phase 2 chain';
  END IF;
END;
$preflight$;

ALTER TABLE public.proposal_beneficiary_estimates
  ADD COLUMN IF NOT EXISTS estimate_kind text,
  ADD COLUMN IF NOT EXISTS quality_metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
UPDATE public.proposal_beneficiary_estimates
SET estimate_kind=CASE WHEN evidence_snapshot_id IS NULL THEN 'manual' ELSE 'planning_cube' END
WHERE estimate_kind IS NULL;
UPDATE public.proposal_beneficiary_estimates
SET source_description='Imported legacy estimate; source was not recorded.'
WHERE evidence_snapshot_id IS NULL AND length(btrim(coalesce(source_description,'')))<10;
ALTER TABLE public.proposal_beneficiary_estimates ALTER COLUMN estimate_kind SET NOT NULL;
DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proposal_beneficiary_estimate_kind_check') THEN
    ALTER TABLE public.proposal_beneficiary_estimates ADD CONSTRAINT proposal_beneficiary_estimate_kind_check
      CHECK(estimate_kind IN('planning_cube','manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proposal_beneficiary_estimate_basis_check') THEN
    ALTER TABLE public.proposal_beneficiary_estimates ADD CONSTRAINT proposal_beneficiary_estimate_basis_check
      CHECK((estimate_kind='planning_cube' AND evidence_snapshot_id IS NOT NULL AND source_description IS NULL)
         OR (estimate_kind='manual' AND evidence_snapshot_id IS NULL AND length(btrim(coalesce(source_description,'')))>=10));
  END IF;
END;
$constraints$;

CREATE OR REPLACE FUNCTION public.phase2_set_beneficiary_estimate_kind()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
  IF NEW.estimate_kind IS NULL THEN NEW.estimate_kind:=CASE WHEN NEW.evidence_snapshot_id IS NULL THEN 'manual' ELSE 'planning_cube' END; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS proposal_beneficiary_estimate_kind_guard ON public.proposal_beneficiary_estimates;
CREATE TRIGGER proposal_beneficiary_estimate_kind_guard BEFORE INSERT ON public.proposal_beneficiary_estimates
  FOR EACH ROW EXECUTE FUNCTION public.phase2_set_beneficiary_estimate_kind();

-- Allocation revisions use the same prepare -> review -> immutable activation
-- model as proposal budgets. Existing active handoff allocations remain valid.
DO $drop_program_budget_status_check$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT c.conname FROM pg_constraint c
    WHERE c.conrelid='public.program_budget_revisions'::regclass AND c.contype='c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.program_budget_revisions DROP CONSTRAINT %I',item.conname);
  END LOOP;
END;
$drop_program_budget_status_check$;
ALTER TABLE public.program_budget_revisions
  ADD CONSTRAINT program_budget_revision_status_check CHECK(status IN('draft','submitted','returned','active','superseded')),
  ADD COLUMN IF NOT EXISTS source_revision_id uuid REFERENCES public.program_budget_revisions(id),
  ADD COLUMN IF NOT EXISTS frozen_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS canonical_hash text CHECK(canonical_hash IS NULL OR canonical_hash~'^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS program_one_editable_budget_revision
  ON public.program_budget_revisions(program_id) WHERE status IN('draft','submitted');
CREATE UNIQUE INDEX IF NOT EXISTS program_budget_revisions_parent_identity
  ON public.program_budget_revisions(program_id,id);

ALTER TABLE public.program_budget_items ADD COLUMN IF NOT EXISTS program_id uuid;
UPDATE public.program_budget_items i SET program_id=r.program_id
FROM public.program_budget_revisions r WHERE r.id=i.revision_id AND i.program_id IS NULL;
ALTER TABLE public.program_budget_items ALTER COLUMN program_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS program_budget_items_parent_identity
  ON public.program_budget_items(program_id,id);
DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='program_budget_item_revision_parent_fk') THEN
    ALTER TABLE public.program_budget_items ADD CONSTRAINT program_budget_item_revision_parent_fk
      FOREIGN KEY(program_id,revision_id) REFERENCES public.program_budget_revisions(program_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='program_expenditure_item_parent_fk') THEN
    ALTER TABLE public.program_expenditures ADD CONSTRAINT program_expenditure_item_parent_fk
      FOREIGN KEY(program_id,budget_item_id) REFERENCES public.program_budget_items(program_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='program_expenditure_receipt_parent_fk') THEN
    ALTER TABLE public.program_expenditures ADD CONSTRAINT program_expenditure_receipt_parent_fk
      FOREIGN KEY(program_id,receipt_document_id) REFERENCES public.program_financial_documents(program_id,id);
  END IF;
END;
$constraints$;

ALTER TABLE public.liquidation_expenditures ADD COLUMN IF NOT EXISTS program_id uuid;
UPDATE public.liquidation_expenditures x SET program_id=l.program_id
FROM public.liquidation_submissions l WHERE l.id=x.liquidation_id AND x.program_id IS NULL;
ALTER TABLE public.liquidation_expenditures ALTER COLUMN program_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS liquidation_submissions_parent_identity
  ON public.liquidation_submissions(program_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS program_expenditures_parent_identity
  ON public.program_expenditures(program_id,id);
DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='liquidation_claim_liquidation_parent_fk') THEN
    ALTER TABLE public.liquidation_expenditures ADD CONSTRAINT liquidation_claim_liquidation_parent_fk
      FOREIGN KEY(program_id,liquidation_id) REFERENCES public.liquidation_submissions(program_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='liquidation_claim_expenditure_parent_fk') THEN
    ALTER TABLE public.liquidation_expenditures ADD CONSTRAINT liquidation_claim_expenditure_parent_fk
      FOREIGN KEY(program_id,expenditure_id) REFERENCES public.program_expenditures(program_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proposal_workflow_version_parent_fk') THEN
    ALTER TABLE public.proposal_workflow_events_v2 ADD CONSTRAINT proposal_workflow_version_parent_fk
      FOREIGN KEY(proposal_id,proposal_version_id) REFERENCES public.proposal_versions(proposal_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proposal_workflow_budget_parent_fk') THEN
    ALTER TABLE public.proposal_workflow_events_v2 ADD CONSTRAINT proposal_workflow_budget_parent_fk
      FOREIGN KEY(proposal_id,budget_revision_id) REFERENCES public.proposal_budget_revisions(proposal_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='program_handoff_version_parent_fk') THEN
    ALTER TABLE public.program_handoffs ADD CONSTRAINT program_handoff_version_parent_fk
      FOREIGN KEY(proposal_id,proposal_version_id) REFERENCES public.proposal_versions(proposal_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='program_handoff_budget_parent_fk') THEN
    ALTER TABLE public.program_handoffs ADD CONSTRAINT program_handoff_budget_parent_fk
      FOREIGN KEY(proposal_id,budget_revision_id) REFERENCES public.proposal_budget_revisions(proposal_id,id);
  END IF;
END;
$constraints$;

ALTER TABLE public.program_finance_events
  ADD COLUMN IF NOT EXISTS allocation_revision_id uuid REFERENCES public.program_budget_revisions(id);

CREATE OR REPLACE FUNCTION public.phase2_set_liquidation_claim_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE liquidation_program uuid; expenditure_program uuid;
BEGIN
  SELECT program_id INTO liquidation_program FROM public.liquidation_submissions WHERE id=NEW.liquidation_id;
  SELECT program_id INTO expenditure_program FROM public.program_expenditures WHERE id=NEW.expenditure_id FOR SHARE;
  IF liquidation_program IS NULL OR expenditure_program IS NULL OR liquidation_program<>expenditure_program THEN
    RAISE EXCEPTION 'liquidation claim crosses program boundaries' USING ERRCODE='23514';
  END IF;
  IF NEW.program_id IS NOT NULL AND NEW.program_id<>liquidation_program THEN
    RAISE EXCEPTION 'liquidation claim program is inconsistent' USING ERRCODE='23514';
  END IF;
  NEW.program_id:=liquidation_program;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS liquidation_claim_set_parent ON public.liquidation_expenditures;
CREATE TRIGGER liquidation_claim_set_parent BEFORE INSERT ON public.liquidation_expenditures
  FOR EACH ROW EXECUTE FUNCTION public.phase2_set_liquidation_claim_parent();

CREATE OR REPLACE FUNCTION public.phase2_guard_proposal_budget_child()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE revision_id uuid; parent_status text;
BEGIN
  revision_id:=CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
  SELECT status INTO parent_status FROM public.proposal_budget_revisions WHERE id=revision_id;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'children of reviewed proposal budgets are immutable' USING ERRCODE='42501';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$function$;
DROP TRIGGER IF EXISTS proposal_budget_items_parent_guard ON public.proposal_budget_items;
CREATE TRIGGER proposal_budget_items_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_proposal_budget_child();
DROP TRIGGER IF EXISTS proposal_budget_funding_parent_guard ON public.proposal_budget_funding_sources;
CREATE TRIGGER proposal_budget_funding_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_budget_funding_sources
  FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_proposal_budget_child();
DROP TRIGGER IF EXISTS proposal_budget_documents_parent_guard ON public.proposal_budget_documents;
CREATE TRIGGER proposal_budget_documents_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_budget_documents
  FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_proposal_budget_child();

CREATE OR REPLACE FUNCTION public.phase2_set_program_budget_item_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE expected_program uuid;
BEGIN
  SELECT program_id INTO expected_program FROM public.program_budget_revisions WHERE id=NEW.revision_id;
  IF expected_program IS NULL THEN RAISE EXCEPTION 'allocation revision not found' USING ERRCODE='P0002'; END IF;
  IF NEW.program_id IS NOT NULL AND NEW.program_id<>expected_program THEN
    RAISE EXCEPTION 'allocation item is outside the selected program' USING ERRCODE='23514';
  END IF;
  NEW.program_id:=expected_program;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS program_budget_items_set_parent ON public.program_budget_items;
CREATE TRIGGER program_budget_items_set_parent BEFORE INSERT ON public.program_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.phase2_set_program_budget_item_parent();

CREATE OR REPLACE FUNCTION public.phase2_guard_program_budget_child()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE revision_id uuid:=OLD.revision_id; parent_status text;
BEGIN
  SELECT status INTO parent_status FROM public.program_budget_revisions WHERE id=revision_id;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'children of reviewed program allocations are immutable' USING ERRCODE='42501';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$function$;
DROP TRIGGER IF EXISTS program_budget_items_parent_guard ON public.program_budget_items;
CREATE TRIGGER program_budget_items_parent_guard BEFORE UPDATE OR DELETE ON public.program_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_program_budget_child();

CREATE OR REPLACE FUNCTION public.phase2_budget_snapshot(p_revision_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT jsonb_build_object(
  'schema','agape.proposal-budget.snapshot.v2',
  'revision',jsonb_build_object('id',r.id,'proposal_id',r.proposal_id,'revision_number',r.revision_number,'currency',r.currency,
    'zero_cash',r.zero_cash,'zero_cash_justification',r.zero_cash_justification,'source_revision_id',r.source_revision_id,
    'cash_total',r.cash_total::text,'in_kind_total',r.in_kind_total::text),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'category_id',i.category_id,'item_kind',i.item_kind,
    'description',i.description,'quantity',i.quantity::text,'unit',i.unit,'unit_cost',i.unit_cost::text,'amount',i.amount::text,
    'in_kind_valuation',CASE WHEN i.in_kind_valuation IS NULL THEN NULL ELSE i.in_kind_valuation::text END,'notes',i.notes,'sort_order',i.sort_order)
    ORDER BY i.sort_order,i.id) FROM public.proposal_budget_items i WHERE i.revision_id=r.id),'[]'::jsonb),
  'funding',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'source_type',f.source_type,'source_state',f.source_state,
    'partner_id',f.partner_id,'cash_value',f.cash_value::text,'in_kind_value',f.in_kind_value::text,'notes',f.notes) ORDER BY f.id)
    FROM public.proposal_budget_funding_sources f WHERE f.revision_id=r.id),'[]'::jsonb),
  'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'sha256',d.sha256,
    'mimeType',d.mime_type,'sizeBytes',d.size_bytes,'reviewState',d.scan_status) ORDER BY d.id)
    FROM public.proposal_budget_documents d WHERE d.revision_id=r.id),'[]'::jsonb)
 ) FROM public.proposal_budget_revisions r WHERE r.id=p_revision_id;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_program_budget_snapshot(p_revision_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT jsonb_build_object('schema','agape.program-budget.snapshot.v2',
  'revision',jsonb_build_object('id',r.id,'programId',r.program_id,'revisionNumber',r.revision_number,
    'sourceRevisionId',r.source_revision_id,'cashTotal',r.cash_total::text,'inKindTotal',r.in_kind_total::text),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'sourceProposalItemId',i.source_proposal_item_id,
    'categoryId',i.category_id,'kind',i.item_kind,'description',i.description,'allocatedAmount',i.allocated_amount::text,'sortOrder',i.sort_order)
    ORDER BY i.sort_order,i.id) FROM public.program_budget_items i WHERE i.revision_id=r.id),'[]'::jsonb)
 ) FROM public.program_budget_revisions r WHERE r.id=p_revision_id;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_calculate_beneficiary_estimate(
  p_category_code text,p_barangay_id uuid,p_sitio_id uuid,p_evidence_snapshot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; category public.proposal_beneficiary_categories; evidence public.profiling_evidence_snapshots;
DECLARE cycle public.profiling_cycles; cell jsonb; dimension text; category_key text; result jsonb;
BEGIN
  active_mode:=public.phase2_assert_actor_runtime('proposals');
  IF NOT (public.phase2_current_has_capability('proposal.create') OR public.phase2_current_has_capability('proposal.read')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=p_barangay_id AND b.is_synthetic_test=(active_mode='synthetic')) THEN
    RAISE EXCEPTION 'target barangay is outside the active data mode' USING ERRCODE='42501';
  END IF;
  IF p_sitio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.barangay_sitios s WHERE s.id=p_sitio_id AND s.barangay_id=p_barangay_id AND s.is_active) THEN
    RAISE EXCEPTION 'sitio does not belong to target barangay' USING ERRCODE='23514';
  END IF;
  SELECT * INTO category FROM public.proposal_beneficiary_categories WHERE code=p_category_code AND is_active;
  dimension:=category.predicate_definition->>'dimension'; category_key:=category.predicate_definition->>'key';
  IF category.code IS NULL OR category.predicate_version IS NULL OR dimension IS NULL OR category_key IS NULL
     OR NOT public.phase1_json_object_has_only(category.predicate_definition,ARRAY['dimension','key','scope']) THEN
    RAISE EXCEPTION 'beneficiary category has no fixed planning-cube predicate' USING ERRCODE='23514';
  END IF;
  SELECT e.* INTO evidence FROM public.profiling_evidence_snapshots e
  WHERE e.id=p_evidence_snapshot_id AND e.aggregate_schema_version='agape.profiling.aggregate.v2';
  IF evidence.id IS NOT NULL THEN
    SELECT c.* INTO cycle FROM public.profiling_cycles c WHERE c.id=evidence.cycle_id
      AND c.barangay_id=p_barangay_id AND c.status IN('completed','archived');
  END IF;
  IF evidence.id IS NULL OR cycle.id IS NULL THEN RAISE EXCEPTION 'compatible completed profiling evidence was not found' USING ERRCODE='23514'; END IF;
  SELECT value INTO cell FROM jsonb_array_elements(coalesce(evidence.aggregate_data->'cells','[]'::jsonb))
  WHERE value->>'dimension'=dimension AND value->>'key'=category_key LIMIT 1;
  IF cell IS NULL THEN RAISE EXCEPTION 'planning cube has no compatible category cell' USING ERRCODE='P0002'; END IF;
  result:=jsonb_build_object('schema','agape.beneficiary-estimate.v2','categoryCode',category.code,
    'predicateVersion',category.predicate_version,'target',jsonb_build_object('barangayId',p_barangay_id,'sitioId',p_sitio_id,'scope','barangay'),
    'evidenceSnapshotId',evidence.id,'calculatedCount',CASE WHEN coalesce((cell->'count'->>'suppressed')::boolean,false) THEN NULL ELSE (cell->'count'->>'value')::integer END,
    'suppressed',coalesce((cell->'count'->>'suppressed')::boolean,false),'suppressedLabel',cell->'count'->>'label',
    'source',evidence.aggregate_data->'source','sample',evidence.aggregate_data->'sample','quality',evidence.aggregate_data->'dataQuality',
    'asOfDate',coalesce(evidence.aggregate_data#>>'{cycle,reportingDate}',evidence.generated_at::date::text));
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_proposal_required_warnings(p_proposal_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT coalesce(array_agg(code ORDER BY code),'{}'::text[]) FROM (
  SELECT 'manual_beneficiary_source'::text code WHERE EXISTS(
    SELECT 1 FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=p_proposal_id AND e.estimate_kind='manual')
  UNION ALL SELECT 'beneficiary_override' WHERE EXISTS(
    SELECT 1 FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=p_proposal_id AND e.override_reason IS NOT NULL)
  UNION ALL SELECT 'stale_profiling_evidence' WHERE EXISTS(
    SELECT 1 FROM public.proposal_beneficiary_estimates e JOIN public.proposal_v2_profiles p ON p.proposal_id=e.proposal_id
    WHERE e.proposal_id=p_proposal_id AND e.evidence_snapshot_id IS NOT NULL AND e.as_of_date<p.starts_on-interval '365 days')
  UNION ALL SELECT 'need_status_changed' WHERE EXISTS(
    SELECT 1 FROM public.proposal_need_links_v2 l JOIN public.community_needs n ON n.id=l.need_id
    WHERE l.proposal_id=p_proposal_id AND (n.approval_status<>'approved' OR l.need_snapshot->>'approval_status'<>'approved'))
  UNION ALL SELECT 'partner_relationship_not_active' WHERE EXISTS(
    SELECT 1 FROM public.proposal_v2_profiles p WHERE p.proposal_id=p_proposal_id AND p.originating_partner_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM public.partnership_terms t WHERE t.partner_id=p.originating_partner_id AND t.status='active'
        AND t.starts_on<=p.starts_on AND (t.expires_on IS NULL OR t.expires_on>=p.ends_on)))
 ) warning_rows;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_proposal_snapshot(p_proposal_id uuid,p_budget_revision_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT jsonb_build_object('schema','agape.proposal.snapshot.v2',
  'proposal',(SELECT jsonb_build_object('id',q.id,'title',q.title,'description',q.rationale,'objectives',q.objectives,
    'expected_output',q.expected_output,'created_by',q.created_by) FROM public.project_proposals q WHERE q.id=p_proposal_id),
  'profile',(SELECT jsonb_build_object('proposal_id',p.proposal_id,'workflow_status',p.workflow_status,'origin_channel',p.origin_channel,
    'originating_partner_id',p.originating_partner_id,'responsible_officer_id',p.responsible_officer_id,
    'project_category_id',p.project_category_id,'starts_on',p.starts_on,'ends_on',p.ends_on,'data_mode',p.data_mode)
    FROM public.proposal_v2_profiles p WHERE p.proposal_id=p_proposal_id),
  'targets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'barangay_id',t.barangay_id,'sitio_id',t.sitio_id,'is_lead',t.is_lead)
    ORDER BY t.is_lead DESC,t.id) FROM public.proposal_target_areas t WHERE t.proposal_id=p_proposal_id),'[]'::jsonb),
  'needs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'need_id',n.need_id,'target_area_id',n.target_area_id,
    'intended_coverage',n.intended_coverage,'planned_beneficiary_count',n.planned_beneficiary_count,
    'planned_beneficiary_percentage',n.planned_beneficiary_percentage,'notes',n.notes,'need_snapshot',n.need_snapshot)
    ORDER BY n.id) FROM public.proposal_need_links_v2 n WHERE n.proposal_id=p_proposal_id),'[]'::jsonb),
  'beneficiaries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'category_code',e.category_code,'target_area_id',e.target_area_id,
    'estimate_kind',e.estimate_kind,'evidence_snapshot_id',e.evidence_snapshot_id,'calculated_count',e.calculated_count,
    'is_suppressed',e.is_suppressed,'final_count',e.final_count,'source_description',e.source_description,
    'source_metadata',e.source_metadata,'quality_metadata',e.quality_metadata,'as_of_date',e.as_of_date,'override_reason',e.override_reason)
    ORDER BY e.id) FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=p_proposal_id),'[]'::jsonb),
  'sdgs',coalesce((SELECT jsonb_agg(jsonb_build_object('number',s.sdg_number,'indicator',s.indicator) ORDER BY s.sdg_number)
    FROM public.proposal_sdg_alignment s WHERE s.proposal_id=p_proposal_id),'[]'::jsonb),
  'partners',coalesce((SELECT jsonb_agg(jsonb_build_object('partner_id',l.partner_id,'role',l.partner_role) ORDER BY l.partner_role,l.partner_id)
    FROM public.proposal_partner_links l WHERE l.proposal_id=p_proposal_id),'[]'::jsonb),
  'warnings',to_jsonb(public.phase2_proposal_required_warnings(p_proposal_id)),
  'budget',public.phase2_budget_snapshot(p_budget_revision_id));
$function$;

-- Correct the authoritative project_proposals column names while retaining the
-- old RPC only as a private implementation helper for the reviewed V2 wrapper.
CREATE OR REPLACE FUNCTION public.phase2_save_proposal_graph(p_proposal_id uuid,p_expected_version integer,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; v_proposal_id uuid; profile public.proposal_v2_profiles; budget public.proposal_budget_revisions; budget_id uuid; next_number integer;
DECLARE target jsonb; need jsonb; item jsonb; funding jsonb; category_value text; sdg_value text; target_id uuid; lead_barangay uuid; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('proposals');
 PERFORM public.phase2_assert_v2_write_authority('proposals',active_mode);
 IF NOT (public.phase2_current_has_capability('proposal.create') AND public.phase2_current_has_capability('budget.prepare')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['title','description','origin_channel','originating_partner_id','responsible_officer_id','project_category_id','starts_on','ends_on','targets','needs','beneficiary_category_codes','final_beneficiary_count','beneficiary_source_description','sdg_numbers','zero_cash','zero_cash_justification','budget_items','funding_sources']) THEN RAISE EXCEPTION 'unknown proposal graph field' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(p_payload->>'description',''))) NOT BETWEEN 1 AND 5000
  OR p_payload->>'origin_channel' NOT IN('paraya_internal','partner_document','barangay_referral') OR (p_payload->>'starts_on')::date>(p_payload->>'ends_on')::date
  OR jsonb_typeof(p_payload->'targets')<>'array' OR jsonb_array_length(p_payload->'targets')<1 OR jsonb_typeof(p_payload->'needs')<>'array'
  OR jsonb_typeof(p_payload->'budget_items')<>'array' OR jsonb_typeof(p_payload->'funding_sources')<>'array' THEN RAISE EXCEPTION 'invalid proposal graph' USING ERRCODE='22023'; END IF;
 IF p_payload->>'origin_channel'<>'paraya_internal' AND nullif(p_payload->>'originating_partner_id','') IS NULL THEN RAISE EXCEPTION 'non-internal origin requires a Partner' USING ERRCODE='23514'; END IF;
 IF nullif(p_payload->>'originating_partner_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_entities WHERE id=(p_payload->>'originating_partner_id')::uuid AND data_mode=active_mode AND lifecycle='active') THEN RAISE EXCEPTION 'originating Partner is outside the active data mode' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=(p_payload->>'responsible_officer_id')::uuid AND role IN('paraya_director','paraya_associate','paraya_researcher') AND status='active' AND is_active) THEN RAISE EXCEPTION 'responsible officer is invalid' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.proposal_project_categories WHERE id=(p_payload->>'project_category_id')::uuid AND is_active) THEN RAISE EXCEPTION 'project category is invalid' USING ERRCODE='22023'; END IF;

 IF p_proposal_id IS NULL THEN
  INSERT INTO public.project_proposals(title,rationale,status,created_by,timeline_start,timeline_end)
  VALUES(btrim(p_payload->>'title'),btrim(p_payload->>'description'),'draft',auth.uid(),(p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date) RETURNING id INTO v_proposal_id;
  INSERT INTO public.proposal_v2_profiles(proposal_id,workflow_status,origin_channel,originating_partner_id,responsible_officer_id,project_category_id,starts_on,ends_on,data_mode)
  VALUES(v_proposal_id,'draft',p_payload->>'origin_channel',nullif(p_payload->>'originating_partner_id','')::uuid,(p_payload->>'responsible_officer_id')::uuid,(p_payload->>'project_category_id')::uuid,(p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date,active_mode)
  RETURNING * INTO profile;
 ELSE
  v_proposal_id:=p_proposal_id; PERFORM public.phase2_assert_runtime('proposals',v_proposal_id);
  SELECT * INTO profile FROM public.proposal_v2_profiles p WHERE p.proposal_id=v_proposal_id FOR UPDATE;
  IF profile.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale proposal version' USING ERRCODE='40001'; END IF;
  IF profile.workflow_status NOT IN('draft','revisions_requested') THEN RAISE EXCEPTION 'proposal is not editable' USING ERRCODE='42501'; END IF;
  UPDATE public.project_proposals SET title=btrim(p_payload->>'title'),rationale=btrim(p_payload->>'description'),timeline_start=(p_payload->>'starts_on')::date,timeline_end=(p_payload->>'ends_on')::date,updated_at=now() WHERE id=v_proposal_id;
  UPDATE public.proposal_v2_profiles SET origin_channel=p_payload->>'origin_channel',originating_partner_id=nullif(p_payload->>'originating_partner_id','')::uuid,
   responsible_officer_id=(p_payload->>'responsible_officer_id')::uuid,project_category_id=(p_payload->>'project_category_id')::uuid,
   starts_on=(p_payload->>'starts_on')::date,ends_on=(p_payload->>'ends_on')::date,row_version=row_version+1,updated_at=now() WHERE proposal_v2_profiles.proposal_id=v_proposal_id RETURNING * INTO profile;
 END IF;

 DELETE FROM public.proposal_need_links_v2 n WHERE n.proposal_id=v_proposal_id;
 DELETE FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=v_proposal_id;
 DELETE FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id;
 DELETE FROM public.proposal_sdg_alignment s WHERE s.proposal_id=v_proposal_id;
 DELETE FROM public.proposal_partner_links l WHERE l.proposal_id=v_proposal_id;
 FOR target IN SELECT value FROM jsonb_array_elements(p_payload->'targets') LOOP
  IF NOT public.phase1_json_object_has_only(target,ARRAY['barangay_id','sitio_id','is_lead']) THEN RAISE EXCEPTION 'unknown target field' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=(target->>'barangay_id')::uuid AND b.is_synthetic_test=(active_mode='synthetic')) THEN RAISE EXCEPTION 'target barangay is outside the active data mode' USING ERRCODE='42501'; END IF;
  IF nullif(target->>'sitio_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.barangay_sitios s WHERE s.id=(target->>'sitio_id')::uuid AND s.barangay_id=(target->>'barangay_id')::uuid AND s.is_active) THEN RAISE EXCEPTION 'sitio does not belong to target barangay' USING ERRCODE='23514'; END IF;
  INSERT INTO public.proposal_target_areas(proposal_id,barangay_id,sitio_id,is_lead) VALUES(v_proposal_id,(target->>'barangay_id')::uuid,nullif(target->>'sitio_id','')::uuid,coalesce((target->>'is_lead')::boolean,false));
 END LOOP;
 SELECT t.barangay_id INTO lead_barangay FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id AND t.is_lead;
 IF lead_barangay IS NULL OR (SELECT count(*) FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id AND t.is_lead)<>1 THEN RAISE EXCEPTION 'exactly one lead target is required' USING ERRCODE='23514'; END IF;
 FOR need IN SELECT value FROM jsonb_array_elements(p_payload->'needs') LOOP
  IF NOT public.phase1_json_object_has_only(need,ARRAY['need_id','target_area_key','intended_coverage','planned_beneficiary_count','planned_beneficiary_percentage','notes']) THEN RAISE EXCEPTION 'unknown need field' USING ERRCODE='22023'; END IF;
  SELECT t.id INTO target_id FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id AND (t.barangay_id::text||':'||coalesce(t.sitio_id::text,'all'))=need->>'target_area_key';
  IF target_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.community_needs n JOIN public.proposal_target_areas t ON t.id=target_id WHERE n.id=(need->>'need_id')::uuid AND n.approval_status='approved' AND n.barangay_id=t.barangay_id) THEN RAISE EXCEPTION 'need is not approved for the selected target' USING ERRCODE='23514'; END IF;
  INSERT INTO public.proposal_need_links_v2(proposal_id,need_id,target_area_id,intended_coverage,planned_beneficiary_count,planned_beneficiary_percentage,notes,need_snapshot)
  SELECT v_proposal_id,n.id,target_id,need->>'intended_coverage',nullif(need->>'planned_beneficiary_count','')::int,nullif(need->>'planned_beneficiary_percentage','')::numeric,nullif(need->>'notes',''),
   jsonb_build_object('id',n.id,'title',n.need_description,'priority',n.priority_score,'approval_status',n.approval_status,'status',n.status,'category',n.category,'source',n.source,'barangay_id',n.barangay_id)
  FROM public.community_needs n WHERE n.id=(need->>'need_id')::uuid;
 END LOOP;
 FOR category_value IN SELECT jsonb_array_elements_text(p_payload->'beneficiary_category_codes') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.proposal_beneficiary_categories WHERE code=category_value AND is_active) THEN RAISE EXCEPTION 'unknown beneficiary category' USING ERRCODE='22023'; END IF;
  INSERT INTO public.proposal_beneficiary_estimates(proposal_id,category_code,target_area_id,calculated_count,is_suppressed,final_count,source_description,source_metadata,as_of_date)
  VALUES(v_proposal_id,category_value,(SELECT t.id FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id AND t.is_lead),NULL,false,(p_payload->>'final_beneficiary_count')::int,
   nullif(btrim(p_payload->>'beneficiary_source_description'),''),jsonb_build_object('kind','manual_fallback','non_additive_categories',true),current_date);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=v_proposal_id) OR length(btrim(coalesce(p_payload->>'beneficiary_source_description','')))<10 THEN RAISE EXCEPTION 'manual beneficiary count requires categories and a source description' USING ERRCODE='23514'; END IF;
 FOR sdg_value IN SELECT jsonb_array_elements_text(p_payload->'sdg_numbers') LOOP
  IF sdg_value::int NOT BETWEEN 1 AND 17 THEN RAISE EXCEPTION 'invalid SDG' USING ERRCODE='22023'; END IF;
  INSERT INTO public.proposal_sdg_alignment(proposal_id,sdg_number,indicator) VALUES(v_proposal_id,sdg_value::int,NULL) ON CONFLICT DO NOTHING;
 END LOOP;
 IF nullif(p_payload->>'originating_partner_id','') IS NOT NULL THEN INSERT INTO public.proposal_partner_links(proposal_id,partner_id,partner_role,created_by) VALUES(v_proposal_id,(p_payload->>'originating_partner_id')::uuid,'originating_proponent',auth.uid()); END IF;

 SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=profile.active_budget_revision_id FOR UPDATE;
 IF budget.id IS NULL OR budget.status<>'draft' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('proposal-budget:'||v_proposal_id::text,0));
  SELECT coalesce(max(r.revision_number),0)+1 INTO next_number FROM public.proposal_budget_revisions r WHERE r.proposal_id=v_proposal_id;
  INSERT INTO public.proposal_budget_revisions(proposal_id,revision_number,status,zero_cash,zero_cash_justification,source_revision_id,created_by)
  VALUES(v_proposal_id,next_number,'draft',coalesce((p_payload->>'zero_cash')::boolean,false),nullif(p_payload->>'zero_cash_justification',''),budget.id,auth.uid()) RETURNING id INTO budget_id;
 ELSE
  budget_id:=budget.id; DELETE FROM public.proposal_budget_items WHERE revision_id=budget_id; DELETE FROM public.proposal_budget_funding_sources WHERE revision_id=budget_id;
  UPDATE public.proposal_budget_revisions SET zero_cash=coalesce((p_payload->>'zero_cash')::boolean,false),zero_cash_justification=nullif(p_payload->>'zero_cash_justification',''),updated_at=now() WHERE id=budget_id;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'budget_items') LOOP
  IF NOT public.phase1_json_object_has_only(item,ARRAY['category_id','item_kind','description','quantity','unit','unit_cost','in_kind_valuation','notes','sort_order']) THEN RAISE EXCEPTION 'unknown budget item field' USING ERRCODE='22023'; END IF;
  IF item->>'item_kind' NOT IN('cash','in_kind') OR (item->>'quantity')::numeric<=0 OR (item->>'unit_cost')::numeric<0
    OR (item->>'item_kind'='in_kind' AND nullif(item->>'in_kind_valuation','') IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.budget_categories c WHERE c.id=(item->>'category_id')::uuid AND c.is_active)
    OR length(btrim(coalesce(item->>'description',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid budget item' USING ERRCODE='22023'; END IF;
  INSERT INTO public.proposal_budget_items(revision_id,category_id,item_kind,description,quantity,unit,unit_cost,in_kind_valuation,notes,sort_order)
  VALUES(budget_id,(item->>'category_id')::uuid,item->>'item_kind',btrim(item->>'description'),(item->>'quantity')::numeric,btrim(item->>'unit'),(item->>'unit_cost')::numeric,nullif(item->>'in_kind_valuation','')::numeric,nullif(item->>'notes',''),coalesce((item->>'sort_order')::int,0));
 END LOOP;
 FOR funding IN SELECT value FROM jsonb_array_elements(p_payload->'funding_sources') LOOP
  IF NOT public.phase1_json_object_has_only(funding,ARRAY['source_type','source_state','partner_id','cash_value','in_kind_value','notes']) THEN RAISE EXCEPTION 'unknown funding field' USING ERRCODE='22023'; END IF;
  INSERT INTO public.proposal_budget_funding_sources(revision_id,source_type,source_state,partner_id,cash_value,in_kind_value,notes)
  VALUES(budget_id,funding->>'source_type',funding->>'source_state',nullif(funding->>'partner_id','')::uuid,(funding->>'cash_value')::numeric,(funding->>'in_kind_value')::numeric,nullif(funding->>'notes',''));
 END LOOP;
 PERFORM public.phase2_recalculate_budget(budget_id);
 IF coalesce((p_payload->>'zero_cash')::boolean,false) AND NOT EXISTS(SELECT 1 FROM public.proposal_budget_items WHERE revision_id=budget_id AND item_kind='in_kind') THEN RAISE EXCEPTION 'zero-cash budget requires in-kind resources' USING ERRCODE='23514'; END IF;
 UPDATE public.proposal_v2_profiles SET active_budget_revision_id=budget_id WHERE proposal_v2_profiles.proposal_id=v_proposal_id;
 UPDATE public.project_proposals SET barangay_id=lead_barangay,target_beneficiaries=array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_payload->'beneficiary_category_codes')),', '),budget=(SELECT cash_total FROM public.proposal_budget_revisions WHERE id=budget_id),updated_at=now() WHERE id=v_proposal_id;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,CASE WHEN p_proposal_id IS NULL THEN 'proposal.v2.create' ELSE 'proposal.v2.update' END,'proposal',v_proposal_id::text,jsonb_build_object('budget_revision_id',budget_id));
 RETURN v_proposal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_save_proposal_graph_v2(p_proposal_id uuid,p_expected_version integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; normalized jsonb; estimates jsonb; estimate jsonb; computed jsonb; v_proposal_id uuid;
DECLARE target_id uuid; target public.proposal_target_areas; category_code text; final_count integer; calculated integer;
DECLARE suppressed boolean; manual_source text; override_reason text; budget public.proposal_budget_revisions; profile public.proposal_v2_profiles;
BEGIN
  active_mode:=public.phase2_assert_actor_runtime('proposals');
  IF jsonb_typeof(p_payload)<>'object' OR NOT public.phase1_json_object_has_only(p_payload,
    ARRAY['title','description','origin_channel','originating_partner_id','responsible_officer_id','project_category_id','starts_on','ends_on','targets','needs','beneficiary_category_codes','final_beneficiary_count','beneficiary_source_description','beneficiary_estimates','sdg_numbers','zero_cash','zero_cash_justification','budget_items','funding_sources']) THEN
    RAISE EXCEPTION 'unknown proposal graph field' USING ERRCODE='22023';
  END IF;
  estimates:=coalesce(p_payload->'beneficiary_estimates','[]'::jsonb);
  IF jsonb_typeof(estimates)<>'array' OR jsonb_array_length(estimates)>100 THEN RAISE EXCEPTION 'invalid beneficiary estimates' USING ERRCODE='22023'; END IF;
  normalized:=p_payload-'beneficiary_estimates';
  IF jsonb_array_length(estimates)>0 THEN
    normalized:=jsonb_set(normalized,'{beneficiary_category_codes}',
      (SELECT jsonb_agg(DISTINCT value->>'category_code') FROM jsonb_array_elements(estimates)));
    normalized:=jsonb_set(normalized,'{beneficiary_source_description}',to_jsonb(coalesce(nullif(normalized->>'beneficiary_source_description',''),'Structured beneficiary estimate record')));
  END IF;
  v_proposal_id:=public.phase2_save_proposal_graph(p_proposal_id,p_expected_version,normalized);
  IF p_proposal_id IS NULL THEN PERFORM public.phase2_register_created_synthetic_root('proposals',v_proposal_id); END IF;

  SELECT * INTO profile FROM public.proposal_v2_profiles p WHERE p.proposal_id=v_proposal_id FOR UPDATE;
  IF profile.data_mode<>active_mode THEN RAISE EXCEPTION 'proposal mode changed during save' USING ERRCODE='40001'; END IF;
  IF jsonb_array_length(estimates)>0 THEN
    DELETE FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=v_proposal_id;
    FOR estimate IN SELECT value FROM jsonb_array_elements(estimates) LOOP
      IF jsonb_typeof(estimate)<>'object' OR NOT public.phase1_json_object_has_only(estimate,
        ARRAY['category_code','target_area_key','evidence_snapshot_id','final_count','manual_source_description','override_reason']) THEN
        RAISE EXCEPTION 'unknown beneficiary estimate field' USING ERRCODE='22023';
      END IF;
      category_code:=nullif(btrim(estimate->>'category_code'),'');
      final_count:=nullif(estimate->>'final_count','')::integer;
      IF category_code IS NULL OR final_count IS NULL OR final_count<=0 OR NOT EXISTS(
        SELECT 1 FROM public.proposal_beneficiary_categories c WHERE c.code=category_code AND c.is_active) THEN
        RAISE EXCEPTION 'invalid beneficiary estimate category or final count' USING ERRCODE='22023';
      END IF;
      SELECT t.* INTO target FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id
       AND t.barangay_id::text||':'||coalesce(t.sitio_id::text,'all')=estimate->>'target_area_key';
      target_id:=target.id; IF target_id IS NULL THEN RAISE EXCEPTION 'beneficiary target is outside the proposal' USING ERRCODE='23514'; END IF;
      manual_source:=nullif(btrim(estimate->>'manual_source_description'),'');
      override_reason:=nullif(btrim(estimate->>'override_reason'),'');
      IF nullif(estimate->>'evidence_snapshot_id','') IS NULL THEN
        IF length(coalesce(manual_source,''))<10 THEN RAISE EXCEPTION 'manual beneficiary count requires a source description' USING ERRCODE='23514'; END IF;
        INSERT INTO public.proposal_beneficiary_estimates(proposal_id,category_code,target_area_id,estimate_kind,calculated_count,is_suppressed,
          final_count,source_description,source_metadata,quality_metadata,as_of_date,override_reason,override_actor_id,override_at)
        VALUES(v_proposal_id,category_code,target_id,'manual',NULL,false,final_count,manual_source,
          jsonb_build_object('kind','manual_fallback'),jsonb_build_object('reviewRequired',true),current_date,override_reason,
          CASE WHEN override_reason IS NULL THEN NULL ELSE auth.uid() END,CASE WHEN override_reason IS NULL THEN NULL ELSE now() END);
      ELSE
        computed:=public.phase2_calculate_beneficiary_estimate(category_code,target.barangay_id,target.sitio_id,(estimate->>'evidence_snapshot_id')::uuid);
        suppressed:=coalesce((computed->>'suppressed')::boolean,false);
        calculated:=nullif(computed->>'calculatedCount','')::integer;
        IF suppressed THEN RAISE EXCEPTION 'suppressed cells are unavailable; use an independently sourced manual estimate' USING ERRCODE='23514'; END IF;
        IF final_count<>calculated AND length(coalesce(override_reason,''))<10 THEN
          RAISE EXCEPTION 'beneficiary override requires a reason' USING ERRCODE='23514';
        END IF;
        INSERT INTO public.proposal_beneficiary_estimates(proposal_id,category_code,target_area_id,evidence_snapshot_id,estimate_kind,
          calculated_count,is_suppressed,final_count,source_metadata,quality_metadata,as_of_date,override_reason,override_actor_id,override_at)
        VALUES(v_proposal_id,category_code,target_id,(estimate->>'evidence_snapshot_id')::uuid,'planning_cube',calculated,false,final_count,
          jsonb_build_object('schema',computed->>'schema','predicateVersion',computed->>'predicateVersion','source',computed->'source','sample',computed->'sample'),
          coalesce(computed->'quality','{}'::jsonb),(computed->>'asOfDate')::date,override_reason,
          CASE WHEN override_reason IS NULL THEN NULL ELSE auth.uid() END,CASE WHEN override_reason IS NULL THEN NULL ELSE now() END);
      END IF;
    END LOOP;
  END IF;

  SELECT r.* INTO budget FROM public.proposal_budget_revisions r WHERE r.id=profile.active_budget_revision_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.budget_categories c JOIN public.proposal_budget_items i ON i.category_id=c.id
    WHERE i.revision_id=budget.id AND c.is_active) THEN RAISE EXCEPTION 'budget requires an active categorized item' USING ERRCODE='23514'; END IF;
  IF budget.zero_cash AND EXISTS(SELECT 1 FROM public.proposal_budget_items i WHERE i.revision_id=budget.id AND i.item_kind='cash' AND i.amount>0) THEN
    RAISE EXCEPTION 'zero-cash budget cannot contain cash items' USING ERRCODE='23514';
  END IF;
  IF NOT budget.zero_cash AND NOT EXISTS(SELECT 1 FROM public.proposal_budget_items i WHERE i.revision_id=budget.id AND i.item_kind='cash' AND i.amount>0) THEN
    RAISE EXCEPTION 'cash budget requires a cash item' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.proposal_budget_funding_sources f LEFT JOIN public.partner_entities p ON p.id=f.partner_id
    WHERE f.revision_id=budget.id AND ((f.source_type='partner_contribution' AND f.partner_id IS NULL)
      OR (f.partner_id IS NOT NULL AND (p.id IS NULL OR p.data_mode<>active_mode OR p.lifecycle<>'active')))) THEN
    RAISE EXCEPTION 'funding source Partner is missing or outside the active mode' USING ERRCODE='23514';
  END IF;
  SELECT * INTO profile FROM public.proposal_v2_profiles p WHERE p.proposal_id=v_proposal_id;
  SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=profile.active_budget_revision_id;
  RETURN jsonb_build_object('id',v_proposal_id,'rowVersion',profile.row_version,'budgetRevisionId',budget.id,'budgetRowVersion',budget.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_proposals()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; result jsonb; actor_email text;
BEGIN
  active_mode:=public.phase2_assert_actor_runtime('proposals');
  IF NOT public.phase2_current_has_capability('proposal.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'status',p.workflow_status,
    'originChannel',p.origin_channel,'originatingPartnerId',p.originating_partner_id,'responsibleOfficerId',p.responsible_officer_id,
    'startsOn',p.starts_on,'endsOn',p.ends_on,'rowVersion',p.row_version,'leadBarangayId',lead_target.barangay_id,
    'budget',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'revisionNumber',r.revision_number,
      'status',r.status,'cashTotal',r.cash_total::text,'inKindTotal',r.in_kind_total::text,'rowVersion',r.row_version) END)
    ORDER BY q.updated_at DESC,q.id),'[]'::jsonb) INTO result
  FROM public.proposal_v2_profiles p JOIN public.project_proposals q ON q.id=p.proposal_id
  LEFT JOIN public.proposal_target_areas lead_target ON lead_target.proposal_id=p.proposal_id AND lead_target.is_lead
  LEFT JOIN public.proposal_budget_revisions r ON r.id=p.active_budget_revision_id
  WHERE p.data_mode=active_mode;
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,metadata)
  VALUES(auth.uid(),actor_email,'proposal.v2.list','proposal',jsonb_build_object('data_mode',active_mode));
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_proposal_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; result jsonb; actor_email text;
BEGIN
  active_mode:=public.phase2_assert_actor_runtime('proposals');
  IF NOT public.phase2_current_has_capability('proposal.create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'partners',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'type',p.entity_type)
      ORDER BY p.name,p.id) FROM public.partner_entities p JOIN public.partner_entity_roles r ON r.partner_id=p.id AND r.role='proponent'
      WHERE p.data_mode=active_mode AND p.lifecycle='active'),'[]'::jsonb),
    'responsibleOfficers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'role',u.role) ORDER BY u.full_name,u.id)
      FROM public.users u WHERE u.status='active' AND u.is_active AND u.role IN('paraya_director','paraya_associate','paraya_researcher')
        AND (active_mode='live' OR u.is_synthetic_test)),'[]'::jsonb),
    'projectCategories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'label',c.label) ORDER BY c.label,c.id)
      FROM public.proposal_project_categories c WHERE c.is_active),'[]'::jsonb),
    'beneficiaryCategories',coalesce((SELECT jsonb_agg(jsonb_build_object('code',c.code,'label',c.label,'predicateVersion',c.predicate_version,
      'planningCubeAvailable',(c.predicate_definition?'dimension' AND c.predicate_definition?'key')) ORDER BY c.label,c.code)
      FROM public.proposal_beneficiary_categories c WHERE c.is_active),'[]'::jsonb),
    'budgetCategories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'label',c.label) ORDER BY c.label,c.id)
      FROM public.budget_categories c WHERE c.is_active),'[]'::jsonb),
    'barangays',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'sitios',coalesce((SELECT jsonb_agg(
      jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name,s.id) FROM public.barangay_sitios s WHERE s.barangay_id=b.id AND s.is_active),'[]'::jsonb))
      ORDER BY b.name,b.id) FROM public.barangays b WHERE b.is_synthetic_test=(active_mode='synthetic')),'[]'::jsonb),
    'approvedNeeds',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'barangayId',n.barangay_id,'title',n.need_description,
      'category',n.category,'priority',n.priority_score,'status',n.status,'source',n.source) ORDER BY n.barangay_id,n.priority_score DESC,n.id)
      FROM public.community_needs n JOIN public.barangays b ON b.id=n.barangay_id
      WHERE n.approval_status='approved' AND b.is_synthetic_test=(active_mode='synthetic')),'[]'::jsonb),
    'sdgs',(SELECT jsonb_agg(jsonb_build_object('number',n,'label','SDG '||n::text) ORDER BY n) FROM generate_series(1,17) n)
  ) INTO result;
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,metadata)
  VALUES(auth.uid(),actor_email,'proposal.v2.catalog.read','proposal_catalog',jsonb_build_object('data_mode',active_mode));
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; actor_email text;
BEGIN
  PERFORM public.phase2_assert_runtime('proposals',p_proposal_id);
  IF NOT public.phase2_current_has_capability('proposal.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('id',q.id,'title',q.title,'description',q.rationale,'status',p.workflow_status,
    'originChannel',p.origin_channel,'originatingPartnerId',p.originating_partner_id,'responsibleOfficerId',p.responsible_officer_id,
    'projectCategoryId',p.project_category_id,'startsOn',p.starts_on,'endsOn',p.ends_on,'rowVersion',p.row_version,
    'returnStage',p.return_stage,'requiredWarnings',to_jsonb(public.phase2_proposal_required_warnings(q.id)),
    'targets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'barangayId',t.barangay_id,'sitioId',t.sitio_id,'isLead',t.is_lead)
      ORDER BY t.is_lead DESC,t.id) FROM public.proposal_target_areas t WHERE t.proposal_id=q.id),'[]'::jsonb),
    'needs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'needId',n.need_id,'targetAreaId',n.target_area_id,
      'coverage',n.intended_coverage,'plannedCount',n.planned_beneficiary_count,'plannedPercentage',n.planned_beneficiary_percentage,
      'notes',n.notes,'snapshot',n.need_snapshot) ORDER BY n.id) FROM public.proposal_need_links_v2 n WHERE n.proposal_id=q.id),'[]'::jsonb),
    'beneficiaryEstimates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'categoryCode',e.category_code,
      'targetAreaId',e.target_area_id,'kind',e.estimate_kind,'evidenceSnapshotId',e.evidence_snapshot_id,
      'calculatedCount',e.calculated_count,'suppressed',e.is_suppressed,'finalCount',e.final_count,
      'sourceDescription',e.source_description,'sourceMetadata',e.source_metadata,'qualityMetadata',e.quality_metadata,
      'asOfDate',e.as_of_date,'overrideReason',e.override_reason) ORDER BY e.id)
      FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=q.id),'[]'::jsonb),
    'sdgs',coalesce((SELECT jsonb_agg(jsonb_build_object('number',s.sdg_number,'indicator',s.indicator) ORDER BY s.sdg_number)
      FROM public.proposal_sdg_alignment s WHERE s.proposal_id=q.id),'[]'::jsonb),
    'partners',coalesce((SELECT jsonb_agg(jsonb_build_object('partnerId',l.partner_id,'role',l.partner_role) ORDER BY l.partner_role,l.partner_id)
      FROM public.proposal_partner_links l WHERE l.proposal_id=q.id),'[]'::jsonb),
    'budget',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'proposalId',r.proposal_id,'revisionNumber',r.revision_number,
      'status',r.status,'currency',r.currency,'zeroCash',r.zero_cash,'zeroCashJustification',r.zero_cash_justification,
      'cashTotal',r.cash_total::text,'inKindTotal',r.in_kind_total::text,'canonicalHash',r.canonical_hash,'rowVersion',r.row_version,
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'categoryId',i.category_id,'kind',i.item_kind,
        'description',i.description,'quantity',i.quantity::text,'unit',i.unit,'unitCost',i.unit_cost::text,'amount',i.amount::text,
        'inKindValuation',CASE WHEN i.in_kind_valuation IS NULL THEN NULL ELSE i.in_kind_valuation::text END,'notes',i.notes,'sortOrder',i.sort_order)
        ORDER BY i.sort_order,i.id) FROM public.proposal_budget_items i WHERE i.revision_id=r.id),'[]'::jsonb),
      'fundingSources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'type',f.source_type,'state',f.source_state,
        'partnerId',f.partner_id,'cashValue',f.cash_value::text,'inKindValue',f.in_kind_value::text,'notes',f.notes) ORDER BY f.id)
        FROM public.proposal_budget_funding_sources f WHERE f.revision_id=r.id),'[]'::jsonb)) END,
    'activeVersion',(SELECT jsonb_build_object('id',v.id,'versionNumber',v.version_number,'canonicalHash',v.canonical_hash,
      'reason',v.reason,'createdAt',v.created_at) FROM public.proposal_versions v WHERE v.id=p.active_version_id),
    'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'versionNumber',v.version_number,
      'canonicalHash',v.canonical_hash,'reason',v.reason,'createdAt',v.created_at) ORDER BY v.version_number DESC)
      FROM public.proposal_versions v WHERE v.proposal_id=q.id),'[]'::jsonb),
    'workflow',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'action',w.action,'fromStatus',w.from_status,
      'toStatus',w.to_status,'proposalVersionId',w.proposal_version_id,'budgetRevisionId',w.budget_revision_id,
      'warningAcknowledgements',w.warning_acknowledgements,'remarks',w.remarks,'actorId',w.actor_id,'occurredAt',w.occurred_at)
      ORDER BY w.occurred_at,w.id) FROM public.proposal_workflow_events_v2 w WHERE w.proposal_id=q.id),'[]'::jsonb)
  ) INTO result FROM public.project_proposals q JOIN public.proposal_v2_profiles p ON p.proposal_id=q.id
  LEFT JOIN public.proposal_budget_revisions r ON r.id=p.active_budget_revision_id WHERE q.id=p_proposal_id;
  IF result IS NULL THEN RAISE EXCEPTION 'proposal not found' USING ERRCODE='P0002'; END IF;
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id)
  VALUES(auth.uid(),actor_email,'proposal.v2.read','proposal',p_proposal_id::text);
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_finance_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; actor_email text; cash_funding numeric; in_kind_funding numeric;
BEGIN
  PERFORM public.phase2_assert_runtime('proposals',p_proposal_id);
  IF NOT (public.phase2_current_has_capability('budget.read') AND public.phase2_current_has_capability('budget.review')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(sum(f.cash_value),0),coalesce(sum(f.in_kind_value),0) INTO cash_funding,in_kind_funding
  FROM public.proposal_budget_funding_sources f JOIN public.proposal_v2_profiles p ON p.active_budget_revision_id=f.revision_id
  WHERE p.proposal_id=p_proposal_id;
  SELECT jsonb_build_object('proposal',jsonb_build_object('id',q.id,'title',q.title,'status',p.workflow_status,
    'startsOn',p.starts_on,'endsOn',p.ends_on,'rowVersion',p.row_version,'responsibleOfficerId',p.responsible_officer_id,
    'requiredWarnings',to_jsonb(public.phase2_proposal_required_warnings(q.id))),
    'budget',jsonb_build_object('id',r.id,'revisionNumber',r.revision_number,'status',r.status,'currency',r.currency,
      'zeroCash',r.zero_cash,'zeroCashJustification',r.zero_cash_justification,'cashTotal',r.cash_total::text,
      'inKindTotal',r.in_kind_total::text,'fundingCashTotal',cash_funding::text,'fundingInKindTotal',in_kind_funding::text,
      'reconciled',r.cash_total=cash_funding AND r.in_kind_total=in_kind_funding,'canonicalHash',r.canonical_hash,'rowVersion',r.row_version,
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'categoryId',i.category_id,'kind',i.item_kind,
        'description',i.description,'quantity',i.quantity::text,'unit',i.unit,'unitCost',i.unit_cost::text,'amount',i.amount::text,
        'inKindValuation',CASE WHEN i.in_kind_valuation IS NULL THEN NULL ELSE i.in_kind_valuation::text END,'notes',i.notes,'sortOrder',i.sort_order)
        ORDER BY i.sort_order,i.id) FROM public.proposal_budget_items i WHERE i.revision_id=r.id),'[]'::jsonb),
      'fundingSources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'type',f.source_type,'state',f.source_state,
        'partnerId',f.partner_id,'cashValue',f.cash_value::text,'inKindValue',f.in_kind_value::text,'notes',f.notes) ORDER BY f.id)
        FROM public.proposal_budget_funding_sources f WHERE f.revision_id=r.id),'[]'::jsonb),
      'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'originalName',d.original_name,
        'sha256',d.sha256,'mimeType',d.mime_type,'sizeBytes',d.size_bytes,'reviewState',d.scan_status,'createdAt',d.created_at) ORDER BY d.created_at,d.id)
        FROM public.proposal_budget_documents d WHERE d.revision_id=r.id),'[]'::jsonb)),
    'reviewHistory',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'revisionId',e.revision_id,'action',e.action,
      'remarks',e.remarks,'actorId',e.actor_id,'occurredAt',e.occurred_at) ORDER BY e.occurred_at,e.id)
      FROM public.budget_review_events e WHERE e.proposal_id=q.id),'[]'::jsonb))
  INTO result FROM public.project_proposals q JOIN public.proposal_v2_profiles p ON p.proposal_id=q.id
  JOIN public.proposal_budget_revisions r ON r.id=p.active_budget_revision_id WHERE q.id=p_proposal_id;
  IF result IS NULL THEN RAISE EXCEPTION 'Finance proposal not found' USING ERRCODE='P0002'; END IF;
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id)
  VALUES(auth.uid(),actor_email,'proposal.finance.read','proposal',p_proposal_id::text);
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_apply_proposal_action_v2(
 p_proposal_id uuid,p_action text,p_expected_version integer,p_remarks text DEFAULT NULL,p_warning_codes text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE required_codes text[]; supplied_codes text[]; next_status text; p public.proposal_v2_profiles; budget public.proposal_budget_revisions;
BEGIN
  PERFORM public.phase2_assert_runtime('proposals',p_proposal_id);
  SELECT coalesce(array_agg(DISTINCT code ORDER BY code),'{}'::text[]) INTO supplied_codes FROM unnest(coalesce(p_warning_codes,'{}')) code;
  IF EXISTS(SELECT 1 FROM unnest(supplied_codes) code WHERE code!~'^[a-z][a-z0-9_]{0,79}$') THEN
    RAISE EXCEPTION 'invalid warning acknowledgement' USING ERRCODE='22023';
  END IF;
  IF p_action='submit' THEN
    required_codes:=public.phase2_proposal_required_warnings(p_proposal_id);
    IF required_codes<>supplied_codes THEN RAISE EXCEPTION 'warning acknowledgements do not match current trusted warnings' USING ERRCODE='23514'; END IF;
  ELSIF cardinality(supplied_codes)>0 THEN
    RAISE EXCEPTION 'warning acknowledgements are accepted only during submission' USING ERRCODE='22023';
  END IF;
  next_status:=public.phase2_apply_proposal_action(p_proposal_id,p_action,p_expected_version,p_remarks,supplied_codes);
  SELECT * INTO p FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id;
  SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=p.active_budget_revision_id;
  RETURN jsonb_build_object('id',p_proposal_id,'status',next_status,'rowVersion',p.row_version,
    'budgetRevisionId',budget.id,'budgetRowVersion',budget.row_version,'requiredWarnings',to_jsonb(public.phase2_proposal_required_warnings(p_proposal_id)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_handoff_proposal(p_proposal_id uuid,p_expected_version integer)
RETURNS TABLE(handoff_id uuid,program_id uuid,created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE p public.proposal_v2_profiles; version public.proposal_versions; budget public.proposal_budget_revisions; existing public.program_handoffs;
DECLARE snap jsonb; new_program uuid; new_handoff uuid; allocation uuid; lead jsonb; actor_email text; row_item jsonb;
BEGIN
 PERFORM public.phase2_assert_runtime('proposals',p_proposal_id);
 IF NOT public.phase2_current_has_capability('proposal.handoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id FOR UPDATE;
 PERFORM public.phase2_assert_v2_write_authority('proposals',p.data_mode);
 SELECT * INTO existing FROM public.program_handoffs WHERE proposal_id=p_proposal_id;
 IF existing.id IS NOT NULL THEN RETURN QUERY SELECT existing.id,existing.program_id,existing.created_at; RETURN; END IF;
 IF p.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale proposal version' USING ERRCODE='40001'; END IF;
 SELECT * INTO version FROM public.proposal_versions WHERE id=p.active_version_id AND proposal_id=p_proposal_id;
 SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=version.budget_revision_id AND proposal_id=p_proposal_id;
 IF p.workflow_status<>'approved' OR version.reason<>'final_decision' OR budget.status<>'cleared' OR budget.frozen_snapshot IS NULL
    OR budget.canonical_hash<>encode(extensions.digest(convert_to(budget.frozen_snapshot::text,'UTF8'),'sha256'),'hex') THEN
  RAISE EXCEPTION 'proposal is not ready for handoff' USING ERRCODE='23514';
 END IF;
 snap:=version.snapshot;
 IF version.canonical_hash<>encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'approved proposal snapshot hash is invalid' USING ERRCODE='23514'; END IF;
 SELECT value INTO lead FROM jsonb_array_elements(snap->'targets') WHERE coalesce((value->>'is_lead')::boolean,false) LIMIT 1;
 IF lead IS NULL THEN RAISE EXCEPTION 'approved snapshot has no lead target' USING ERRCODE='23514'; END IF;
 INSERT INTO public.programs(proposal_id,title,description,barangay_id,start_date,end_date,status,budget_allocated,budget_spent,created_by,phase2_data_mode,phase2_responsible_officer_id)
 VALUES(p_proposal_id,snap#>>'{proposal,title}',snap#>>'{proposal,description}',(lead->>'barangay_id')::uuid,
  (snap#>>'{profile,starts_on}')::date,(snap#>>'{profile,ends_on}')::date,'draft',(budget.frozen_snapshot#>>'{revision,cash_total}')::numeric,0,
  auth.uid(),p.data_mode,p.responsible_officer_id) RETURNING id INTO new_program;
 UPDATE public.programs SET status='planning',updated_at=now() WHERE id=new_program;
 INSERT INTO public.program_handoffs(proposal_id,proposal_version_id,budget_revision_id,program_id,handed_off_by)
 VALUES(p_proposal_id,version.id,budget.id,new_program,auth.uid()) RETURNING id INTO new_handoff;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'targets') LOOP
  INSERT INTO public.program_target_areas_v2(program_id,source_target_area_id,barangay_id,sitio_id,is_lead)
  VALUES(new_program,(row_item->>'id')::uuid,(row_item->>'barangay_id')::uuid,nullif(row_item->>'sitio_id','')::uuid,coalesce((row_item->>'is_lead')::boolean,false));
 END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'needs') LOOP
  INSERT INTO public.program_need_links_v2(program_id,source_proposal_need_link_id,need_id,intended_coverage,need_snapshot)
  VALUES(new_program,(row_item->>'id')::uuid,(row_item->>'need_id')::uuid,row_item->>'intended_coverage',row_item->'need_snapshot');
 END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'beneficiaries') LOOP
  INSERT INTO public.program_beneficiary_plans_v2(program_id,source_estimate_id,category_code,planned_count,provenance)
  VALUES(new_program,(row_item->>'id')::uuid,row_item->>'category_code',(row_item->>'final_count')::int,
    jsonb_build_object('sourceMetadata',coalesce(row_item->'source_metadata','{}'::jsonb),'qualityMetadata',coalesce(row_item->'quality_metadata','{}'::jsonb),'asOfDate',row_item->>'as_of_date'));
 END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'sdgs') LOOP
  INSERT INTO public.program_sdg_links_v2(program_id,sdg_number) VALUES(new_program,(row_item->>'number')::smallint) ON CONFLICT DO NOTHING;
 END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'partners') LOOP
  INSERT INTO public.program_partner_links(program_id,partner_id,partner_role,created_by)
  VALUES(new_program,(row_item->>'partner_id')::uuid,CASE WHEN row_item->>'role'='originating_proponent' THEN 'lead_implementer' ELSE 'co_implementer' END,auth.uid()) ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO public.program_budget_revisions(program_id,revision_number,status,source_proposal_budget_revision_id,cash_total,in_kind_total,created_by)
 VALUES(new_program,1,'active',budget.id,(budget.frozen_snapshot#>>'{revision,cash_total}')::numeric,
  (budget.frozen_snapshot#>>'{revision,in_kind_total}')::numeric,auth.uid()) RETURNING id INTO allocation;
 FOR row_item IN SELECT value FROM jsonb_array_elements(budget.frozen_snapshot->'items') LOOP
  INSERT INTO public.program_budget_items(revision_id,source_proposal_item_id,category_id,item_kind,description,allocated_amount,sort_order)
  VALUES(allocation,(row_item->>'id')::uuid,(row_item->>'category_id')::uuid,row_item->>'item_kind',row_item->>'description',
    CASE WHEN row_item->>'item_kind'='cash' THEN (row_item->>'amount')::numeric ELSE coalesce(nullif(row_item->>'in_kind_valuation','')::numeric,(row_item->>'amount')::numeric) END,
    (row_item->>'sort_order')::int);
 END LOOP;
 INSERT INTO public.proposal_workflow_events_v2(proposal_id,action,from_status,to_status,proposal_version_id,budget_revision_id,actor_id)
 VALUES(p_proposal_id,'program_handoff','approved','approved',version.id,budget.id,auth.uid());
 INSERT INTO public.program_finance_events(program_id,allocation_revision_id,action,to_status,reason,actor_id)
 VALUES(new_program,allocation,'proposal_handoff_allocation','active','Frozen Finance-cleared proposal budget',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),actor_email,'proposal.v2.handoff','proposal',p_proposal_id::text,jsonb_build_object('program_id',new_program,'proposal_version_id',version.id,'budget_revision_id',budget.id));
 RETURN QUERY SELECT new_handoff,new_program,now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_handoff_proposal_v2(p_proposal_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE proposal_mode text; finance_mode text; result record; handoff public.program_handoffs;
BEGIN
  proposal_mode:=public.phase2_assert_actor_runtime('proposals');
  finance_mode:=public.phase2_assert_actor_runtime('program_finance');
  IF proposal_mode<>finance_mode THEN RAISE EXCEPTION 'handoff components use different data modes' USING ERRCODE='42501'; END IF;
  SELECT * INTO result FROM public.phase2_handoff_proposal(p_proposal_id,p_expected_version);
  SELECT * INTO handoff FROM public.program_handoffs WHERE proposal_id=p_proposal_id;
  IF handoff.id IS NULL THEN RAISE EXCEPTION 'handoff did not produce a program' USING ERRCODE='P0001'; END IF;
  PERFORM public.phase2_register_created_synthetic_root('program_finance',handoff.program_id);
  RETURN jsonb_build_object('id',handoff.id,'proposalId',handoff.proposal_id,'proposalVersionId',handoff.proposal_version_id,
    'budgetRevisionId',handoff.budget_revision_id,'programId',handoff.program_id,'createdAt',handoff.created_at,
    'idempotent',result.program_id IS NOT DISTINCT FROM handoff.program_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_guard_program_budget_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'program allocation revisions are retained' USING ERRCODE='42501'; END IF;
  IF OLD.status IN('returned','superseded') OR OLD.status='active' AND NEW.status<>'superseded'
     OR OLD.status='submitted' AND NEW.status NOT IN('returned','active')
     OR OLD.status='draft' AND NEW.status NOT IN('draft','submitted') THEN
    RAISE EXCEPTION 'reviewed program allocation is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status<>'draft' AND (NEW.frozen_snapshot IS DISTINCT FROM OLD.frozen_snapshot
     OR NEW.canonical_hash IS DISTINCT FROM OLD.canonical_hash OR NEW.cash_total IS DISTINCT FROM OLD.cash_total
     OR NEW.in_kind_total IS DISTINCT FROM OLD.in_kind_total) THEN
    RAISE EXCEPTION 'frozen program allocation content is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS program_budget_revision_guard ON public.program_budget_revisions;
CREATE TRIGGER program_budget_revision_guard BEFORE UPDATE OR DELETE ON public.program_budget_revisions
  FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_program_budget_revision();

CREATE OR REPLACE FUNCTION public.phase2_prepare_program_allocation(
 p_program_id uuid,p_expected_active_version integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active public.program_budget_revisions; new_id uuid; next_number integer; item jsonb; v_cash_total numeric:=0; v_in_kind_total numeric:=0; actor_email text;
BEGIN
  PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
  IF NOT public.phase2_current_has_capability('budget.actual.record') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload)<>'object' OR NOT public.phase1_json_object_has_only(p_payload,ARRAY['reason','items'])
     OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 5 AND 1000
     OR jsonb_typeof(p_payload->'items')<>'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid allocation payload' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('program-allocation:'||p_program_id::text,0));
  SELECT * INTO active FROM public.program_budget_revisions WHERE program_id=p_program_id AND status='active' FOR UPDATE;
  IF active.id IS NULL THEN RAISE EXCEPTION 'active allocation not found' USING ERRCODE='P0002'; END IF;
  IF active.row_version<>p_expected_active_version THEN RAISE EXCEPTION 'stale active allocation' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.program_budget_revisions WHERE program_id=p_program_id AND status IN('draft','submitted')) THEN
    RAISE EXCEPTION 'an allocation revision is already in progress' USING ERRCODE='23505';
  END IF;
  SELECT coalesce(max(revision_number),0)+1 INTO next_number FROM public.program_budget_revisions WHERE program_id=p_program_id;
  INSERT INTO public.program_budget_revisions(program_id,revision_number,status,source_proposal_budget_revision_id,source_revision_id,cash_total,in_kind_total,created_by)
  VALUES(p_program_id,next_number,'draft',active.source_proposal_budget_revision_id,active.id,0,0,auth.uid()) RETURNING id INTO new_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    IF jsonb_typeof(item)<>'object' OR NOT public.phase1_json_object_has_only(item,
      ARRAY['source_item_id','category_id','kind','description','allocated_amount','sort_order'])
      OR item->>'kind' NOT IN('cash','in_kind') OR length(btrim(coalesce(item->>'description',''))) NOT BETWEEN 1 AND 500
      OR nullif(item->>'allocated_amount','')::numeric<=0
      OR NOT EXISTS(SELECT 1 FROM public.budget_categories c WHERE c.id=(item->>'category_id')::uuid AND c.is_active) THEN
      RAISE EXCEPTION 'invalid allocation item' USING ERRCODE='22023';
    END IF;
    IF nullif(item->>'source_item_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.program_budget_items i
      WHERE i.id=(item->>'source_item_id')::uuid AND i.program_id=p_program_id) THEN
      RAISE EXCEPTION 'allocation source item is outside the program' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.program_budget_items(program_id,revision_id,source_proposal_item_id,category_id,item_kind,description,allocated_amount,sort_order)
    VALUES(p_program_id,new_id,NULL,(item->>'category_id')::uuid,item->>'kind',btrim(item->>'description'),(item->>'allocated_amount')::numeric,coalesce((item->>'sort_order')::integer,0));
    IF item->>'kind'='cash' THEN v_cash_total:=v_cash_total+(item->>'allocated_amount')::numeric;
    ELSE v_in_kind_total:=v_in_kind_total+(item->>'allocated_amount')::numeric; END IF;
  END LOOP;
  UPDATE public.program_budget_revisions SET cash_total=v_cash_total,in_kind_total=v_in_kind_total WHERE id=new_id;
  INSERT INTO public.program_finance_events(program_id,allocation_revision_id,action,from_status,to_status,reason,actor_id)
  VALUES(p_program_id,new_id,'allocation_prepared',active.status,'draft',btrim(p_payload->>'reason'),auth.uid());
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata)
  VALUES(auth.uid(),actor_email,'program.allocation.prepare','program_budget_revision',new_id::text,jsonb_build_object('program_id',p_program_id,'source_revision_id',active.id));
  RETURN jsonb_build_object('id',new_id,'programId',p_program_id,'revisionNumber',next_number,'status','draft',
    'cashTotal',v_cash_total::text,'inKindTotal',v_in_kind_total::text,'rowVersion',1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_apply_program_allocation_action(
 p_program_id uuid,p_revision_id uuid,p_action text,p_expected_version integer,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE revision public.program_budget_revisions; active public.program_budget_revisions; next_status text; snapshot jsonb; snapshot_hash text; actor_email text;
BEGIN
  PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('program-allocation:'||p_program_id::text,0));
  SELECT * INTO revision FROM public.program_budget_revisions WHERE id=p_revision_id AND program_id=p_program_id FOR UPDATE;
  IF revision.id IS NULL THEN RAISE EXCEPTION 'allocation revision not found' USING ERRCODE='P0002'; END IF;
  IF revision.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale allocation revision' USING ERRCODE='40001'; END IF;
  IF p_action='submit' THEN
    IF NOT public.phase2_current_has_capability('budget.actual.record') OR revision.status<>'draft' THEN RAISE EXCEPTION 'invalid allocation submit' USING ERRCODE='42501'; END IF;
    snapshot:=public.phase2_program_budget_snapshot(revision.id);
    IF jsonb_array_length(snapshot->'items')=0 THEN RAISE EXCEPTION 'allocation requires items' USING ERRCODE='23514'; END IF;
    snapshot_hash:=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'); next_status:='submitted';
    UPDATE public.program_budget_revisions SET status=next_status,frozen_snapshot=snapshot,canonical_hash=snapshot_hash,
      submitted_by=auth.uid(),submitted_at=now(),row_version=row_version+1,updated_at=now() WHERE id=revision.id;
  ELSIF p_action IN('return','activate') THEN
    IF NOT public.phase2_current_has_capability('budget.review') OR revision.status<>'submitted'
       OR (p_action='return' AND length(btrim(coalesce(p_reason,'')))<5) THEN RAISE EXCEPTION 'invalid allocation review' USING ERRCODE='42501'; END IF;
    snapshot:=public.phase2_program_budget_snapshot(revision.id);
    snapshot_hash:=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');
    IF snapshot IS DISTINCT FROM revision.frozen_snapshot OR snapshot_hash IS DISTINCT FROM revision.canonical_hash THEN
      RAISE EXCEPTION 'submitted allocation snapshot changed' USING ERRCODE='23514';
    END IF;
    IF p_action='return' THEN next_status:='returned';
    ELSE
      SELECT * INTO active FROM public.program_budget_revisions WHERE program_id=p_program_id AND status='active' FOR UPDATE;
      IF active.id IS NOT NULL THEN UPDATE public.program_budget_revisions SET status='superseded',row_version=row_version+1,updated_at=now() WHERE id=active.id; END IF;
      next_status:='active';
    END IF;
    UPDATE public.program_budget_revisions SET status=next_status,reviewed_by=auth.uid(),reviewed_at=now(),row_version=row_version+1,updated_at=now()
    WHERE id=revision.id;
  ELSE RAISE EXCEPTION 'unknown allocation action' USING ERRCODE='22023'; END IF;
  INSERT INTO public.program_finance_events(program_id,allocation_revision_id,action,from_status,to_status,reason,actor_id)
  VALUES(p_program_id,revision.id,'allocation_'||p_action,revision.status,next_status,nullif(btrim(p_reason),''),auth.uid());
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id)
  VALUES(auth.uid(),actor_email,'program.allocation.'||p_action,'program_budget_revision',revision.id::text);
  SELECT * INTO revision FROM public.program_budget_revisions WHERE id=revision.id;
  RETURN jsonb_build_object('id',revision.id,'programId',revision.program_id,'revisionNumber',revision.revision_number,
    'status',revision.status,'cashTotal',revision.cash_total::text,'inKindTotal',revision.in_kind_total::text,
    'canonicalHash',revision.canonical_hash,'rowVersion',revision.row_version);
END;
$function$;

ALTER TABLE public.program_finance_events ADD COLUMN IF NOT EXISTS event_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.phase2_update_liquidation(
 p_program_id uuid,p_liquidation_id uuid,p_expected_version integer,p_summary jsonb,p_expenditure_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.liquidation_submissions; total numeric; actor_email text; previous_snapshot jsonb;
BEGIN
  PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
  IF NOT public.phase2_current_has_capability('budget.actual.record') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_summary)<>'object' OR NOT public.phase1_json_object_has_only(p_summary,ARRAY['period_start','period_end','narrative','exception_notes'])
     OR length(btrim(coalesce(p_summary->>'narrative',''))) NOT BETWEEN 10 AND 2000
     OR nullif(p_summary->>'period_start','') IS NULL OR nullif(p_summary->>'period_end','') IS NULL
     OR (p_summary->>'period_start')::date>(p_summary->>'period_end')::date
     OR cardinality(coalesce(p_expenditure_ids,'{}')) NOT BETWEEN 1 AND 1000
     OR (SELECT count(DISTINCT id) FROM unnest(p_expenditure_ids) id)<>cardinality(p_expenditure_ids) THEN
    RAISE EXCEPTION 'invalid liquidation correction' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('liquidation:'||p_program_id::text,0));
  SELECT * INTO item FROM public.liquidation_submissions WHERE id=p_liquidation_id AND program_id=p_program_id FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'liquidation not found' USING ERRCODE='P0002'; END IF;
  IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale liquidation' USING ERRCODE='40001'; END IF;
  IF item.status NOT IN('draft','returned') THEN RAISE EXCEPTION 'liquidation is not editable' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_expenditure_ids) requested(id) LEFT JOIN public.program_expenditures e ON e.id=requested.id
    WHERE e.id IS NULL OR e.program_id<>p_program_id OR e.status<>'verified') THEN
    RAISE EXCEPTION 'liquidation contains an invalid expenditure' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.liquidation_expenditures x WHERE x.expenditure_id=ANY(p_expenditure_ids)
    AND x.released_at IS NULL AND x.liquidation_id<>item.id) THEN
    RAISE EXCEPTION 'an expenditure is claimed by another liquidation' USING ERRCODE='23505';
  END IF;
  previous_snapshot:=jsonb_build_object('summary',item.summary,'totalSubmitted',item.total_submitted::text,
    'expenditureIds',coalesce((SELECT jsonb_agg(x.expenditure_id ORDER BY x.expenditure_id) FROM public.liquidation_expenditures x
      WHERE x.liquidation_id=item.id AND x.released_at IS NULL),'[]'::jsonb));
  DELETE FROM public.liquidation_expenditures WHERE liquidation_id=item.id;
  SELECT sum(amount) INTO total FROM public.program_expenditures WHERE id=ANY(p_expenditure_ids);
  INSERT INTO public.liquidation_expenditures(program_id,liquidation_id,expenditure_id,amount_snapshot)
  SELECT p_program_id,item.id,e.id,e.amount FROM public.program_expenditures e WHERE e.id=ANY(p_expenditure_ids);
  UPDATE public.liquidation_submissions SET summary=p_summary,total_submitted=total,status='draft',row_version=row_version+1,updated_at=now()
  WHERE id=item.id;
  INSERT INTO public.program_finance_events(program_id,liquidation_id,action,from_status,to_status,reason,event_snapshot,actor_id)
  VALUES(p_program_id,item.id,'liquidation_corrected',item.status,'draft','Validated liquidation correction',previous_snapshot,auth.uid());
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id)
  VALUES(auth.uid(),actor_email,'program.liquidation.correct','liquidation',item.id::text);
  RETURN jsonb_build_object('id',item.id,'status','draft','totalSubmitted',total::text,'rowVersion',item.row_version+1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_create_liquidation_v2(p_program_id uuid,p_summary jsonb,p_expenditure_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; item public.liquidation_submissions;
BEGIN
  IF cardinality(coalesce(p_expenditure_ids,'{}')) NOT BETWEEN 1 AND 1000
     OR (SELECT count(DISTINCT id) FROM unnest(p_expenditure_ids) id)<>cardinality(p_expenditure_ids) THEN
    RAISE EXCEPTION 'liquidation expenditure identifiers must be unique' USING ERRCODE='22023';
  END IF;
  new_id:=public.phase2_create_liquidation(p_program_id,p_summary,p_expenditure_ids);
  SELECT * INTO item FROM public.liquidation_submissions WHERE id=new_id;
  RETURN jsonb_build_object('id',item.id,'status',item.status,'totalSubmitted',item.total_submitted::text,'rowVersion',item.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_apply_liquidation_action_v2(
 p_program_id uuid,p_liquidation_id uuid,p_action text,p_expected_version integer,p_remarks text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE status_value text; item public.liquidation_submissions;
BEGIN
  status_value:=public.phase2_apply_liquidation_action(p_program_id,p_liquidation_id,p_action,p_expected_version,p_remarks);
  SELECT * INTO item FROM public.liquidation_submissions WHERE id=p_liquidation_id AND program_id=p_program_id;
  RETURN jsonb_build_object('id',item.id,'status',status_value,'totalSubmitted',item.total_submitted::text,'rowVersion',item.row_version);
END;
$function$;

ALTER TABLE public.program_expenditures ADD COLUMN IF NOT EXISTS variance_explanation text;

CREATE OR REPLACE FUNCTION public.phase2_record_expenditure_v2(p_program_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.program_budget_items; new_id uuid; projected numeric; explanation text; expenditure public.program_expenditures;
BEGIN
  IF jsonb_typeof(p_payload)<>'object' OR NOT public.phase1_json_object_has_only(p_payload,
    ARRAY['budget_item_id','amount','spent_on','payee_label','description','receipt_document_id','receipt_exception_reason','variance_explanation']) THEN
    RAISE EXCEPTION 'unknown expenditure field' USING ERRCODE='22023';
  END IF;
  PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
  SELECT i.* INTO item FROM public.program_budget_items i JOIN public.program_budget_revisions r ON r.id=i.revision_id
  WHERE i.id=(p_payload->>'budget_item_id')::uuid AND i.program_id=p_program_id AND r.status='active' FOR SHARE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'active allocation item not found' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(e.amount),0)+(p_payload->>'amount')::numeric INTO projected FROM public.program_expenditures e
  WHERE e.program_id=p_program_id AND e.budget_item_id=item.id AND e.status IN('pending','verified');
  explanation:=nullif(btrim(p_payload->>'variance_explanation'),'');
  IF projected>item.allocated_amount AND length(coalesce(explanation,''))<10 THEN
    RAISE EXCEPTION 'visible overspending requires a variance explanation' USING ERRCODE='23514';
  END IF;
  new_id:=public.phase2_record_expenditure(p_program_id,p_payload-'variance_explanation');
  UPDATE public.program_expenditures SET variance_explanation=explanation WHERE id=new_id;
  SELECT * INTO expenditure FROM public.program_expenditures WHERE id=new_id;
  RETURN jsonb_build_object('id',expenditure.id,'programId',expenditure.program_id,'budgetItemId',expenditure.budget_item_id,
    'amount',expenditure.amount::text,'status',expenditure.status,'varianceExplanation',expenditure.variance_explanation,'rowVersion',expenditure.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_correct_expenditure_v2(
 p_program_id uuid,p_id uuid,p_expected_version integer,p_replacement_payload jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE old public.program_expenditures; item public.program_budget_items; projected numeric; explanation text; replacement_id uuid; replacement public.program_expenditures;
BEGIN
  IF jsonb_typeof(p_replacement_payload)<>'object' OR NOT public.phase1_json_object_has_only(p_replacement_payload,
    ARRAY['budget_item_id','amount','spent_on','payee_label','description','receipt_document_id','receipt_exception_reason','variance_explanation']) THEN
    RAISE EXCEPTION 'unknown replacement expenditure field' USING ERRCODE='22023';
  END IF;
  PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
  SELECT * INTO old FROM public.program_expenditures WHERE id=p_id AND program_id=p_program_id FOR UPDATE;
  IF old.id IS NULL OR old.row_version<>p_expected_version OR old.status IN('voided','replaced') THEN
    RAISE EXCEPTION 'stale expenditure' USING ERRCODE='40001';
  END IF;
  SELECT i.* INTO item FROM public.program_budget_items i JOIN public.program_budget_revisions r ON r.id=i.revision_id
  WHERE i.id=(p_replacement_payload->>'budget_item_id')::uuid AND i.program_id=p_program_id AND r.status='active' FOR SHARE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'active allocation item not found' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(e.amount),0)+(p_replacement_payload->>'amount')::numeric INTO projected FROM public.program_expenditures e
  WHERE e.program_id=p_program_id AND e.budget_item_id=item.id AND e.status IN('pending','verified') AND e.id<>old.id;
  explanation:=nullif(btrim(p_replacement_payload->>'variance_explanation'),'');
  IF projected>item.allocated_amount AND length(coalesce(explanation,''))<10 THEN
    RAISE EXCEPTION 'visible overspending requires a variance explanation' USING ERRCODE='23514';
  END IF;
  replacement_id:=public.phase2_correct_expenditure(p_program_id,p_id,p_expected_version,p_replacement_payload-'variance_explanation',p_reason);
  UPDATE public.program_expenditures SET variance_explanation=explanation WHERE id=replacement_id;
  SELECT * INTO replacement FROM public.program_expenditures WHERE id=replacement_id;
  RETURN jsonb_build_object('id',replacement.id,'programId',replacement.program_id,'budgetItemId',replacement.budget_item_id,
    'amount',replacement.amount::text,'status',replacement.status,'replacesId',replacement.replaces_id,
    'varianceExplanation',replacement.variance_explanation,'rowVersion',replacement.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_program_finance(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; actor_email text; planned_cash numeric; planned_in_kind numeric; pending_actual numeric; verified_actual numeric;
BEGIN
  PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
  IF NOT public.phase2_current_has_capability('budget.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(r.cash_total,0),coalesce(r.in_kind_total,0) INTO planned_cash,planned_in_kind
  FROM public.program_budget_revisions r WHERE r.program_id=p_program_id AND r.status='active';
  SELECT coalesce(sum(e.amount) FILTER(WHERE e.status='pending'),0),coalesce(sum(e.amount) FILTER(WHERE e.status='verified'),0)
  INTO pending_actual,verified_actual FROM public.program_expenditures e WHERE e.program_id=p_program_id;
  SELECT jsonb_build_object('programId',p.id,'title',p.title,
    'allocation',(SELECT jsonb_build_object('id',r.id,'programId',r.program_id,'revisionNumber',r.revision_number,
      'status',r.status,'cashTotal',r.cash_total::text,'inKindTotal',r.in_kind_total::text,'canonicalHash',r.canonical_hash,'rowVersion',r.row_version,
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'categoryId',i.category_id,'kind',i.item_kind,
        'description',i.description,'allocatedAmount',i.allocated_amount::text,'sortOrder',i.sort_order) ORDER BY i.sort_order,i.id)
        FROM public.program_budget_items i WHERE i.revision_id=r.id),'[]'::jsonb))
      FROM public.program_budget_revisions r WHERE r.program_id=p.id AND r.status='active'),
    'allocationRevisions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'revisionNumber',r.revision_number,
      'status',r.status,'sourceRevisionId',r.source_revision_id,'cashTotal',r.cash_total::text,'inKindTotal',r.in_kind_total::text,
      'canonicalHash',r.canonical_hash,'rowVersion',r.row_version,'createdAt',r.created_at) ORDER BY r.revision_number DESC)
      FROM public.program_budget_revisions r WHERE r.program_id=p.id),'[]'::jsonb),
    'expenditures',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'programId',e.program_id,'budgetItemId',e.budget_item_id,
      'amount',e.amount::text,'spentOn',e.spent_on,'payeeLabel',e.payee_label,'description',e.description,'status',e.status,
      'receiptDocumentId',e.receipt_document_id,'receiptExceptionReason',e.receipt_exception_reason,
      'varianceExplanation',e.variance_explanation,'replacesId',e.replaces_id,'rowVersion',e.row_version)
      ORDER BY e.spent_on DESC,e.created_at DESC,e.id) FROM public.program_expenditures e WHERE e.program_id=p.id),'[]'::jsonb),
    'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'originalName',d.original_name,
      'sha256',d.sha256,'mimeType',d.mime_type,'sizeBytes',d.size_bytes,'reviewState',d.scan_status,'createdAt',d.created_at)
      ORDER BY d.created_at,d.id) FROM public.program_financial_documents d WHERE d.program_id=p.id),'[]'::jsonb),
    'liquidations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'programId',l.program_id,'revisionNumber',l.revision_number,
      'status',l.status,'totalSubmitted',l.total_submitted::text,'summary',l.summary,'rowVersion',l.row_version,
      'expenditureIds',coalesce((SELECT jsonb_agg(x.expenditure_id ORDER BY x.expenditure_id) FROM public.liquidation_expenditures x
        WHERE x.liquidation_id=l.id AND x.released_at IS NULL),'[]'::jsonb)) ORDER BY l.revision_number DESC)
      FROM public.liquidation_submissions l WHERE l.program_id=p.id),'[]'::jsonb),
    'totals',jsonb_build_object('plannedCash',planned_cash::text,'plannedInKind',planned_in_kind::text,
      'pendingActual',pending_actual::text,'verifiedActual',verified_actual::text,
      'remaining',(planned_cash-verified_actual)::text,'variance',(verified_actual-planned_cash)::text),
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'allocationRevisionId',e.allocation_revision_id,
      'expenditureId',e.expenditure_id,'liquidationId',e.liquidation_id,'action',e.action,'fromStatus',e.from_status,
      'toStatus',e.to_status,'reason',e.reason,'actorId',e.actor_id,'occurredAt',e.occurred_at) ORDER BY e.occurred_at,e.id)
      FROM public.program_finance_events e WHERE e.program_id=p.id),'[]'::jsonb)
  ) INTO result FROM public.programs p WHERE p.id=p_program_id;
  IF result IS NULL THEN RAISE EXCEPTION 'program not found' USING ERRCODE='P0002'; END IF;
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id)
  VALUES(auth.uid(),actor_email,'program.finance.read','program',p_program_id::text);
  RETURN result;
END;
$function$;

-- Retire bypassable legacy mutation entry points. Reviewed V2 wrappers are the
-- only authenticated graph and finance mutation boundary.
REVOKE ALL ON FUNCTION public.phase2_save_proposal_graph(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_apply_proposal_action(uuid,text,integer,text,text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_handoff_proposal(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_record_expenditure(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_correct_expenditure(uuid,uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_create_liquidation(uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_apply_liquidation_action(uuid,uuid,text,integer,text) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.phase2_set_beneficiary_estimate_kind() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_set_program_budget_item_parent() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_set_liquidation_claim_parent() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_guard_proposal_budget_child() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_guard_program_budget_child() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_guard_program_budget_revision() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_budget_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_program_budget_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_proposal_required_warnings(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_proposal_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_recalculate_budget(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_clone_budget_revision(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_capture_proposal_version(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_validate_proposal_graph(uuid) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.phase2_calculate_beneficiary_estimate(text,uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_save_proposal_graph_v2(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_proposals() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_proposal_catalog() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_proposal(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_finance_proposal(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_apply_proposal_action_v2(uuid,text,integer,text,text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_handoff_proposal_v2(uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_prepare_program_allocation(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_apply_program_allocation_action(uuid,uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_update_liquidation(uuid,uuid,integer,jsonb,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_create_liquidation_v2(uuid,jsonb,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_apply_liquidation_action_v2(uuid,uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_record_expenditure_v2(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_correct_expenditure_v2(uuid,uuid,integer,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_program_finance(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.phase2_calculate_beneficiary_estimate(text,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_save_proposal_graph_v2(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_proposals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_proposal_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_finance_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_apply_proposal_action_v2(uuid,text,integer,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_handoff_proposal_v2(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_prepare_program_allocation(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_apply_program_allocation_action(uuid,uuid,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_update_liquidation(uuid,uuid,integer,jsonb,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_create_liquidation_v2(uuid,jsonb,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_apply_liquidation_action_v2(uuid,uuid,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_record_expenditure_v2(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_correct_expenditure_v2(uuid,uuid,integer,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_program_finance(uuid) TO authenticated;

UPDATE public.phase2_component_runtime
SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state
SET write_authority='v1',reconciliation_hash=NULL,reconciled_at=NULL,changed_at=now();

COMMIT;
