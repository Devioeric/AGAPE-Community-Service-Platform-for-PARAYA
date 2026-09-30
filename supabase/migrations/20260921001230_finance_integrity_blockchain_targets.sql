-- Forward-only. No target or runtime is enabled by this migration.
BEGIN;
SET LOCAL search_path=pg_catalog,public,extensions;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE public.finance_integrity_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_key text NOT NULL CHECK(provider_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
 execution text NOT NULL CHECK(execution IN('simulated','local_evm','sepolia')),
 network_key text NOT NULL,chain_id bigint NOT NULL,
 contract_address text CHECK(contract_address ~ '^0x[0-9a-f]{40}$'),
 bytecode_hash text CHECK(bytecode_hash ~ '^[0-9a-f]{64}$'),
 deployment_namespace text NOT NULL CHECK(deployment_namespace ~ '^[0-9a-f]{64}$'),
 confirmation_policy text NOT NULL,
 fingerprint text NOT NULL UNIQUE CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 created_by uuid NOT NULL REFERENCES public.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((execution='simulated' AND network_key='synthetic-local' AND chain_id=0 AND contract_address IS NULL AND bytecode_hash IS NULL AND confirmation_policy='simulated')
 OR (execution='local_evm' AND network_key='eip155:31337' AND chain_id=31337 AND contract_address IS NOT NULL AND bytecode_hash IS NOT NULL AND confirmation_policy='local_one_block')
 OR (execution='sepolia' AND network_key='eip155:11155111' AND chain_id=11155111 AND contract_address IS NOT NULL AND bytecode_hash IS NOT NULL AND confirmation_policy='sepolia_finalized'))
);
CREATE TRIGGER finance_integrity_targets_immutable BEFORE UPDATE OR DELETE ON public.finance_integrity_targets FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
ALTER TABLE public.finance_integrity_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_integrity_targets_rpc_only ON public.finance_integrity_targets AS RESTRICTIVE FOR ALL TO public USING(false) WITH CHECK(false);
REVOKE ALL ON public.finance_integrity_targets FROM PUBLIC,anon,authenticated;
ALTER TABLE public.phase5_integrity_runtime ADD COLUMN target_id uuid REFERENCES public.finance_integrity_targets(id);
ALTER TABLE public.finance_integrity_proofs
 ADD COLUMN target_id uuid REFERENCES public.finance_integrity_targets(id),
 ADD COLUMN anchor_reference text CHECK(anchor_reference ~ '^[0-9a-f]{64}$'),
 ADD COLUMN operation_key uuid,ADD COLUMN dispatch_reserved_at timestamptz,
 ADD COLUMN receipt_block_number numeric(78,0) CHECK(receipt_block_number>=0),
 ADD COLUMN receipt_block_hash text CHECK(receipt_block_hash ~ '^0x[0-9a-f]{64}$'),
 ADD COLUMN last_chain_check_at timestamptz,
 ADD COLUMN last_chain_check_result text CHECK(last_chain_check_result IN('simulated','pending','verified','mismatch','unavailable','legacy_unverified')),
 ADD COLUMN poll_count integer NOT NULL DEFAULT 0 CHECK(poll_count>=0),
 ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0 CHECK(consecutive_failures>=0);
DO $constraints$
DECLARE item record;
BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='public.finance_integrity_proofs'::regclass
 AND ((contype='u' AND pg_get_constraintdef(oid) LIKE '%source_type, source_id, source_version, canonical_hash%') OR (contype='c' AND pg_get_constraintdef(oid) LIKE '%anchor_status%')) LOOP
 EXECUTE format('ALTER TABLE public.finance_integrity_proofs DROP CONSTRAINT %I',item.conname); END LOOP;
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='public.finance_integrity_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%event_type%' LOOP
 EXECUTE format('ALTER TABLE public.finance_integrity_events DROP CONSTRAINT %I',item.conname); END LOOP;
END $constraints$;
ALTER TABLE public.finance_integrity_proofs
 ADD CONSTRAINT finance_integrity_status_v2 CHECK(anchor_status IN('queued','submitting','pending','anchored','failed','paused','cancelled')),
 ADD CONSTRAINT finance_integrity_lease_pair_v2 CHECK((claim_token IS NULL)=(lease_until IS NULL)),
 ADD CONSTRAINT finance_integrity_lease_state_v2 CHECK(claim_token IS NULL OR anchor_status IN('submitting','pending')),
 ADD CONSTRAINT finance_integrity_dispatched_state_v2 CHECK(anchor_status NOT IN('pending','anchored') OR dispatch_reserved_at IS NOT NULL),
 ADD CONSTRAINT finance_integrity_anchored_receipt_v2 CHECK(anchor_status<>'anchored' OR (transaction_hash IS NOT NULL AND network_key IS NOT NULL AND anchored_at IS NOT NULL)),
 ADD CONSTRAINT finance_integrity_bound_identity_v2 CHECK(target_id IS NULL OR (anchor_reference IS NOT NULL AND operation_key IS NOT NULL AND operation_key=id)),
 ADD CONSTRAINT finance_integrity_target_uniqueness UNIQUE(source_type,source_id,source_version,canonical_hash,target_id);
ALTER TABLE public.finance_integrity_events ADD CONSTRAINT finance_integrity_event_type_v2 CHECK(event_type IN(
 'requested','claimed','lease_recovered','anchored','retry_scheduled','cancelled','source_superseded','source_voided','pending','paused','resumed','dispatch_reserved','chain_checked'));
CREATE INDEX finance_integrity_pending_due ON public.finance_integrity_proofs(next_attempt_at) WHERE anchor_status='pending';

CREATE FUNCTION public.phase5_reject_proof_identity_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$
BEGIN
 IF (NEW.verification_code,NEW.source_type,NEW.source_id,NEW.source_root_id,NEW.source_version,NEW.source_row_version,NEW.canonical_schema,NEW.canonical_hash,NEW.data_mode,NEW.requested_by,NEW.created_at,NEW.target_id,NEW.anchor_reference,NEW.operation_key)
 IS DISTINCT FROM (OLD.verification_code,OLD.source_type,OLD.source_id,OLD.source_root_id,OLD.source_version,OLD.source_row_version,OLD.canonical_schema,OLD.canonical_hash,OLD.data_mode,OLD.requested_by,OLD.created_at,OLD.target_id,OLD.anchor_reference,OLD.operation_key)
 THEN RAISE EXCEPTION 'finance integrity proof identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER finance_integrity_proof_identity_immutable BEFORE UPDATE ON public.finance_integrity_proofs FOR EACH ROW EXECUTE FUNCTION public.phase5_reject_proof_identity_change();
REVOKE ALL ON FUNCTION public.phase5_reject_proof_identity_change() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.phase5_target_dto(p_target_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 SELECT jsonb_build_object('id',id,'providerKey',provider_key,'execution',execution,'networkKey',network_key,'chainId',chain_id,'contractAddress',contract_address,'bytecodeHash',bytecode_hash,'namespace',deployment_namespace,'confirmationPolicy',confirmation_policy,'fingerprint',fingerprint) FROM public.finance_integrity_targets WHERE id=p_target_id;
$f$;
REVOKE ALL ON FUNCTION public.phase5_target_dto(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.phase5_register_integrity_target(p_provider text,p_execution text,p_network text,p_chain_id bigint,p_contract text,p_bytecode_hash text,p_namespace text,p_confirmation_policy text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $f$
DECLARE target_uuid uuid; fingerprint_value text;
BEGIN
 IF NOT public.phase2_current_has_capability('integrity.provider.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 fingerprint_value:=encode(extensions.digest(convert_to(concat_ws(E'\n','agape.finance.target.v2',p_execution,p_provider,p_network,p_chain_id::text,coalesce(lower(p_contract),''),coalesce(p_bytecode_hash,''),p_namespace,p_confirmation_policy),'UTF8'),'sha256'),'hex');
 INSERT INTO public.finance_integrity_targets(provider_key,execution,network_key,chain_id,contract_address,bytecode_hash,deployment_namespace,confirmation_policy,fingerprint,created_by)
 VALUES(p_provider,p_execution,p_network,p_chain_id,lower(p_contract),p_bytecode_hash,p_namespace,p_confirmation_policy,fingerprint_value,auth.uid()) ON CONFLICT(fingerprint) DO NOTHING RETURNING id INTO target_uuid;
 IF target_uuid IS NULL THEN SELECT id INTO target_uuid FROM public.finance_integrity_targets WHERE fingerprint=fingerprint_value; END IF;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),'integrity.target.register','finance_integrity_target',target_uuid::text,jsonb_build_object('execution',p_execution,'fingerprint',fingerprint_value));
 RETURN public.phase5_target_dto(target_uuid);
END $f$;
REVOKE ALL ON FUNCTION public.phase5_register_integrity_target(text,text,text,bigint,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase5_register_integrity_target(text,text,text,bigint,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.phase5_get_integrity_runtime() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE cfg public.phase5_integrity_runtime;
BEGIN
 IF NOT public.phase2_current_has_capability('integrity.provider.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity';
 RETURN jsonb_build_object('component',cfg.component,'mode',cfg.mode,'providerKey',cfg.provider_key,'networkKey',cfg.network_key,'contractReference',cfg.contract_reference,'rowVersion',cfg.row_version,'targetId',cfg.target_id,'target',public.phase5_target_dto(cfg.target_id),'syntheticUserCount',cardinality(cfg.synthetic_user_ids),'syntheticSourceCount',cardinality(cfg.synthetic_source_ids),'syntheticUserIds',cfg.synthetic_user_ids,'syntheticSourceIds',cfg.synthetic_source_ids);
END $f$;
REVOKE ALL ON FUNCTION public.phase5_configure_integrity_runtime(text,uuid[],uuid[],text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.phase5_configure_integrity_runtime_v2(p_mode text,p_expected_version bigint,p_target_id uuid,p_synthetic_user_ids uuid[] DEFAULT NULL,p_synthetic_source_ids uuid[] DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE cfg public.phase5_integrity_runtime; t public.finance_integrity_targets; users_value uuid[]; sources_value uuid[];
BEGIN
 IF NOT public.phase2_current_has_capability('integrity.provider.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity' FOR UPDATE;
 IF cfg.row_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'stale runtime version' USING ERRCODE='40001'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN('off','synthetic') THEN RAISE EXCEPTION 'live anchoring is not enabled' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM public.finance_integrity_targets WHERE id=p_target_id;
 IF p_mode<>'off' AND t.id IS NULL THEN RAISE EXCEPTION 'immutable target required' USING ERRCODE='23514'; END IF;
 users_value:=coalesce(p_synthetic_user_ids,cfg.synthetic_user_ids); sources_value:=coalesce(p_synthetic_source_ids,cfg.synthetic_source_ids);
 IF p_mode='synthetic' THEN
 IF cardinality(users_value)=0 OR cardinality(sources_value)=0 THEN RAISE EXCEPTION 'synthetic allowlists required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(users_value) AS allowed(user_id) WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=allowed.user_id AND u.is_synthetic_test IS TRUE AND u.status='active' AND u.is_active IS TRUE)) THEN RAISE EXCEPTION 'invalid synthetic actors' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(sources_value) AS allowed(source_id) WHERE NOT EXISTS(SELECT 1 FROM public.proposal_v2_profiles p WHERE p.proposal_id=allowed.source_id AND p.data_mode='synthetic') AND NOT EXISTS(SELECT 1 FROM public.programs p WHERE p.id=allowed.source_id AND p.phase2_data_mode='synthetic')) THEN RAISE EXCEPTION 'invalid synthetic sources' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE public.phase5_integrity_runtime SET mode=p_mode,target_id=p_target_id,provider_key=coalesce(t.provider_key,'unconfigured'),network_key=t.network_key,contract_reference=t.contract_address,synthetic_user_ids=users_value,synthetic_source_ids=sources_value,row_version=row_version+1,updated_by=auth.uid(),updated_at=now() WHERE component='finance_integrity';
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),'integrity.runtime.configure','phase5_integrity_runtime','finance_integrity',jsonb_build_object('mode',p_mode,'targetId',p_target_id));
 RETURN public.phase5_get_integrity_runtime();
END $f$;
REVOKE ALL ON FUNCTION public.phase5_configure_integrity_runtime_v2(text,bigint,uuid,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase5_configure_integrity_runtime_v2(text,bigint,uuid,uuid[],uuid[]) TO authenticated;

CREATE FUNCTION public.phase5_proof_dto(p_proof_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $dto$
 SELECT jsonb_build_object(
   'id',p.id,'verificationCode',p.verification_code,'sourceType',p.source_type,'sourceId',p.source_id,
   'sourceRootId',p.source_root_id,'sourceLabel',CASE p.source_type
     WHEN 'finance_cleared_budget' THEN (SELECT q.title FROM public.proposal_budget_revisions r JOIN public.project_proposals q ON q.id=r.proposal_id WHERE r.id=p.source_id)
     ELSE (SELECT g.title FROM public.liquidation_submissions l JOIN public.programs g ON g.id=l.program_id WHERE l.id=p.source_id) END,
   'sourceVersion',p.source_version,'sourceRowVersion',p.source_row_version,'canonicalSchema',p.canonical_schema,
   'canonicalHash',p.canonical_hash,'sourceValidity',p.source_validity,'anchorStatus',p.anchor_status,
   'attemptCount',p.attempt_count,'nextAttemptAt',p.next_attempt_at,'networkKey',p.network_key,
   'transactionHash',p.transaction_hash,'blockReference',p.block_reference,'contractReference',p.contract_reference,
   'anchoredAt',p.anchored_at,'rowVersion',p.row_version,'createdAt',p.created_at,'target',public.phase5_target_dto(p.target_id),'anchorReference',p.anchor_reference,'lastErrorCode',p.last_error_code,'receiptBlockNumber',p.receipt_block_number::text,'receiptBlockHash',p.receipt_block_hash,'chainVerification',CASE WHEN p.target_id IS NULL THEN 'legacy_unverified' ELSE coalesce(p.last_chain_check_result,'pending') END
)
 FROM public.finance_integrity_proofs p WHERE p.id=p_proof_id;
$dto$;
REVOKE ALL ON FUNCTION public.phase5_proof_dto(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.phase5_request_finance_integrity_proof(
 p_source_type text,p_source_id uuid,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE mode_value text; root_value uuid; proof public.finance_integrity_proofs; budget public.proposal_budget_revisions; liq public.liquidation_submissions;
 cfg public.phase5_integrity_runtime; new_id uuid:=gen_random_uuid(); namespace_value text; source_number integer; source_row bigint; schema_value text; hash_value text; current_snapshot jsonb; actor_email text;
BEGIN
 IF NOT public.phase2_current_has_capability('integrity.finance.request') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_source_type NOT IN('finance_cleared_budget','verified_liquidation') THEN RAISE EXCEPTION 'unknown integrity source' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity' FOR SHARE;
 IF cfg.mode<>'synthetic' OR cfg.target_id IS NULL THEN RAISE EXCEPTION 'synthetic immutable target required' USING ERRCODE='23514'; END IF;
 SELECT deployment_namespace INTO namespace_value FROM public.finance_integrity_targets WHERE id=cfg.target_id;
 SELECT s.data_mode,s.root_id INTO mode_value,root_value FROM public.phase5_assert_integrity_source(p_source_type,p_source_id) s;
 IF p_source_type='finance_cleared_budget' THEN
   SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=p_source_id FOR SHARE;
   IF budget.id IS NULL OR budget.status<>'cleared' OR budget.frozen_snapshot IS NULL OR budget.canonical_hash IS NULL THEN RAISE EXCEPTION 'budget is not Finance-cleared and frozen' USING ERRCODE='23514'; END IF;
   IF p_expected_version IS NULL OR p_expected_version<1 OR budget.row_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'stale budget version' USING ERRCODE='40001'; END IF;
   current_snapshot:=budget.frozen_snapshot;
   IF encode(extensions.digest(convert_to(current_snapshot::text,'UTF8'),'sha256'),'hex')<>budget.canonical_hash THEN RAISE EXCEPTION 'budget snapshot hash is invalid' USING ERRCODE='23514'; END IF;
   source_number:=budget.revision_number; source_row:=budget.row_version; schema_value:='agape.finance.cleared-budget.v1'; hash_value:=budget.canonical_hash;
 ELSE
   SELECT * INTO liq FROM public.liquidation_submissions WHERE id=p_source_id FOR SHARE;
   IF liq.id IS NULL OR liq.status<>'verified' OR liq.integrity_snapshot IS NULL OR liq.integrity_hash IS NULL THEN RAISE EXCEPTION 'liquidation is not Finance-verified and frozen' USING ERRCODE='23514'; END IF;
   IF p_expected_version IS NULL OR p_expected_version<1 OR liq.row_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'stale liquidation version' USING ERRCODE='40001'; END IF;
   current_snapshot:=public.phase5_liquidation_snapshot(liq.id);
   IF current_snapshot<>liq.integrity_snapshot OR encode(extensions.digest(convert_to(current_snapshot::text,'UTF8'),'sha256'),'hex')<>liq.integrity_hash THEN RAISE EXCEPTION 'liquidation snapshot hash is invalid' USING ERRCODE='23514'; END IF;
   source_number:=liq.revision_number; source_row:=liq.row_version; schema_value:='agape.finance.verified-liquidation.v1'; hash_value:=liq.integrity_hash;
 END IF;
 INSERT INTO public.finance_integrity_proofs(source_type,source_id,source_root_id,source_version,source_row_version,
   canonical_schema,canonical_hash,data_mode,requested_by,id,target_id,anchor_reference,operation_key)
 VALUES(p_source_type,p_source_id,root_value,source_number,source_row,schema_value,hash_value,mode_value,auth.uid(),new_id,cfg.target_id,encode(extensions.digest(convert_to('agape.finance.anchor-reference.v2'||E'\n'||namespace_value||E'\n'||new_id::text,'UTF8'),'sha256'),'hex'),new_id)
 ON CONFLICT(source_type,source_id,source_version,canonical_hash,target_id) DO NOTHING;
 SELECT * INTO proof FROM public.finance_integrity_proofs WHERE source_type=p_source_type AND source_id=p_source_id
   AND source_version=source_number AND canonical_hash=hash_value AND target_id=cfg.target_id;
 IF proof.requested_by=auth.uid() AND NOT EXISTS(SELECT 1 FROM public.finance_integrity_events e WHERE e.proof_id=proof.id) THEN
   INSERT INTO public.finance_integrity_events(proof_id,event_type,actor_id,metadata)
   VALUES(proof.id,'requested',auth.uid(),jsonb_build_object('sourceType',p_source_type,'sourceVersion',source_number));
 END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),actor_email,'integrity.proof.request','finance_integrity_proof',proof.id::text,
   jsonb_build_object('sourceType',p_source_type,'sourceVersion',source_number));
 RETURN public.phase5_proof_dto(proof.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase5_list_finance_integrity_proofs()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
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
   'anchoredAt',p.anchored_at,'rowVersion',p.row_version,'createdAt',p.created_at,'target',public.phase5_target_dto(p.target_id),'anchorReference',p.anchor_reference,'lastErrorCode',p.last_error_code,'receiptBlockNumber',p.receipt_block_number::text,'receiptBlockHash',p.receipt_block_hash,'chainVerification',CASE WHEN p.target_id IS NULL THEN 'legacy_unverified' ELSE coalesce(p.last_chain_check_result,'pending') END
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
   'canonicalHash',proof.canonical_hash,'sourceValidity',proof.source_validity,'anchorStatus',proof.anchor_status,'target',public.phase5_target_dto(proof.target_id),'anchorReference',proof.anchor_reference,'lastErrorCode',proof.last_error_code,'receiptBlockNumber',proof.receipt_block_number::text,'receiptBlockHash',proof.receipt_block_hash,'chainVerification',CASE WHEN proof.target_id IS NULL THEN 'legacy_unverified' ELSE coalesce(proof.last_chain_check_result,'pending') END,
   'networkKey',CASE WHEN proof.anchor_status IN('anchored','pending','paused') THEN proof.network_key ELSE NULL END,
   'transactionHash',CASE WHEN proof.anchor_status IN('anchored','pending','paused') THEN proof.transaction_hash ELSE NULL END,
   'blockReference',CASE WHEN proof.anchor_status IN('anchored','pending','paused') THEN proof.block_reference ELSE NULL END,
   'contractReference',CASE WHEN proof.anchor_status IN('anchored','pending','paused') THEN proof.contract_reference ELSE NULL END,
   'anchoredAt',CASE WHEN proof.anchor_status IN('anchored','pending','paused') THEN proof.anchored_at ELSE NULL END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_table='finance_integrity_targets' THEN 'audit_logs'
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

-- Remove the unsafe worker entrypoints, including service-role grants.
REVOKE ALL ON FUNCTION public.phase5_claim_finance_integrity_proofs(integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.phase5_finalize_finance_integrity_proof(uuid,uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.phase5_claim_finance_integrity_proofs_v2(p_limit integer DEFAULT 5,p_lease_seconds integer DEFAULT 120,p_reconciliation_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE cfg public.phase5_integrity_runtime; result jsonb;
BEGIN
 IF p_limit IS NULL OR p_lease_seconds IS NULL OR p_limit NOT BETWEEN 1 AND 5 OR p_lease_seconds NOT BETWEEN 120 AND 900 THEN RAISE EXCEPTION 'invalid claim bounds' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity' FOR SHARE;
 WITH recovered AS (
 UPDATE public.finance_integrity_proofs SET anchor_status=CASE WHEN dispatch_reserved_at IS NULL THEN 'failed' ELSE 'pending' END,claim_token=NULL,lease_until=NULL,next_attempt_at=now(),last_error_code='lease_expired',row_version=row_version+1
 WHERE target_id IS NOT NULL AND claim_token IS NOT NULL AND lease_until<now() RETURNING id
 ) INSERT INTO public.finance_integrity_events(proof_id,event_type,metadata) SELECT id,'lease_recovered','{}' FROM recovered;
 WITH candidates AS (
 SELECT p.id FROM public.finance_integrity_proofs p WHERE p.target_id IS NOT NULL AND p.data_mode='synthetic' AND p.claim_token IS NULL AND coalesce(p.next_attempt_at,'-infinity'::timestamptz)<=now()
 AND ((p.anchor_status='pending' AND (cfg.mode='synthetic' OR p_reconciliation_only))
 OR (NOT p_reconciliation_only AND cfg.mode='synthetic' AND p.source_validity='active' AND p.anchor_status IN('queued','failed') AND p.source_root_id=ANY(cfg.synthetic_source_ids)
 AND p.requested_by=ANY(cfg.synthetic_user_ids) AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=p.requested_by AND u.is_active AND u.status='active' AND u.is_synthetic_test)))
 ORDER BY p.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ), claimed AS (
 UPDATE public.finance_integrity_proofs p SET anchor_status=CASE WHEN p.dispatch_reserved_at IS NULL THEN 'submitting' ELSE 'pending' END,
 attempt_count=p.attempt_count+1,claim_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>p_lease_seconds),next_attempt_at=NULL,row_version=p.row_version+1,updated_at=now()
 FROM candidates c WHERE c.id=p.id RETURNING p.*
 ), events AS (
 INSERT INTO public.finance_integrity_events(proof_id,event_type,metadata) SELECT id,'claimed',jsonb_build_object('attempt',attempt_count) FROM claimed RETURNING proof_id
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'claimToken',p.claim_token,'sourceType',p.source_type,'sourceVersion',p.source_version,'canonicalSchema',p.canonical_schema,'canonicalHash',p.canonical_hash,'dataMode',p.data_mode,
 'providerKey',t.provider_key,'networkKey',t.network_key,'contractReference',t.contract_address,'attemptNumber',p.attempt_count,'target',public.phase5_target_dto(p.target_id),'anchorReference',p.anchor_reference,'operationKey',p.operation_key,'dispatchReservedAt',p.dispatch_reserved_at,'sourceValidity',p.source_validity,'transactionHash',p.transaction_hash,'receiptBlockNumber',p.receipt_block_number::text,'receiptBlockHash',p.receipt_block_hash,'anchorStatus',p.anchor_status,'rowVersion',p.row_version)),'[]') INTO result FROM claimed p JOIN public.finance_integrity_targets t ON t.id=p.target_id;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION public.phase5_claim_finance_integrity_proofs_v2(integer,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase5_claim_finance_integrity_proofs_v2(integer,integer,boolean) TO service_role;

CREATE FUNCTION public.phase5_reserve_integrity_dispatch(p_proof_id uuid,p_claim_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE cfg public.phase5_integrity_runtime; p public.finance_integrity_proofs;
BEGIN
 SELECT * INTO cfg FROM public.phase5_integrity_runtime WHERE component='finance_integrity' FOR SHARE;
 SELECT * INTO p FROM public.finance_integrity_proofs WHERE id=p_proof_id FOR UPDATE;
 IF p.id IS NULL OR p_claim_token IS NULL OR p.claim_token IS NULL OR p.claim_token IS DISTINCT FROM p_claim_token OR p.lease_until IS NULL OR p.lease_until<=now() OR p.anchor_status<>'submitting' THEN RAISE EXCEPTION 'stale claim' USING ERRCODE='40001'; END IF;
 IF p.dispatch_reserved_at IS NOT NULL THEN RETURN; END IF;
 IF cfg.mode<>'synthetic' OR p.data_mode<>'synthetic' OR p.target_id IS NULL OR p.source_validity<>'active' OR NOT p.source_root_id=ANY(cfg.synthetic_source_ids) OR NOT p.requested_by=ANY(cfg.synthetic_user_ids)
 OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p.requested_by AND u.is_active AND u.status='active' AND u.is_synthetic_test) THEN RAISE EXCEPTION 'dispatch denied' USING ERRCODE='42501'; END IF;
 UPDATE public.finance_integrity_proofs SET dispatch_reserved_at=now(),row_version=row_version+1 WHERE id=p.id;
 INSERT INTO public.finance_integrity_events(proof_id,event_type) VALUES(p.id,'dispatch_reserved');
END $f$;
REVOKE ALL ON FUNCTION public.phase5_reserve_integrity_dispatch(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase5_reserve_integrity_dispatch(uuid,uuid) TO service_role;

CREATE FUNCTION public.phase5_finalize_finance_integrity_proof_v2(p_proof_id uuid,p_claim_token uuid,p_outcome text,p_target_fingerprint text,p_chain_result text,
 p_transaction_hash text DEFAULT NULL,p_block_number text DEFAULT NULL,p_block_hash text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE p public.finance_integrity_proofs; t public.finance_integrity_targets; status_value text; failures integer; next_time timestamptz;
BEGIN
 SELECT * INTO p FROM public.finance_integrity_proofs WHERE id=p_proof_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'proof not found' USING ERRCODE='P0002'; END IF;
 IF p.claim_token IS DISTINCT FROM p_claim_token OR p_claim_token IS NULL OR p.lease_until<=now() OR p.anchor_status NOT IN('submitting','pending') THEN RAISE EXCEPTION 'stale claim' USING ERRCODE='40001'; END IF;
 SELECT * INTO t FROM public.finance_integrity_targets WHERE id=p.target_id;
 IF t.fingerprint IS DISTINCT FROM p_target_fingerprint OR t.id IS NULL THEN RAISE EXCEPTION 'target mismatch' USING ERRCODE='23514'; END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN('anchored','pending','retry','paused','cancelled') OR p_chain_result IS NULL OR p_chain_result NOT IN('simulated','pending','verified','mismatch','unavailable') THEN RAISE EXCEPTION 'invalid outcome' USING ERRCODE='22023'; END IF;
 IF p_outcome IN('pending','anchored') AND p.dispatch_reserved_at IS NULL THEN RAISE EXCEPTION 'dispatch reservation required' USING ERRCODE='23514'; END IF;
 IF p_error_code IS NOT NULL AND p_error_code !~ '^[a-z][a-z0-9_]{0,79}$' THEN RAISE EXCEPTION 'invalid error code' USING ERRCODE='22023'; END IF;
 IF p_outcome='anchored' THEN
 IF p.dispatch_reserved_at IS NULL OR p_transaction_hash IS NULL THEN RAISE EXCEPTION 'missing dispatch receipt' USING ERRCODE='23514'; END IF;
 IF t.execution='simulated' THEN
 IF p_chain_result<>'simulated' OR p_transaction_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid simulation receipt' USING ERRCODE='23514'; END IF;
 ELSE
 IF p_chain_result<>'verified' OR p_transaction_hash !~ '^0x[0-9a-fA-F]{64}$' OR p_block_number IS NULL OR p_block_number !~ '^[0-9]+$' OR p_block_hash IS NULL OR p_block_hash !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'verified receipt required' USING ERRCODE='23514'; END IF;
 END IF;
 END IF;
 failures:=CASE WHEN p_outcome='retry' THEN p.consecutive_failures+1 ELSE 0 END;
 status_value:=CASE WHEN p_outcome='retry' THEN CASE WHEN failures>=10 THEN 'paused' WHEN p.dispatch_reserved_at IS NOT NULL THEN 'pending' ELSE 'failed' END ELSE p_outcome END;
 next_time:=CASE WHEN p_outcome='retry' AND failures<10 THEN now()+make_interval(secs=>least(3600,30*power(2,least(failures-1,7))::integer)) WHEN status_value='pending' THEN now()+interval '15 seconds' END;
 UPDATE public.finance_integrity_proofs SET anchor_status=status_value,
 transaction_hash=coalesce(p_transaction_hash,transaction_hash),network_key=t.network_key,contract_reference=t.contract_address,
 receipt_block_number=coalesce(p_block_number::numeric,receipt_block_number),receipt_block_hash=coalesce(p_block_hash,receipt_block_hash),block_reference=coalesce(p_block_number,block_reference),
 anchored_at=CASE WHEN status_value='anchored' THEN now() ELSE anchored_at END,last_chain_check_at=now(),last_chain_check_result=p_chain_result,
 last_error_code=CASE WHEN failures>=10 THEN 'retry_exhausted' ELSE p_error_code END,consecutive_failures=failures,poll_count=poll_count+1,next_attempt_at=next_time,
 claim_token=NULL,lease_until=NULL,row_version=row_version+1,updated_at=now() WHERE id=p.id;
 INSERT INTO public.finance_integrity_events(proof_id,event_type,metadata) VALUES(p.id,CASE WHEN status_value='failed' THEN 'retry_scheduled' ELSE status_value END,jsonb_strip_nulls(jsonb_build_object('chainResult',p_chain_result,'errorCode',p_error_code)));
END $f$;
REVOKE ALL ON FUNCTION public.phase5_finalize_finance_integrity_proof_v2(uuid,uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase5_finalize_finance_integrity_proof_v2(uuid,uuid,text,text,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.phase5_mark_integrity_source_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$
DECLARE kind text; validity text; proof_id uuid;
BEGIN
 IF TG_TABLE_NAME='proposal_budget_revisions' AND OLD.status='cleared' AND NEW.status='superseded' THEN kind:='finance_cleared_budget'; validity:='superseded';
 ELSIF TG_TABLE_NAME='liquidation_submissions' AND OLD.status='verified' AND NEW.status='voided' THEN kind:='verified_liquidation'; validity:='voided'; ELSE RETURN NEW; END IF;
 FOR proof_id IN UPDATE public.finance_integrity_proofs SET source_validity=validity,
 anchor_status=CASE WHEN dispatch_reserved_at IS NULL AND anchor_status IN('queued','submitting','failed','paused') THEN 'cancelled' ELSE anchor_status END,
 claim_token=CASE WHEN dispatch_reserved_at IS NULL THEN NULL ELSE claim_token END,lease_until=CASE WHEN dispatch_reserved_at IS NULL THEN NULL ELSE lease_until END,
 next_attempt_at=CASE WHEN dispatch_reserved_at IS NULL THEN NULL ELSE now() END,row_version=row_version+1,updated_at=now()
 WHERE source_type=kind AND source_id=NEW.id AND source_validity='active' RETURNING id LOOP
 INSERT INTO public.finance_integrity_events(proof_id,event_type,actor_id) VALUES(proof_id,CASE validity WHEN 'superseded' THEN 'source_superseded' ELSE 'source_voided' END,auth.uid());
 END LOOP;
 RETURN NEW;
END $f$;

CREATE FUNCTION public.phase5_resume_finance_integrity_proof(p_proof_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE p public.finance_integrity_proofs;
BEGIN
 IF NOT public.phase2_current_has_capability('integrity.finance.request') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.finance_integrity_proofs WHERE id=p_proof_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'proof not found' USING ERRCODE='P0002'; END IF;
 PERFORM public.phase5_assert_integrity_source(p.source_type,p.source_id);
 IF p.row_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'stale proof version' USING ERRCODE='40001'; END IF;
 IF p.anchor_status<>'paused' OR p.target_id IS NULL THEN RAISE EXCEPTION 'proof cannot resume' USING ERRCODE='23514'; END IF;
 IF p.last_error_code IS NULL OR p.last_error_code NOT IN('retry_exhausted','pending_needs_review','verification_unavailable') THEN RAISE EXCEPTION 'proof requires relay or configuration intervention' USING ERRCODE='23514'; END IF;
 IF p.dispatch_reserved_at IS NULL AND p.source_validity<>'active' THEN RAISE EXCEPTION 'source no longer active' USING ERRCODE='23514'; END IF;
 UPDATE public.finance_integrity_proofs SET anchor_status=CASE WHEN dispatch_reserved_at IS NULL THEN 'queued' ELSE 'pending' END,next_attempt_at=now(),consecutive_failures=0,last_error_code=NULL,row_version=row_version+1 WHERE id=p.id;
 INSERT INTO public.finance_integrity_events(proof_id,event_type,actor_id) VALUES(p.id,'resumed',auth.uid());
 RETURN public.phase5_proof_dto(p.id);
END $f$;
REVOKE ALL ON FUNCTION public.phase5_resume_finance_integrity_proof(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase5_resume_finance_integrity_proof(uuid,bigint) TO authenticated;
COMMIT;
