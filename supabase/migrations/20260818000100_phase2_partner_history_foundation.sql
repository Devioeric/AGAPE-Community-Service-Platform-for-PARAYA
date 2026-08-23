-- Phase 2.1-2.3 dark-launch foundation: generalized Partners, legacy mapping,
-- and historical programs. DO NOT APPLY outside a disposable clone until the
-- Phase 1 release gate and canonical baseline replay have passed.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.barangays') IS NULL
     OR to_regclass('public.project_proposals') IS NULL OR to_regclass('public.programs') IS NULL
     OR to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 requires the reconciled pre-Phase-0 canonical baseline';
  END IF;
  IF to_regprocedure('public.phase1_current_has_capability(text)') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 requires the Phase 1 authorization closure';
  END IF;
END;
$preflight$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.phase2_component_runtime (
  component text PRIMARY KEY CHECK (component IN ('partners','historical_programs','proposals','program_finance','external_contact_email')),
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN ('off','synthetic','live')),
  synthetic_user_ids uuid[] NOT NULL DEFAULT '{}', synthetic_entity_ids uuid[] NOT NULL DEFAULT '{}',
  implementation_date date, retrospective_years smallint NOT NULL DEFAULT 5 CHECK (retrospective_years BETWEEN 1 AND 10),
  configuration jsonb NOT NULL DEFAULT '{}', updated_by uuid REFERENCES public.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.phase2_component_runtime(component) VALUES
 ('partners'),('historical_programs'),('proposals'),('program_finance'),('external_contact_email')
ON CONFLICT (component) DO NOTHING;

CREATE OR REPLACE FUNCTION public.phase2_assert_runtime(p_component text, p_entity_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase2_component_runtime; actor public.users;
BEGIN
  SELECT * INTO cfg FROM public.phase2_component_runtime WHERE component=p_component;
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE THEN RAISE EXCEPTION 'inactive actor' USING ERRCODE='42501'; END IF;
  IF cfg.mode='off' THEN RAISE EXCEPTION 'Phase 2 component is off' USING ERRCODE='42501'; END IF;
  IF cfg.mode='synthetic' AND NOT (actor.is_synthetic_test IS TRUE AND actor.id=ANY(cfg.synthetic_user_ids)) THEN
    RAISE EXCEPTION 'actor is not synthetic-allowlisted' USING ERRCODE='42501';
  END IF;
  IF cfg.mode='synthetic' AND p_entity_id IS NOT NULL AND NOT p_entity_id=ANY(cfg.synthetic_entity_ids) THEN
    RAISE EXCEPTION 'entity is not synthetic-allowlisted' USING ERRCODE='42501';
  END IF;
END;
$function$;

CREATE SEQUENCE public.partner_entity_code_seq;
CREATE TABLE public.partner_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('PTR-'||lpad(nextval('public.partner_entity_code_seq')::text,6,'0')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160), legal_name text,
  entity_type text NOT NULL CHECK (entity_type IN ('barangay','dyci_office','student_organization','academic_department','external_organization','government_agency','school','faith_based','other')),
  classification text NOT NULL CHECK (classification IN ('internal','external')),
  lifecycle text NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active','inactive','merged')),
  barangay_id uuid UNIQUE REFERENCES public.barangays(id), merged_into_id uuid REFERENCES public.partner_entities(id),
  source_kind text NOT NULL DEFAULT 'native' CHECK (source_kind IN ('native','barangay_backfill','legacy_account')),
  source_key text UNIQUE, row_version integer NOT NULL DEFAULT 1 CHECK (row_version>0),
  created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lifecycle='merged')=(merged_into_id IS NOT NULL)), CHECK (merged_into_id IS NULL OR merged_into_id<>id)
);
CREATE TABLE public.partner_entity_roles (
  partner_id uuid NOT NULL REFERENCES public.partner_entities(id), role text NOT NULL CHECK(role IN('partner','proponent')),
  created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(partner_id,role)
);
CREATE TABLE public.partner_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partner_entities(id),
  full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 1 AND 160), title text, email text, phone text,
  preferred_channel text NOT NULL DEFAULT 'manual' CHECK(preferred_channel IN('email','phone','manual')),
  is_primary boolean NOT NULL DEFAULT false, status_email_opt_in boolean NOT NULL DEFAULT false,
  consent_source text, consent_at timestamptz, active_from date NOT NULL, active_until date,
  row_version integer NOT NULL DEFAULT 1, created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(active_until IS NULL OR active_until>=active_from),
  CHECK(NOT status_email_opt_in OR (email IS NOT NULL AND consent_source IS NOT NULL AND consent_at IS NOT NULL))
);
CREATE UNIQUE INDEX partner_contacts_one_active_primary ON public.partner_contacts(partner_id) WHERE is_primary AND active_until IS NULL;
CREATE TABLE public.partner_type_policies (
  entity_type text PRIMARY KEY CHECK(entity_type IN ('barangay','dyci_office','student_organization','academic_department','external_organization','government_agency','school','faith_based','other')),
  agreement_required boolean NOT NULL, effective_from date NOT NULL, changed_by uuid REFERENCES public.users(id), changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.partner_type_policies(entity_type,agreement_required,effective_from) VALUES
 ('barangay',true,current_date),('external_organization',true,current_date),('dyci_office',false,current_date),
 ('academic_department',false,current_date),('student_organization',false,current_date),('government_agency',true,current_date),
 ('school',true,current_date),('faith_based',true,current_date),('other',true,current_date);
CREATE TABLE public.partnership_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partner_entities(id),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','active','suspended','ended')),
  starts_on date NOT NULL, expires_on date, ends_on date, responsible_officer_id uuid NOT NULL REFERENCES public.users(id),
  renewed_from_id uuid UNIQUE REFERENCES public.partnership_terms(id), agreement_exception_reason text, agreement_exception_due_on date,
  row_version integer NOT NULL DEFAULT 1, created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_on IS NULL OR expires_on>=starts_on), CHECK(ends_on IS NULL OR ends_on>=starts_on),
  CHECK((agreement_exception_reason IS NULL)=(agreement_exception_due_on IS NULL))
);
CREATE UNIQUE INDEX partnership_terms_one_open ON public.partnership_terms(partner_id) WHERE status IN('proposed','active','suspended');
CREATE TABLE public.partnership_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partner_entities(id), term_id uuid REFERENCES public.partnership_terms(id),
  document_type text NOT NULL CHECK(document_type IN('moa','mou','agreement','renewal','other')),
  original_name text NOT NULL, storage_path text NOT NULL UNIQUE, sha256 text NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'),
  mime_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
  effective_on date, expires_on date, visibility text NOT NULL DEFAULT 'paraya_only' CHECK(visibility IN('paraya_only','linked_barangay')),
  scan_status text NOT NULL DEFAULT 'quarantined' CHECK(scan_status IN('quarantined','approved','rejected','risk_accepted')),
  uploaded_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partnership_terms ADD COLUMN agreement_document_id uuid REFERENCES public.partnership_documents(id);
CREATE TABLE public.partnership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partner_entities(id), term_id uuid REFERENCES public.partnership_terms(id),
  event_type text NOT NULL, actor_id uuid REFERENCES public.users(id), reason text, snapshot jsonb NOT NULL DEFAULT '{}',
  legacy_event_id uuid UNIQUE, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.partnership_need_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES public.partnership_terms(id), need_id uuid NOT NULL REFERENCES public.community_needs(id),
  coverage text NOT NULL CHECK(coverage IN('unaddressed','partial','addressed')), notes text, evidence jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(term_id,need_id)
);
CREATE TABLE public.program_partner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.programs(id), partner_id uuid NOT NULL REFERENCES public.partner_entities(id),
  partner_role text NOT NULL CHECK(partner_role IN('lead_implementer','co_implementer','host_community','funder','resource_partner')),
  created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(program_id,partner_id,partner_role)
);
CREATE TABLE public.proposal_partner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.project_proposals(id), partner_id uuid NOT NULL REFERENCES public.partner_entities(id),
  partner_role text NOT NULL CHECK(partner_role IN('originating_proponent','co_proponent')),
  created_by uuid REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(proposal_id,partner_id,partner_role)
);
CREATE UNIQUE INDEX proposal_one_originating_proponent ON public.proposal_partner_links(proposal_id) WHERE partner_role='originating_proponent';
CREATE TABLE public.legacy_account_partner_mappings (
  legacy_user_id uuid PRIMARY KEY REFERENCES public.users(id), partner_id uuid NOT NULL REFERENCES public.partner_entities(id),
  responsible_officer_id uuid REFERENCES public.users(id), reconciliation_status text NOT NULL DEFAULT 'candidate' CHECK(reconciliation_status IN('candidate','in_review','approved','signed_off','suspended')),
  proposal_count integer NOT NULL DEFAULT 0, program_count integer NOT NULL DEFAULT 0, pending_work_count integer NOT NULL DEFAULT 0,
  notification_contact text, review_cutoff timestamptz, approved_by uuid REFERENCES public.users(id), approved_at timestamptz,
  signed_off_by uuid REFERENCES public.users(id), signed_off_at timestamptz, notes text, row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(reconciliation_status IN('candidate','in_review') OR responsible_officer_id IS NOT NULL)
);

CREATE SEQUENCE public.historical_program_code_seq;
CREATE TABLE public.historical_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE DEFAULT ('HIST-'||lpad(nextval('public.historical_program_code_seq')::text,6,'0')),
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160), summary text, category text NOT NULL,
  date_precision text NOT NULL CHECK(date_precision IN('exact','month','year','unknown')), starts_on date, ends_on date,
  beneficiary_count integer CHECK(beneficiary_count>=0), volunteer_count integer CHECK(volunteer_count>=0), volunteer_hours numeric(14,2) CHECK(volunteer_hours>=0),
  budget_total numeric(14,2) CHECK(budget_total>=0), currency text NOT NULL DEFAULT 'PHP' CHECK(currency='PHP'),
  resources text, historical_need_description text, outcomes text, follow_up text,
  source_type text NOT NULL CHECK(source_type IN('excel','word','pdf','paper','database','other')), source_notes text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','pending_review','accepted','returned','archived')),
  quality text NOT NULL DEFAULT 'unverified' CHECK(quality IN('complete','partial_verified','partial_unverified','unverified')),
  row_version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES public.users(id), reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((date_precision='unknown')=(starts_on IS NULL)), CHECK(ends_on IS NULL OR starts_on IS NOT NULL AND ends_on>=starts_on)
);
CREATE TABLE public.historical_program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), historical_program_id uuid NOT NULL REFERENCES public.historical_programs(id),
  version_number integer NOT NULL CHECK(version_number>0), snapshot jsonb NOT NULL, canonical_hash text NOT NULL CHECK(canonical_hash~'^[0-9a-f]{64}$'),
  reason text NOT NULL, created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(historical_program_id,version_number)
);
CREATE TABLE public.historical_program_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), historical_program_id uuid NOT NULL REFERENCES public.historical_programs(id),
  action text NOT NULL, from_status text, to_status text, quality text, remarks text, actor_id uuid NOT NULL REFERENCES public.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.historical_program_partner_links (historical_program_id uuid REFERENCES public.historical_programs(id), partner_id uuid REFERENCES public.partner_entities(id), PRIMARY KEY(historical_program_id,partner_id));
CREATE TABLE public.historical_program_barangay_links (historical_program_id uuid REFERENCES public.historical_programs(id), barangay_id uuid REFERENCES public.barangays(id), PRIMARY KEY(historical_program_id,barangay_id));
CREATE TABLE public.historical_program_sdg_links (historical_program_id uuid REFERENCES public.historical_programs(id), sdg_number smallint CHECK(sdg_number BETWEEN 1 AND 17), classification_source text NOT NULL CHECK(classification_source IN('documented','retrospective')), PRIMARY KEY(historical_program_id,sdg_number));
CREATE TABLE public.historical_program_need_links (historical_program_id uuid REFERENCES public.historical_programs(id), need_id uuid REFERENCES public.community_needs(id), PRIMARY KEY(historical_program_id,need_id));
CREATE TABLE public.historical_program_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), historical_program_id uuid NOT NULL REFERENCES public.historical_programs(id), original_name text NOT NULL,
  storage_path text NOT NULL UNIQUE, sha256 text NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'), mime_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
  scan_status text NOT NULL DEFAULT 'quarantined' CHECK(scan_status IN('quarantined','approved','rejected','risk_accepted')), uploaded_by uuid REFERENCES public.users(id), created_at timestamptz DEFAULT now()
);
CREATE TABLE public.historical_program_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_hash text NOT NULL UNIQUE CHECK(file_hash~'^[0-9a-f]{64}$'), template_version text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded' CHECK(status IN('uploaded','validating','needs_correction','ready','committed','failed','purged')),
  row_count integer NOT NULL DEFAULT 0 CHECK(row_count BETWEEN 0 AND 10000), error_count integer NOT NULL DEFAULT 0,
  replaced_batch_id uuid REFERENCES public.historical_program_import_batches(id), committed_at timestamptz, created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(), purge_after timestamptz NOT NULL DEFAULT now()+interval '30 days'
);
CREATE TABLE public.historical_program_import_rows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.historical_program_import_batches(id), row_key text NOT NULL, sanitized_data jsonb, errors jsonb NOT NULL DEFAULT '[]', UNIQUE(batch_id,row_key));
CREATE TABLE public.historical_program_duplicate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.historical_program_import_batches(id), row_key text NOT NULL,
  candidate_program_id uuid REFERENCES public.historical_programs(id), outcome text CHECK(outcome IN('link_existing','distinct','exclude')),
  decided_by uuid REFERENCES public.users(id), decided_at timestamptz, reason text, UNIQUE(batch_id,row_key,candidate_program_id)
);

CREATE TABLE public.partner_contact_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL REFERENCES public.partner_contacts(id), template_key text NOT NULL,
  template_version integer NOT NULL, payload jsonb NOT NULL, idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'suppressed' CHECK(status IN('queued','suppressed','sending','sent','failed','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0, next_attempt_at timestamptz, last_error text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

-- Immutable history is correction-only: append a new event/version.
CREATE OR REPLACE FUNCTION public.phase2_reject_immutable_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME USING ERRCODE='42501'; END;$function$;
CREATE TRIGGER partnership_events_immutable BEFORE UPDATE OR DELETE ON public.partnership_events FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
CREATE TRIGGER historical_program_versions_immutable BEFORE UPDATE OR DELETE ON public.historical_program_versions FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
CREATE TRIGGER historical_program_events_immutable BEFORE UPDATE OR DELETE ON public.historical_program_events FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

CREATE OR REPLACE FUNCTION public.phase2_enforce_agreement_activation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE required boolean; policy_date date;
BEGIN
 IF NEW.status<>'active' THEN RETURN NEW; END IF;
 SELECT p.agreement_required,p.effective_from INTO required,policy_date FROM public.partner_entities e JOIN public.partner_type_policies p ON p.entity_type=e.entity_type WHERE e.id=NEW.partner_id;
 IF required AND NEW.starts_on>=policy_date AND NEW.agreement_document_id IS NULL
    AND (NEW.agreement_exception_reason IS NULL OR NEW.agreement_exception_due_on IS NULL) THEN
  RAISE EXCEPTION 'active relationship requires agreement metadata or Director exception' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;$function$;
CREATE TRIGGER partnership_term_agreement_guard BEFORE INSERT OR UPDATE ON public.partnership_terms FOR EACH ROW EXECUTE FUNCTION public.phase2_enforce_agreement_activation();

-- Idempotent, non-destructive compatibility backfill. Similar names are never merged.
INSERT INTO public.partner_entities(name,legal_name,entity_type,classification,barangay_id,source_kind,source_key)
SELECT b.name,b.name,'barangay','external',b.id,'barangay_backfill','barangay:'||b.id::text FROM public.barangays b
ON CONFLICT(source_key) DO NOTHING;
INSERT INTO public.partner_entity_roles(partner_id,role)
SELECT p.id,r.role FROM public.partner_entities p CROSS JOIN (VALUES('partner'),('proponent')) r(role) WHERE p.source_kind='barangay_backfill'
ON CONFLICT DO NOTHING;
INSERT INTO public.partner_contacts(partner_id,full_name,title,email,phone,preferred_channel,is_primary,active_from,created_at)
SELECT p.id,b.contact_person,'Barangay contact',b.contact_email,b.contact_phone,
 CASE WHEN b.contact_email IS NOT NULL THEN 'email' WHEN b.contact_phone IS NOT NULL THEN 'phone' ELSE 'manual' END,
 true,coalesce(b.partnership_start,b.created_at::date,current_date),coalesce(b.created_at,now())
FROM public.barangays b JOIN public.partner_entities p ON p.barangay_id=b.id
WHERE nullif(btrim(coalesce(b.contact_person,'')),'') IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.partnership_terms(partner_id,status,starts_on,responsible_officer_id,created_at)
SELECT p.id,CASE WHEN b.is_active THEN 'active' ELSE 'ended' END,coalesce(b.partnership_start,b.created_at::date,current_date),u.id,coalesce(b.created_at,now())
FROM public.barangays b JOIN public.partner_entities p ON p.barangay_id=b.id
CROSS JOIN LATERAL(SELECT id FROM public.users WHERE role='paraya_director' ORDER BY created_at LIMIT 1)u
WHERE NOT EXISTS(SELECT 1 FROM public.partnership_terms t WHERE t.partner_id=p.id);
INSERT INTO public.partnership_events(partner_id,event_type,actor_id,reason,snapshot,legacy_event_id,occurred_at)
SELECT p.id,'legacy_history_imported',h.officer_id,h.notes,jsonb_build_object('event_type',h.event_type,'date',h.date),h.id,coalesce(h.created_at,h.date::timestamptz,now())
FROM public.partnership_history h JOIN public.partner_entities p ON p.barangay_id=h.barangay_id
ON CONFLICT(legacy_event_id) DO NOTHING;

-- One provisional entity per legacy identity. Name similarity is never used as
-- an identity key and no account is suspended by this migration.
INSERT INTO public.partner_entities(name,entity_type,classification,source_kind,source_key)
SELECT coalesce(nullif(btrim(u.org_name),''),u.full_name,u.email),
 CASE u.role WHEN 'office' THEN 'dyci_office' WHEN 'student_org' THEN 'student_organization' ELSE 'academic_department' END,
 'internal','legacy_account','legacy-user:'||u.id::text FROM public.users u WHERE u.role IN('office','student_org','department')
ON CONFLICT(source_key) DO NOTHING;
INSERT INTO public.partner_entity_roles(partner_id,role)
SELECT p.id,r.role FROM public.partner_entities p CROSS JOIN(VALUES('partner'),('proponent'))r(role) WHERE p.source_kind='legacy_account'
ON CONFLICT DO NOTHING;
INSERT INTO public.legacy_account_partner_mappings(legacy_user_id,partner_id,proposal_count,program_count,pending_work_count)
SELECT u.id,p.id,
 (SELECT count(*) FROM public.project_proposals q WHERE q.created_by=u.id),
 (SELECT count(*) FROM public.programs g WHERE g.created_by=u.id),
 (SELECT count(*) FROM public.project_proposals q WHERE q.created_by=u.id AND q.status NOT IN('approved','rejected'))
FROM public.users u JOIN public.partner_entities p ON p.source_key='legacy-user:'||u.id::text
WHERE u.role IN('office','student_org','department') ON CONFLICT(legacy_user_id) DO NOTHING;

-- Direct table mutation is denied. Reviewed fixed-shape RPCs are the write boundary.
DO $secure_tables$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['phase2_component_runtime','partner_entities','partner_entity_roles','partner_contacts','partner_type_policies','partnership_terms','partnership_documents','partnership_events','partnership_need_links','program_partner_links','proposal_partner_links','legacy_account_partner_mappings','historical_programs','historical_program_versions','historical_program_events','historical_program_partner_links','historical_program_barangay_links','historical_program_sdg_links','historical_program_need_links','historical_program_documents','historical_program_import_batches','historical_program_import_rows','historical_program_duplicate_decisions','partner_contact_email_outbox'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.%I FROM authenticated,anon',t);
    EXECUTE format('CREATE POLICY phase2_service_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false)',t);
  END LOOP;
END;$secure_tables$;

-- Expand table-module mapping before any later catalog verification.
CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_table LIKE 'partner%' OR p_table LIKE 'partnership%' OR p_table='legacy_account_partner_mappings' THEN CASE WHEN p_table LIKE '%document%' THEN 'partner_documents' ELSE 'partnerships' END
  WHEN p_table LIKE 'historical_program%' THEN 'historical_programs'
  WHEN p_table LIKE 'proposal%' OR p_table='project_proposals' THEN 'proposals'
  WHEN p_table LIKE 'program%' OR p_table='activity_photos' THEN 'programs'
  WHEN p_table LIKE 'budget%' THEN 'budgets'
  WHEN p_table='phase2_component_runtime' THEN 'audit_logs'
  WHEN p_table='users' THEN 'user_management' WHEN p_table='audit_logs' THEN 'audit_logs'
  WHEN p_table='barangays' THEN 'partnerships' WHEN p_table LIKE 'volunteer%' THEN 'volunteers'
  WHEN p_table LIKE 'survey%' THEN 'surveys' WHEN p_table='community_needs' THEN 'community_needs'
  WHEN p_table='field_observations' THEN 'observations'
  WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets') THEN 'skills_assets'
  WHEN p_table='attendance' THEN 'attendance' WHEN p_table='activity_logs' THEN 'activity_logs'
  WHEN p_table LIKE 'donation%' THEN 'donations'
  WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' THEN 'impact'
  WHEN p_table LIKE 'analytics%' THEN 'analytics' WHEN p_table LIKE 'ai_report%' THEN 'reports'
  WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments') THEN 'communication'
  WHEN p_table='domain_correction_events' THEN 'audit_logs'
  WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles') THEN 'profiling'
  ELSE NULL END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_assert_runtime(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_reject_immutable_change() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_enforce_agreement_activation() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_assert_runtime(text,uuid) TO authenticated,service_role;

COMMIT;
