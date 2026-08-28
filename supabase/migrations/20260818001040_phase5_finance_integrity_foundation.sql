-- Finance integrity foundation. This records provider-neutral cryptographic
-- proofs for Finance-cleared proposal budgets and Finance-verified
-- liquidations. AGAPE remains the operational source of truth and never sends
-- financial descriptions, documents, contacts, payees, or receipts to a chain.
BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.phase5_integrity_runtime (
  component text PRIMARY KEY CHECK (component='finance_integrity'),
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN('off','synthetic','live')),
  synthetic_user_ids uuid[] NOT NULL DEFAULT '{}',
  synthetic_source_ids uuid[] NOT NULL DEFAULT '{}',
  provider_key text NOT NULL DEFAULT 'unconfigured' CHECK (provider_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  network_key text CHECK (network_key IS NULL OR network_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  contract_reference text CHECK (contract_reference IS NULL OR length(contract_reference) BETWEEN 1 AND 200),
  row_version bigint NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.phase5_integrity_runtime(component,mode)
VALUES('finance_integrity','off') ON CONFLICT(component) DO NOTHING;

ALTER TABLE public.liquidation_submissions
  ADD COLUMN integrity_schema text,
  ADD COLUMN integrity_snapshot jsonb,
  ADD COLUMN integrity_hash text CHECK (integrity_hash IS NULL OR integrity_hash ~ '^[0-9a-f]{64}$');

CREATE TABLE public.finance_integrity_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_code uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  source_type text NOT NULL CHECK (source_type IN('finance_cleared_budget','verified_liquidation')),
  source_id uuid NOT NULL,
  source_root_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version>0),
  source_row_version bigint NOT NULL CHECK (source_row_version>0),
  source_validity text NOT NULL DEFAULT 'active' CHECK (source_validity IN('active','superseded','voided')),
  canonical_schema text NOT NULL CHECK (canonical_schema IN('agape.finance.cleared-budget.v1','agape.finance.verified-liquidation.v1')),
  canonical_hash text NOT NULL CHECK (canonical_hash ~ '^[0-9a-f]{64}$'),
  data_mode text NOT NULL CHECK (data_mode IN('synthetic','live')),
  anchor_status text NOT NULL DEFAULT 'queued' CHECK (anchor_status IN('queued','submitting','anchored','failed','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  claim_token uuid,
  network_key text CHECK (network_key IS NULL OR network_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  transaction_hash text CHECK (transaction_hash IS NULL OR transaction_hash ~ '^(0x)?[A-Fa-f0-9]{32,128}$'),
  block_reference text CHECK (block_reference IS NULL OR block_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  contract_reference text CHECK (contract_reference IS NULL OR length(contract_reference) BETWEEN 1 AND 200),
  anchored_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  row_version bigint NOT NULL DEFAULT 1,
  requested_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type,source_id,source_version,canonical_hash),
  CHECK ((anchor_status='submitting')=(claim_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK (anchor_status<>'anchored' OR (transaction_hash IS NOT NULL AND network_key IS NOT NULL AND anchored_at IS NOT NULL))
);

CREATE INDEX finance_integrity_proofs_queue
  ON public.finance_integrity_proofs(next_attempt_at,created_at)
  WHERE anchor_status IN('queued','failed');
CREATE INDEX finance_integrity_proofs_source
  ON public.finance_integrity_proofs(source_type,source_root_id,created_at DESC);

CREATE TABLE public.finance_integrity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id uuid NOT NULL REFERENCES public.finance_integrity_proofs(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN(
    'requested','claimed','lease_recovered','anchored','retry_scheduled','cancelled','source_superseded','source_voided'
  )),
  actor_id uuid REFERENCES public.users(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER finance_integrity_events_immutable
BEFORE UPDATE OR DELETE ON public.finance_integrity_events
FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

ALTER TABLE public.phase5_integrity_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integrity_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integrity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY phase5_integrity_runtime_rpc_only
ON public.phase5_integrity_runtime AS RESTRICTIVE FOR ALL TO public
USING(false) WITH CHECK(false);
CREATE POLICY finance_integrity_proofs_rpc_only
ON public.finance_integrity_proofs AS RESTRICTIVE FOR ALL TO public
USING(false) WITH CHECK(false);
CREATE POLICY finance_integrity_events_rpc_only
ON public.finance_integrity_events AS RESTRICTIVE FOR ALL TO public
USING(false) WITH CHECK(false);

REVOKE ALL ON TABLE public.phase5_integrity_runtime FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.finance_integrity_proofs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.finance_integrity_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.phase2_permission_module(p_capability text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_capability LIKE 'integrity.%' THEN 'financial_integrity'
  WHEN p_capability LIKE 'partner.document.%' THEN 'partner_documents'
  WHEN p_capability LIKE 'partner.%' OR p_capability LIKE 'partnership.%' THEN 'partnerships'
  WHEN p_capability LIKE 'historical_program.%' THEN 'historical_programs'
  WHEN p_capability LIKE 'budget.%' THEN 'budgets'
  ELSE public.phase1_permission_module(p_capability) END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT public.phase1_role_has_capability(p_role,p_capability) OR CASE
  WHEN p_role='paraya_director' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.category.manage',
   'ai.recommendation.review','ai.recommendation.configure','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review',
   'integrity.finance.read','integrity.finance.request'])
  WHEN p_role='paraya_associate' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','proposal.submit','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='paraya_researcher' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'ai.recommendation.review','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='finance_officer' THEN p_capability=ANY(ARRAY[
   'budget.read','budget.review','budget.liquidation.review','integrity.finance.read','integrity.finance.request'])
  WHEN p_role IN('barangay_captain','barangay_secretary') THEN p_capability='historical_program.read'
  WHEN p_role='volunteer' THEN p_capability='volunteer.preferences.manage'
  WHEN p_role='admin' THEN p_capability='integrity.provider.manage'
  ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_assert_integrity_actor()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase5_integrity_runtime; actor public.users;
BEGIN
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity';
 IF cfg.component IS NULL OR cfg.mode='off' THEN RAISE EXCEPTION 'Finance integrity is off' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE THEN RAISE EXCEPTION 'inactive actor' USING ERRCODE='42501'; END IF;
 IF cfg.mode='synthetic' AND NOT (actor.is_synthetic_test IS TRUE AND actor.id=ANY(cfg.synthetic_user_ids)) THEN
   RAISE EXCEPTION 'actor is not synthetic-allowlisted' USING ERRCODE='42501';
 END IF;
 RETURN cfg.mode;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_integrity_source_mode(p_source_type text,p_source_id uuid)
RETURNS TABLE(data_mode text,root_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT p.data_mode,p.proposal_id FROM public.proposal_budget_revisions r
 JOIN public.proposal_v2_profiles p ON p.proposal_id=r.proposal_id
 WHERE p_source_type='finance_cleared_budget' AND r.id=p_source_id
 UNION ALL
 SELECT p.phase2_data_mode,p.id FROM public.liquidation_submissions l
 JOIN public.programs p ON p.id=l.program_id
 WHERE p_source_type='verified_liquidation' AND l.id=p_source_id;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_assert_integrity_source(p_source_type text,p_source_id uuid)
RETURNS TABLE(data_mode text,root_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; resolved_mode text; resolved_root uuid; cfg public.phase5_integrity_runtime;
BEGIN
 active_mode:=public.phase5_assert_integrity_actor();
 SELECT s.data_mode,s.root_id INTO resolved_mode,resolved_root FROM public.phase5_integrity_source_mode(p_source_type,p_source_id) s;
 IF resolved_root IS NULL OR resolved_mode IS DISTINCT FROM active_mode THEN RAISE EXCEPTION 'source is outside the active integrity mode' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity';
 IF active_mode='synthetic' AND NOT resolved_root=ANY(cfg.synthetic_source_ids) THEN
   RAISE EXCEPTION 'source is not synthetic-allowlisted' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT resolved_mode,resolved_root;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_liquidation_snapshot(p_liquidation_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT jsonb_build_object(
   'schema','agape.finance.verified-liquidation.v1',
   'liquidationId',l.id,
   'programId',l.program_id,
   'revisionNumber',l.revision_number,
   'totalSubmitted',l.total_submitted::text,
   'periodStart',l.summary->>'period_start',
   'periodEnd',l.summary->>'period_end',
   'claims',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'expenditureId',x.expenditure_id,'amount',x.amount_snapshot::text
   ) ORDER BY x.expenditure_id) FROM public.liquidation_expenditures x
   WHERE x.liquidation_id=l.id AND x.released_at IS NULL),'[]'::jsonb)
 ) FROM public.liquidation_submissions l WHERE l.id=p_liquidation_id;
$function$;

UPDATE public.liquidation_submissions l SET
 integrity_schema='agape.finance.verified-liquidation.v1',
 integrity_snapshot=public.phase5_liquidation_snapshot(l.id),
 integrity_hash=encode(extensions.digest(convert_to(public.phase5_liquidation_snapshot(l.id)::text,'UTF8'),'sha256'),'hex')
WHERE l.status='verified' AND l.integrity_hash IS NULL;

CREATE OR REPLACE FUNCTION public.phase2_apply_liquidation_action_v2(
 p_program_id uuid,p_liquidation_id uuid,p_action text,p_expected_version integer,p_remarks text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE status_value text; item public.liquidation_submissions; snap jsonb; snap_hash text;
BEGIN
 status_value:=public.phase2_apply_liquidation_action(p_program_id,p_liquidation_id,p_action,p_expected_version,p_remarks);
 IF p_action='verify' THEN
   snap:=public.phase5_liquidation_snapshot(p_liquidation_id);
   IF snap IS NULL THEN RAISE EXCEPTION 'verified liquidation snapshot is unavailable' USING ERRCODE='23514'; END IF;
   snap_hash:=encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex');
   UPDATE public.liquidation_submissions SET integrity_schema='agape.finance.verified-liquidation.v1',
     integrity_snapshot=snap,integrity_hash=snap_hash WHERE id=p_liquidation_id AND program_id=p_program_id;
 END IF;
 SELECT * INTO item FROM public.liquidation_submissions WHERE id=p_liquidation_id AND program_id=p_program_id;
 RETURN jsonb_build_object('id',item.id,'status',status_value,'totalSubmitted',item.total_submitted::text,
   'integrityHash',item.integrity_hash,'rowVersion',item.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_configure_integrity_runtime(
 p_mode text,p_synthetic_user_ids uuid[] DEFAULT '{}',p_synthetic_source_ids uuid[] DEFAULT '{}',
 p_provider_key text DEFAULT 'unconfigured',p_network_key text DEFAULT NULL,p_contract_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE users_value uuid[]:=coalesce(p_synthetic_user_ids,'{}'); sources_value uuid[]:=coalesce(p_synthetic_source_ids,'{}'); saved public.phase5_integrity_runtime;
BEGIN
 IF NOT public.phase2_current_has_capability('integrity.provider.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_mode NOT IN('off','synthetic','live') OR p_provider_key !~ '^[a-z][a-z0-9_-]{0,63}$' THEN RAISE EXCEPTION 'invalid integrity runtime' USING ERRCODE='22023'; END IF;
 IF p_mode='off' THEN users_value:='{}'; sources_value:='{}'; END IF;
 IF p_mode='synthetic' THEN
   IF cardinality(users_value)=0 OR cardinality(sources_value)=0 THEN RAISE EXCEPTION 'synthetic mode requires actor and source allowlists' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM unnest(users_value) id WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=id AND u.is_synthetic_test IS TRUE AND u.status='active' AND u.is_active IS TRUE)) THEN
     RAISE EXCEPTION 'synthetic user allowlist is invalid' USING ERRCODE='23514';
   END IF;
   IF EXISTS(SELECT 1 FROM unnest(sources_value) id WHERE NOT EXISTS(SELECT 1 FROM public.proposal_v2_profiles p WHERE p.proposal_id=id AND p.data_mode='synthetic')
     AND NOT EXISTS(SELECT 1 FROM public.programs p WHERE p.id=id AND p.phase2_data_mode='synthetic')) THEN
     RAISE EXCEPTION 'synthetic source allowlist is invalid' USING ERRCODE='23514';
   END IF;
 END IF;
 IF p_mode='live' AND (p_provider_key='unconfigured' OR p_network_key IS NULL) THEN RAISE EXCEPTION 'live mode requires a reviewed provider and network' USING ERRCODE='23514'; END IF;
 UPDATE public.phase5_integrity_runtime SET mode=p_mode,synthetic_user_ids=users_value,synthetic_source_ids=sources_value,
   provider_key=p_provider_key,network_key=p_network_key,contract_reference=p_contract_reference,
   row_version=row_version+1,updated_by=auth.uid(),updated_at=now()
 WHERE component='finance_integrity' RETURNING * INTO saved;
 IF saved.component IS NULL THEN RAISE EXCEPTION 'integrity runtime configuration is missing' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,level,metadata)
 VALUES(auth.uid(),'integrity.runtime.configure','phase5_integrity_runtime','finance_integrity','warning',
   jsonb_build_object('mode',p_mode,'provider',p_provider_key,'network',p_network_key));
 RETURN jsonb_build_object('component',saved.component,'mode',saved.mode,'providerKey',saved.provider_key,
   'networkKey',saved.network_key,'contractReference',saved.contract_reference,'rowVersion',saved.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_get_integrity_runtime()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase5_integrity_runtime;
BEGIN
 IF NOT public.phase2_current_has_capability('integrity.provider.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity';
 IF cfg.component IS NULL THEN RAISE EXCEPTION 'integrity runtime configuration is missing' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('component',cfg.component,'mode',cfg.mode,'providerKey',cfg.provider_key,
   'networkKey',cfg.network_key,'contractReference',cfg.contract_reference,'rowVersion',cfg.row_version,
   'syntheticUserCount',cardinality(cfg.synthetic_user_ids),'syntheticSourceCount',cardinality(cfg.synthetic_source_ids));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_request_finance_integrity_proof(
 p_source_type text,p_source_id uuid,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE mode_value text; root_value uuid; proof public.finance_integrity_proofs; budget public.proposal_budget_revisions; liq public.liquidation_submissions;
 source_number integer; source_row bigint; schema_value text; hash_value text; current_snapshot jsonb; actor_email text;
BEGIN
 IF NOT public.phase2_current_has_capability('integrity.finance.request') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_source_type NOT IN('finance_cleared_budget','verified_liquidation') THEN RAISE EXCEPTION 'unknown integrity source' USING ERRCODE='22023'; END IF;
 SELECT s.data_mode,s.root_id INTO mode_value,root_value FROM public.phase5_assert_integrity_source(p_source_type,p_source_id) s;
 IF p_source_type='finance_cleared_budget' THEN
   SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=p_source_id FOR SHARE;
   IF budget.id IS NULL OR budget.status<>'cleared' OR budget.frozen_snapshot IS NULL OR budget.canonical_hash IS NULL THEN RAISE EXCEPTION 'budget is not Finance-cleared and frozen' USING ERRCODE='23514'; END IF;
   IF budget.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale budget version' USING ERRCODE='40001'; END IF;
   current_snapshot:=budget.frozen_snapshot;
   IF encode(extensions.digest(convert_to(current_snapshot::text,'UTF8'),'sha256'),'hex')<>budget.canonical_hash THEN RAISE EXCEPTION 'budget snapshot hash is invalid' USING ERRCODE='23514'; END IF;
   source_number:=budget.revision_number; source_row:=budget.row_version; schema_value:='agape.finance.cleared-budget.v1'; hash_value:=budget.canonical_hash;
 ELSE
   SELECT * INTO liq FROM public.liquidation_submissions WHERE id=p_source_id FOR SHARE;
   IF liq.id IS NULL OR liq.status<>'verified' OR liq.integrity_snapshot IS NULL OR liq.integrity_hash IS NULL THEN RAISE EXCEPTION 'liquidation is not Finance-verified and frozen' USING ERRCODE='23514'; END IF;
   IF liq.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale liquidation version' USING ERRCODE='40001'; END IF;
   current_snapshot:=public.phase5_liquidation_snapshot(liq.id);
   IF current_snapshot<>liq.integrity_snapshot OR encode(extensions.digest(convert_to(current_snapshot::text,'UTF8'),'sha256'),'hex')<>liq.integrity_hash THEN RAISE EXCEPTION 'liquidation snapshot hash is invalid' USING ERRCODE='23514'; END IF;
   source_number:=liq.revision_number; source_row:=liq.row_version; schema_value:='agape.finance.verified-liquidation.v1'; hash_value:=liq.integrity_hash;
 END IF;
 INSERT INTO public.finance_integrity_proofs(source_type,source_id,source_root_id,source_version,source_row_version,
   canonical_schema,canonical_hash,data_mode,requested_by)
 VALUES(p_source_type,p_source_id,root_value,source_number,source_row,schema_value,hash_value,mode_value,auth.uid())
 ON CONFLICT(source_type,source_id,source_version,canonical_hash) DO NOTHING;
 SELECT * INTO proof FROM public.finance_integrity_proofs WHERE source_type=p_source_type AND source_id=p_source_id
   AND source_version=source_number AND canonical_hash=hash_value;
 IF proof.requested_by=auth.uid() AND NOT EXISTS(SELECT 1 FROM public.finance_integrity_events e WHERE e.proof_id=proof.id) THEN
   INSERT INTO public.finance_integrity_events(proof_id,event_type,actor_id,metadata)
   VALUES(proof.id,'requested',auth.uid(),jsonb_build_object('sourceType',p_source_type,'sourceVersion',source_number));
 END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),actor_email,'integrity.proof.request','finance_integrity_proof',proof.id::text,
   jsonb_build_object('sourceType',p_source_type,'sourceVersion',source_number));
 RETURN jsonb_build_object('id',proof.id,'verificationCode',proof.verification_code,'sourceType',proof.source_type,
   'sourceVersion',proof.source_version,'canonicalHash',proof.canonical_hash,'sourceValidity',proof.source_validity,
   'anchorStatus',proof.anchor_status,'rowVersion',proof.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_list_finance_integrity_proofs()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE mode_value text; cfg public.phase5_integrity_runtime; result jsonb;
BEGIN
 mode_value:=public.phase5_assert_integrity_actor();
 IF NOT public.phase2_current_has_capability('integrity.finance.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity';
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'verificationCode',p.verification_code,'sourceType',p.source_type,'sourceId',p.source_id,
   'sourceRootId',p.source_root_id,'sourceLabel',CASE p.source_type
     WHEN 'finance_cleared_budget' THEN (SELECT q.title FROM public.proposal_budget_revisions r JOIN public.project_proposals q ON q.id=r.proposal_id WHERE r.id=p.source_id)
     ELSE (SELECT g.title FROM public.liquidation_submissions l JOIN public.programs g ON g.id=l.program_id WHERE l.id=p.source_id) END,
   'sourceVersion',p.source_version,'sourceRowVersion',p.source_row_version,'canonicalSchema',p.canonical_schema,
   'canonicalHash',p.canonical_hash,'sourceValidity',p.source_validity,'anchorStatus',p.anchor_status,
   'attemptCount',p.attempt_count,'nextAttemptAt',p.next_attempt_at,'networkKey',p.network_key,
   'transactionHash',p.transaction_hash,'blockReference',p.block_reference,'contractReference',p.contract_reference,
   'anchoredAt',p.anchored_at,'rowVersion',p.row_version,'createdAt',p.created_at
 ) ORDER BY p.created_at DESC),'[]'::jsonb) INTO result
 FROM public.finance_integrity_proofs p WHERE p.data_mode=mode_value
   AND (mode_value='live' OR p.source_root_id=ANY(cfg.synthetic_source_ids));
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'integrity.proofs.read','finance_integrity_proof','list',jsonb_build_object('count',jsonb_array_length(result)));
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_verify_finance_integrity_proof(p_verification_code uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE proof public.finance_integrity_proofs;
BEGIN
 SELECT * INTO proof FROM public.finance_integrity_proofs WHERE verification_code=p_verification_code;
 IF proof.id IS NULL THEN RAISE EXCEPTION 'integrity proof not found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('schema','agape.finance.integrity-verification.v1','verificationCode',proof.verification_code,
   'sourceType',proof.source_type,'sourceVersion',proof.source_version,'canonicalSchema',proof.canonical_schema,
   'canonicalHash',proof.canonical_hash,'sourceValidity',proof.source_validity,'anchorStatus',proof.anchor_status,
   'networkKey',CASE WHEN proof.anchor_status='anchored' THEN proof.network_key ELSE NULL END,
   'transactionHash',CASE WHEN proof.anchor_status='anchored' THEN proof.transaction_hash ELSE NULL END,
   'blockReference',CASE WHEN proof.anchor_status='anchored' THEN proof.block_reference ELSE NULL END,
   'contractReference',CASE WHEN proof.anchor_status='anchored' THEN proof.contract_reference ELSE NULL END,
   'anchoredAt',CASE WHEN proof.anchor_status='anchored' THEN proof.anchored_at ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_claim_finance_integrity_proofs(p_limit integer DEFAULT 20,p_lease_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase5_integrity_runtime; result jsonb;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'invalid claim bounds' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity' FOR SHARE;
 IF cfg.component IS NULL OR cfg.mode='off' THEN RAISE EXCEPTION 'Finance integrity is off' USING ERRCODE='42501'; END IF;
 WITH recovered AS (
   UPDATE public.finance_integrity_proofs SET anchor_status='failed',claim_token=NULL,lease_until=NULL,
     next_attempt_at=now(),last_error_code='lease_expired',row_version=row_version+1,updated_at=now()
   WHERE anchor_status='submitting' AND lease_until<now() AND data_mode=cfg.mode RETURNING id
 ) INSERT INTO public.finance_integrity_events(proof_id,event_type,metadata)
   SELECT id,'lease_recovered','{"reason":"lease_expired"}'::jsonb FROM recovered;
 WITH candidates AS (
   SELECT p.id FROM public.finance_integrity_proofs p
   WHERE p.data_mode=cfg.mode AND p.source_validity='active' AND p.anchor_status IN('queued','failed')
     AND coalesce(p.next_attempt_at,'-infinity'::timestamptz)<=now()
     AND (cfg.mode='live' OR p.source_root_id=ANY(cfg.synthetic_source_ids))
   ORDER BY p.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ), claimed AS (
   UPDATE public.finance_integrity_proofs p SET anchor_status='submitting',attempt_count=attempt_count+1,
     claim_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>p_lease_seconds),next_attempt_at=NULL,
     last_error_code=NULL,row_version=row_version+1,updated_at=now()
   FROM candidates c WHERE p.id=c.id RETURNING p.*
 ), events AS (
   INSERT INTO public.finance_integrity_events(proof_id,event_type,metadata)
   SELECT id,'claimed',jsonb_build_object('attempt',attempt_count) FROM claimed RETURNING proof_id
 ) SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'claimToken',c.claim_token,'sourceType',c.source_type,'sourceVersion',c.source_version,
   'canonicalSchema',c.canonical_schema,'canonicalHash',c.canonical_hash,'dataMode',c.data_mode,
   'providerKey',cfg.provider_key,'networkKey',coalesce(cfg.network_key,CASE WHEN cfg.mode='synthetic' THEN 'synthetic-local' END),
   'contractReference',cfg.contract_reference,'attemptNumber',c.attempt_count
 ) ORDER BY c.created_at),'[]'::jsonb) INTO result FROM claimed c;
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_finalize_finance_integrity_proof(
 p_proof_id uuid,p_claim_token uuid,p_outcome text,p_network_key text DEFAULT NULL,
 p_transaction_hash text DEFAULT NULL,p_block_reference text DEFAULT NULL,p_contract_reference text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE proof public.finance_integrity_proofs; next_time timestamptz;
BEGIN
 IF p_outcome NOT IN('anchored','retry','cancelled') THEN RAISE EXCEPTION 'invalid proof outcome' USING ERRCODE='22023'; END IF;
 SELECT * INTO proof FROM public.finance_integrity_proofs WHERE id=p_proof_id FOR UPDATE;
 IF proof.id IS NULL THEN RAISE EXCEPTION 'integrity proof not found' USING ERRCODE='P0002'; END IF;
 IF proof.anchor_status<>'submitting' OR proof.claim_token IS DISTINCT FROM p_claim_token OR proof.lease_until<now() THEN RAISE EXCEPTION 'stale integrity claim' USING ERRCODE='40001'; END IF;
 IF p_outcome='anchored' AND (p_network_key IS NULL OR p_network_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
   OR p_transaction_hash IS NULL OR p_transaction_hash !~ '^(0x)?[A-Fa-f0-9]{32,128}$') THEN RAISE EXCEPTION 'invalid anchor receipt' USING ERRCODE='22023'; END IF;
 IF p_outcome='retry' AND (p_error_code IS NULL OR p_error_code !~ '^[a-z][a-z0-9_]{0,79}$') THEN RAISE EXCEPTION 'controlled error code is required' USING ERRCODE='22023'; END IF;
 next_time:=CASE WHEN p_outcome='retry' THEN now()+make_interval(secs=>least(3600,30*(2^least(proof.attempt_count,7))::integer)) END;
 UPDATE public.finance_integrity_proofs SET anchor_status=CASE p_outcome WHEN 'anchored' THEN 'anchored' WHEN 'retry' THEN 'failed' ELSE 'cancelled' END,
   network_key=CASE WHEN p_outcome='anchored' THEN p_network_key ELSE network_key END,
   transaction_hash=CASE WHEN p_outcome='anchored' THEN p_transaction_hash ELSE transaction_hash END,
   block_reference=CASE WHEN p_outcome='anchored' THEN p_block_reference ELSE block_reference END,
   contract_reference=CASE WHEN p_outcome='anchored' THEN p_contract_reference ELSE contract_reference END,
   anchored_at=CASE WHEN p_outcome='anchored' THEN now() ELSE anchored_at END,
   last_error_code=CASE WHEN p_outcome='retry' THEN p_error_code ELSE NULL END,next_attempt_at=next_time,
   claim_token=NULL,lease_until=NULL,row_version=row_version+1,updated_at=now() WHERE id=p_proof_id;
 INSERT INTO public.finance_integrity_events(proof_id,event_type,metadata) VALUES(p_proof_id,
   CASE p_outcome WHEN 'anchored' THEN 'anchored' WHEN 'retry' THEN 'retry_scheduled' ELSE 'cancelled' END,
   jsonb_strip_nulls(jsonb_build_object('network',p_network_key,'blockReference',p_block_reference,'errorCode',p_error_code)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_mark_integrity_source_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE kind text; validity text; proof_id uuid;
BEGIN
 IF TG_TABLE_NAME='proposal_budget_revisions' AND OLD.status='cleared' AND NEW.status='superseded' THEN kind:='finance_cleared_budget'; validity:='superseded';
 ELSIF TG_TABLE_NAME='liquidation_submissions' AND OLD.status='verified' AND NEW.status='voided' THEN kind:='verified_liquidation'; validity:='voided';
 ELSE RETURN NEW; END IF;
 FOR proof_id IN UPDATE public.finance_integrity_proofs SET source_validity=validity,
   anchor_status=CASE WHEN anchor_status IN('queued','submitting','failed') THEN 'cancelled' ELSE anchor_status END,
   claim_token=NULL,lease_until=NULL,next_attempt_at=NULL,row_version=row_version+1,updated_at=now()
   WHERE source_type=kind AND source_id=NEW.id AND source_validity='active' RETURNING id
 LOOP
   INSERT INTO public.finance_integrity_events(proof_id,event_type,actor_id,metadata)
   VALUES(proof_id,CASE validity WHEN 'superseded' THEN 'source_superseded' ELSE 'source_voided' END,auth.uid(),'{}');
 END LOOP;
 RETURN NEW;
END;
$function$;

CREATE TRIGGER proposal_budget_integrity_source_change
AFTER UPDATE OF status ON public.proposal_budget_revisions FOR EACH ROW EXECUTE FUNCTION public.phase5_mark_integrity_source_change();
CREATE TRIGGER liquidation_integrity_source_change
AFTER UPDATE OF status ON public.liquidation_submissions FOR EACH ROW EXECUTE FUNCTION public.phase5_mark_integrity_source_change();

CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_table='phase5_integrity_runtime' OR p_table='finance_integrity_events' THEN 'audit_logs'
  WHEN p_table='finance_integrity_proofs' THEN 'financial_integrity'
  WHEN p_table='phase4_component_runtime' OR p_table='volunteer_invitation_events' THEN 'audit_logs'
  WHEN p_table LIKE 'volunteer_%' THEN 'volunteers'
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
  WHEN p_table LIKE 'survey%' THEN 'surveys' WHEN p_table='community_needs' THEN 'community_needs'
  WHEN p_table='field_observations' THEN 'observations'
  WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets') THEN 'skills_assets'
  WHEN p_table='attendance' THEN 'attendance' WHEN p_table='activity_logs' THEN 'activity_logs'
  WHEN p_table LIKE 'donation%' THEN 'donations'
  WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' THEN 'impact'
  WHEN p_table LIKE 'analytics%' THEN 'analytics'
  WHEN p_table LIKE 'ai_recommendation%' THEN 'ai_assistance'
  WHEN p_table LIKE 'ai_report%' THEN 'reports'
  WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments') THEN 'communication'
  WHEN p_table='domain_correction_events' OR p_table LIKE 'phase2_storage_read_event%' THEN 'audit_logs'
  WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles','households','residents','household_memberships') THEN 'profiling'
  ELSE NULL
 END;
$function$;

REVOKE ALL ON FUNCTION public.phase5_assert_integrity_actor() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase5_integrity_source_mode(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase5_assert_integrity_source(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase5_liquidation_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase5_configure_integrity_runtime(text,uuid[],uuid[],text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase5_get_integrity_runtime() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase5_request_finance_integrity_proof(text,uuid,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase5_list_finance_integrity_proofs() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase5_verify_finance_integrity_proof(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase5_claim_finance_integrity_proofs(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase5_finalize_finance_integrity_proof(uuid,uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase5_mark_integrity_source_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_apply_liquidation_action_v2(uuid,uuid,text,integer,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.phase5_configure_integrity_runtime(text,uuid[],uuid[],text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase5_get_integrity_runtime() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase5_request_finance_integrity_proof(text,uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase5_list_finance_integrity_proofs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase5_verify_finance_integrity_proof(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase5_claim_finance_integrity_proofs(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase5_finalize_finance_integrity_proof(uuid,uuid,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase2_apply_liquidation_action_v2(uuid,uuid,text,integer,text) TO authenticated;

COMMIT;
