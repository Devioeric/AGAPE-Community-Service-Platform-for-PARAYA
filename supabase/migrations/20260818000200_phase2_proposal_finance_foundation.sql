-- Phase 2.4-2.6 dark-launch foundation. Additive V2 graph/state tables avoid
-- changing the live V1 status constraints until clone reconciliation passes.
BEGIN;
DO $preflight$ BEGIN
 IF to_regclass('public.partner_entities') IS NULL OR to_regclass('public.phase2_component_runtime') IS NULL THEN
  RAISE EXCEPTION 'Apply Phase 2 partner/history foundation first'; END IF;
 IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
  RAISE EXCEPTION 'Phase 2 requires pgcrypto digest in the extensions schema from the canonical baseline'; END IF;
END;$preflight$;

CREATE TABLE public.proposal_project_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, label text NOT NULL, is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.project_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid REFERENCES public.proposal_project_categories(id), title text NOT NULL,
 template_data jsonb NOT NULL DEFAULT '{}', is_active boolean NOT NULL DEFAULT true, row_version integer NOT NULL DEFAULT 1,
 created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.proposal_beneficiary_categories (
 code text PRIMARY KEY, label text NOT NULL, predicate_version text NOT NULL, is_active boolean NOT NULL DEFAULT true,
 predicate_definition jsonb NOT NULL, created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.proposal_v2_profiles (
 proposal_id uuid PRIMARY KEY REFERENCES public.project_proposals(id),
 workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','pre_screening','evidence_review','finance_review','director_review','revisions_requested','approved','rejected')),
 return_stage text CHECK(return_stage IN('pre_screening','evidence_review','finance_review','director_review')),
 origin_channel text NOT NULL DEFAULT 'paraya_internal' CHECK(origin_channel IN('paraya_internal','partner_document','barangay_referral')),
 originating_partner_id uuid REFERENCES public.partner_entities(id), responsible_officer_id uuid NOT NULL REFERENCES public.users(id),
 project_category_id uuid REFERENCES public.proposal_project_categories(id), starts_on date, ends_on date,
 row_version integer NOT NULL DEFAULT 1, active_version_id uuid, active_budget_revision_id uuid,
 imported_from_v1 boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(origin_channel='paraya_internal' OR originating_partner_id IS NOT NULL), CHECK(ends_on IS NULL OR starts_on IS NOT NULL AND ends_on>=starts_on)
);
CREATE TABLE public.proposal_target_areas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), barangay_id uuid NOT NULL REFERENCES public.barangays(id),
 sitio_id uuid REFERENCES public.barangay_sitios(id), is_lead boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(proposal_id,barangay_id,sitio_id)
);
CREATE UNIQUE INDEX proposal_target_one_lead ON public.proposal_target_areas(proposal_id) WHERE is_lead;
CREATE UNIQUE INDEX proposal_target_one_barangay_wide ON public.proposal_target_areas(proposal_id,barangay_id) WHERE sitio_id IS NULL;
CREATE TABLE public.proposal_need_links_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), need_id uuid NOT NULL REFERENCES public.community_needs(id),
 target_area_id uuid NOT NULL REFERENCES public.proposal_target_areas(id), intended_coverage text NOT NULL CHECK(intended_coverage IN('full','partial')),
 planned_beneficiary_count integer CHECK(planned_beneficiary_count>0), planned_beneficiary_percentage numeric(5,2) CHECK(planned_beneficiary_percentage BETWEEN 0 AND 100), notes text,
 need_snapshot jsonb, submission_snapshot_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(proposal_id,need_id,target_area_id)
);
CREATE TABLE public.proposal_beneficiary_estimates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), category_code text NOT NULL REFERENCES public.proposal_beneficiary_categories(code),
 target_area_id uuid NOT NULL REFERENCES public.proposal_target_areas(id), evidence_snapshot_id uuid REFERENCES public.profiling_evidence_snapshots(id),
 calculated_count integer CHECK(calculated_count>=0), is_suppressed boolean NOT NULL DEFAULT false, final_count integer NOT NULL CHECK(final_count>0),
 source_description text, source_metadata jsonb NOT NULL DEFAULT '{}', as_of_date date NOT NULL, override_reason text, override_actor_id uuid REFERENCES public.users(id), override_at timestamptz,
 CHECK(NOT is_suppressed OR calculated_count IS NULL), CHECK((override_reason IS NULL)=(override_actor_id IS NULL))
);
CREATE TABLE public.proposal_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), version_number integer NOT NULL CHECK(version_number>0),
 reason text NOT NULL CHECK(reason IN('submission','resubmission','finance_clearance','final_decision','imported_v1')),
 snapshot jsonb NOT NULL, canonical_hash text NOT NULL CHECK(canonical_hash~'^[0-9a-f]{64}$'),
 created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(proposal_id,version_number)
);
ALTER TABLE public.proposal_v2_profiles ADD CONSTRAINT proposal_v2_active_version_fk FOREIGN KEY(active_version_id) REFERENCES public.proposal_versions(id);

CREATE TABLE public.proposal_workflow_events_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), action text NOT NULL,
 from_status text, to_status text, proposal_version_id uuid REFERENCES public.proposal_versions(id), budget_revision_id uuid,
 warning_acknowledgements jsonb NOT NULL DEFAULT '[]', remarks text, actor_id uuid NOT NULL REFERENCES public.users(id), occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.budget_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, label text NOT NULL, is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.proposal_budget_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), revision_number integer NOT NULL CHECK(revision_number>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','returned','cleared','superseded')), currency text NOT NULL DEFAULT 'PHP' CHECK(currency='PHP'),
 zero_cash boolean NOT NULL DEFAULT false, zero_cash_justification text, source_revision_id uuid REFERENCES public.proposal_budget_revisions(id),
 cash_total numeric(14,2) NOT NULL DEFAULT 0 CHECK(cash_total>=0), in_kind_total numeric(14,2) NOT NULL DEFAULT 0 CHECK(in_kind_total>=0),
 canonical_hash text CHECK(canonical_hash IS NULL OR canonical_hash~'^[0-9a-f]{64}$'), row_version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES public.users(id), submitted_by uuid REFERENCES public.users(id), submitted_at timestamptz,
 cleared_by uuid REFERENCES public.users(id), cleared_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(proposal_id,revision_number), CHECK(NOT zero_cash OR length(btrim(coalesce(zero_cash_justification,'')))>=10)
);
CREATE UNIQUE INDEX proposal_one_active_budget_revision ON public.proposal_budget_revisions(proposal_id) WHERE status IN('draft','submitted','returned','cleared');
ALTER TABLE public.proposal_v2_profiles ADD CONSTRAINT proposal_v2_active_budget_fk FOREIGN KEY(active_budget_revision_id) REFERENCES public.proposal_budget_revisions(id);
CREATE TABLE public.proposal_budget_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES public.proposal_budget_revisions(id), category_id uuid NOT NULL REFERENCES public.budget_categories(id),
 item_kind text NOT NULL CHECK(item_kind IN('cash','in_kind')), description text NOT NULL, quantity numeric(12,3) NOT NULL CHECK(quantity>0), unit text NOT NULL,
 unit_cost numeric(14,2) NOT NULL CHECK(unit_cost>=0), amount numeric(14,2) GENERATED ALWAYS AS (round(quantity*unit_cost,2)) STORED,
 in_kind_valuation numeric(14,2) CHECK(in_kind_valuation>=0), notes text, sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE public.proposal_budget_funding_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES public.proposal_budget_revisions(id),
 source_type text NOT NULL CHECK(source_type IN('internal_dyci','external','cash_donation','in_kind_donation','partner_contribution','other')),
 source_state text NOT NULL CHECK(source_state IN('expected','confirmed')), partner_id uuid REFERENCES public.partner_entities(id),
 cash_value numeric(14,2) NOT NULL DEFAULT 0 CHECK(cash_value>=0), in_kind_value numeric(14,2) NOT NULL DEFAULT 0 CHECK(in_kind_value>=0), notes text
);
CREATE TABLE public.proposal_budget_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES public.proposal_budget_revisions(id), document_type text NOT NULL CHECK(document_type IN('quotation','source_budget','supporting')),
 original_name text NOT NULL, storage_path text NOT NULL UNIQUE, sha256 text NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'), mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760), scan_status text NOT NULL DEFAULT 'quarantined' CHECK(scan_status IN('quarantined','approved','rejected','risk_accepted')),
 uploaded_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.budget_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), revision_id uuid NOT NULL REFERENCES public.proposal_budget_revisions(id),
 action text NOT NULL CHECK(action IN('submitted','returned','cleared','superseded')), remarks text, actor_id uuid NOT NULL REFERENCES public.users(id), occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.proposal_workflow_events_v2 ADD CONSTRAINT proposal_workflow_budget_fk FOREIGN KEY(budget_revision_id) REFERENCES public.proposal_budget_revisions(id);

CREATE TABLE public.program_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL UNIQUE REFERENCES public.project_proposals(id), proposal_version_id uuid NOT NULL REFERENCES public.proposal_versions(id),
 budget_revision_id uuid NOT NULL REFERENCES public.proposal_budget_revisions(id), program_id uuid NOT NULL UNIQUE REFERENCES public.programs(id),
 handed_off_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.program_target_areas_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), source_target_area_id uuid REFERENCES public.proposal_target_areas(id),
 barangay_id uuid NOT NULL REFERENCES public.barangays(id), sitio_id uuid REFERENCES public.barangay_sitios(id), is_lead boolean NOT NULL DEFAULT false,
 UNIQUE(program_id,barangay_id,sitio_id)
);
CREATE TABLE public.program_need_links_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), source_proposal_need_link_id uuid REFERENCES public.proposal_need_links_v2(id),
 need_id uuid NOT NULL REFERENCES public.community_needs(id), intended_coverage text NOT NULL CHECK(intended_coverage IN('full','partial')), need_snapshot jsonb NOT NULL,
 UNIQUE(program_id,need_id,source_proposal_need_link_id)
);
CREATE TABLE public.program_beneficiary_plans_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), source_estimate_id uuid REFERENCES public.proposal_beneficiary_estimates(id),
 category_code text NOT NULL REFERENCES public.proposal_beneficiary_categories(code), planned_count integer NOT NULL CHECK(planned_count>0), provenance jsonb NOT NULL,
 UNIQUE(program_id,source_estimate_id)
);
CREATE TABLE public.program_sdg_links_v2 (
 program_id uuid NOT NULL REFERENCES public.programs(id), sdg_number smallint NOT NULL CHECK(sdg_number BETWEEN 1 AND 17), source text NOT NULL DEFAULT 'proposal_handoff',
 PRIMARY KEY(program_id,sdg_number)
);
CREATE TABLE public.program_budget_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), revision_number integer NOT NULL CHECK(revision_number>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','superseded')), source_proposal_budget_revision_id uuid REFERENCES public.proposal_budget_revisions(id),
 cash_total numeric(14,2) NOT NULL DEFAULT 0, in_kind_total numeric(14,2) NOT NULL DEFAULT 0, row_version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(program_id,revision_number)
);
CREATE UNIQUE INDEX program_one_active_budget_revision ON public.program_budget_revisions(program_id) WHERE status='active';
CREATE TABLE public.program_budget_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES public.program_budget_revisions(id), source_proposal_item_id uuid REFERENCES public.proposal_budget_items(id),
 category_id uuid NOT NULL REFERENCES public.budget_categories(id), item_kind text NOT NULL CHECK(item_kind IN('cash','in_kind')), description text NOT NULL,
 allocated_amount numeric(14,2) NOT NULL CHECK(allocated_amount>=0), sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE public.program_financial_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), document_type text NOT NULL,
 original_name text NOT NULL, storage_path text NOT NULL UNIQUE, sha256 text NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'), mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760), scan_status text NOT NULL DEFAULT 'quarantined' CHECK(scan_status IN('quarantined','approved','rejected','risk_accepted')),
 uploaded_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.program_expenditures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), budget_item_id uuid NOT NULL REFERENCES public.program_budget_items(id),
 amount numeric(14,2) NOT NULL CHECK(amount>0), spent_on date NOT NULL, payee_label text, description text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','verified','returned','voided','replaced')),
 receipt_document_id uuid REFERENCES public.program_financial_documents(id), receipt_exception_reason text,
 replaces_id uuid UNIQUE REFERENCES public.program_expenditures(id), row_version integer NOT NULL DEFAULT 1,
 recorded_by uuid NOT NULL REFERENCES public.users(id), reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(receipt_document_id IS NOT NULL OR length(btrim(coalesce(receipt_exception_reason,'')))>=10)
);
CREATE TABLE public.liquidation_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), revision_number integer NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','returned','verified','voided')),
 total_submitted numeric(14,2) NOT NULL DEFAULT 0 CHECK(total_submitted>=0), summary jsonb NOT NULL DEFAULT '{}', row_version integer NOT NULL DEFAULT 1,
 prepared_by uuid NOT NULL REFERENCES public.users(id), reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(program_id,revision_number)
);
CREATE TABLE public.program_finance_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), expenditure_id uuid REFERENCES public.program_expenditures(id),
 liquidation_id uuid REFERENCES public.liquidation_submissions(id), action text NOT NULL, from_status text, to_status text, reason text,
 actor_id uuid NOT NULL REFERENCES public.users(id), occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.program_handoff_reconciliation_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), program_id uuid NOT NULL REFERENCES public.programs(id),
 reason text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved','excluded')), resolved_by uuid REFERENCES public.users(id), resolved_at timestamptz,
 UNIQUE(proposal_id,program_id)
);

-- Idempotent compatibility backfill. It labels legacy structure and never
-- invents categories, sources, quantities, or evidence.
INSERT INTO public.proposal_project_categories(code,label) VALUES('legacy_unstructured','Legacy unstructured') ON CONFLICT(code) DO NOTHING;
INSERT INTO public.budget_categories(code,label) VALUES('legacy_unstructured','Legacy unstructured total') ON CONFLICT(code) DO NOTHING;
INSERT INTO public.proposal_beneficiary_categories(code,label,predicate_version,predicate_definition)
VALUES('legacy_free_text','Legacy free-text beneficiary group','legacy-v1','{"kind":"manual_only"}'::jsonb) ON CONFLICT(code) DO NOTHING;

INSERT INTO public.proposal_v2_profiles(proposal_id,workflow_status,origin_channel,originating_partner_id,responsible_officer_id,project_category_id,starts_on,ends_on,imported_from_v1)
SELECT q.id,
 CASE WHEN q.status='sdg_review' THEN 'evidence_review'
      WHEN q.status='finance_review' AND q.finance_clearance IS TRUE THEN 'director_review'
      WHEN q.status IN('draft','submitted','pre_screening','finance_review','revisions_requested','approved','rejected') THEN q.status
      ELSE 'draft' END,
 CASE WHEN m.partner_id IS NULL THEN 'paraya_internal' ELSE 'partner_document' END,m.partner_id,
 CASE WHEN creator.role IN('paraya_director','paraya_associate','paraya_researcher') THEN q.created_by ELSE staff.id END,
 c.id,q.start_date,q.end_date,true
FROM public.project_proposals q JOIN public.users creator ON creator.id=q.created_by
CROSS JOIN LATERAL(SELECT id FROM public.proposal_project_categories WHERE code='legacy_unstructured')c
CROSS JOIN LATERAL(SELECT id FROM public.users WHERE role IN('paraya_director','paraya_associate','paraya_researcher') AND status='active' ORDER BY CASE role WHEN 'paraya_associate' THEN 1 WHEN 'paraya_researcher' THEN 2 ELSE 3 END,created_at LIMIT 1)staff
LEFT JOIN public.legacy_account_partner_mappings m ON m.legacy_user_id=q.created_by
ON CONFLICT(proposal_id) DO NOTHING;

INSERT INTO public.proposal_target_areas(proposal_id,barangay_id,is_lead)
SELECT q.id,q.barangay_id,true FROM public.project_proposals q WHERE q.barangay_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.proposal_beneficiary_estimates(proposal_id,category_code,target_area_id,calculated_count,is_suppressed,final_count,source_description,source_metadata,as_of_date)
SELECT q.id,'legacy_free_text',t.id,NULL,false,greatest(coalesce(q.expected_beneficiary_count,1),1),q.target_beneficiaries,
 jsonb_build_object('kind','legacy_manual','original_count',q.expected_beneficiary_count),coalesce(q.updated_at::date,q.created_at::date,current_date)
FROM public.project_proposals q JOIN public.proposal_target_areas t ON t.proposal_id=q.id AND t.is_lead
WHERE NOT EXISTS(SELECT 1 FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=q.id);
INSERT INTO public.proposal_partner_links(proposal_id,partner_id,partner_role,created_by)
SELECT q.id,m.partner_id,'originating_proponent',q.created_by FROM public.project_proposals q JOIN public.legacy_account_partner_mappings m ON m.legacy_user_id=q.created_by
ON CONFLICT DO NOTHING;

INSERT INTO public.proposal_budget_revisions(proposal_id,revision_number,status,currency,zero_cash,zero_cash_justification,cash_total,in_kind_total,canonical_hash,created_by,submitted_by,submitted_at,cleared_by,cleared_at,created_at,updated_at)
SELECT q.id,1,CASE WHEN q.finance_clearance IS TRUE THEN 'cleared' ELSE 'draft' END,'PHP',coalesce(q.budget,0)=0,
 CASE WHEN coalesce(q.budget,0)=0 THEN 'Legacy proposal recorded with zero cash budget.' ELSE NULL END,
 coalesce(q.budget,0),0,NULL,q.created_by,CASE WHEN q.status<>'draft' THEN q.created_by ELSE NULL END,
 CASE WHEN q.status<>'draft' THEN q.updated_at ELSE NULL END,q.finance_cleared_by,q.finance_cleared_at,q.created_at,q.updated_at
FROM public.project_proposals q ON CONFLICT(proposal_id,revision_number) DO NOTHING;
INSERT INTO public.proposal_budget_items(revision_id,category_id,item_kind,description,quantity,unit,unit_cost,in_kind_valuation,sort_order)
SELECT r.id,c.id,'cash','Legacy scalar proposal budget',1,'lot',r.cash_total,NULL,0
FROM public.proposal_budget_revisions r CROSS JOIN LATERAL(SELECT id FROM public.budget_categories WHERE code='legacy_unstructured')c
WHERE NOT EXISTS(SELECT 1 FROM public.proposal_budget_items i WHERE i.revision_id=r.id) AND r.cash_total>0;
UPDATE public.proposal_v2_profiles p SET active_budget_revision_id=r.id
FROM public.proposal_budget_revisions r WHERE r.proposal_id=p.proposal_id AND p.active_budget_revision_id IS NULL;

INSERT INTO public.proposal_versions(proposal_id,version_number,reason,snapshot,canonical_hash,created_by,created_at)
SELECT q.id,1,'imported_v1',
 jsonb_build_object('title',q.title,'rationale',q.rationale,'objectives',q.objectives,'target_beneficiaries',q.target_beneficiaries,'expected_beneficiary_count',q.expected_beneficiary_count,'barangay_id',q.barangay_id,'start_date',q.start_date,'end_date',q.end_date,'budget',q.budget,'legacy_status',q.status),
 encode(extensions.digest(convert_to(jsonb_build_object('id',q.id,'title',q.title,'updated_at',q.updated_at)::text,'UTF8'),'sha256'),'hex'),
 q.created_by,q.created_at FROM public.project_proposals q ON CONFLICT(proposal_id,version_number) DO NOTHING;
UPDATE public.proposal_v2_profiles p SET active_version_id=v.id FROM public.proposal_versions v
WHERE v.proposal_id=p.proposal_id AND v.version_number=1 AND p.active_version_id IS NULL;
INSERT INTO public.proposal_workflow_events_v2(proposal_id,action,to_status,proposal_version_id,budget_revision_id,remarks,actor_id,occurred_at)
SELECT p.proposal_id,'imported_v1',p.workflow_status,p.active_version_id,p.active_budget_revision_id,'Imported without changing V1 actor or status history.',q.created_by,q.created_at
FROM public.proposal_v2_profiles p JOIN public.project_proposals q ON q.id=p.proposal_id
WHERE NOT EXISTS(SELECT 1 FROM public.proposal_workflow_events_v2 e WHERE e.proposal_id=p.proposal_id AND e.action='imported_v1');

-- Immutable finalized records and event streams.
CREATE OR REPLACE FUNCTION public.phase2_guard_budget_immutability() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN IF OLD.status IN('cleared','superseded') THEN RAISE EXCEPTION 'finalized budget revision is immutable' USING ERRCODE='42501'; END IF; RETURN NEW; END;$function$;
CREATE TRIGGER proposal_budget_finalized_guard BEFORE UPDATE OR DELETE ON public.proposal_budget_revisions FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_budget_immutability();
CREATE TRIGGER proposal_versions_immutable BEFORE UPDATE OR DELETE ON public.proposal_versions FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
CREATE TRIGGER proposal_workflow_events_immutable BEFORE UPDATE OR DELETE ON public.proposal_workflow_events_v2 FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
CREATE TRIGGER budget_review_events_immutable BEFORE UPDATE OR DELETE ON public.budget_review_events FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
CREATE TRIGGER program_finance_events_immutable BEFORE UPDATE OR DELETE ON public.program_finance_events FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

DO $secure_tables$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['proposal_project_categories','project_templates','proposal_beneficiary_categories','proposal_v2_profiles','proposal_target_areas','proposal_need_links_v2','proposal_beneficiary_estimates','proposal_versions','proposal_workflow_events_v2','budget_categories','proposal_budget_revisions','proposal_budget_items','proposal_budget_funding_sources','proposal_budget_documents','budget_review_events','program_handoffs','program_target_areas_v2','program_need_links_v2','program_beneficiary_plans_v2','program_sdg_links_v2','program_budget_revisions','program_budget_items','program_financial_documents','program_expenditures','liquidation_submissions','program_finance_events','program_handoff_reconciliation_queue'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.%I FROM authenticated,anon',t);
  EXECUTE format('CREATE POLICY phase2_service_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false)',t);
 END LOOP;
END;$secure_tables$;

REVOKE ALL ON FUNCTION public.phase2_guard_budget_immutability() FROM PUBLIC,anon;
COMMIT;
