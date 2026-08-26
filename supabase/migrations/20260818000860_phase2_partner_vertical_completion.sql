-- Complete Partner lifecycle/contact/term/need operations and make legacy
-- account suspension a recoverable two-step Auth/application transition.
BEGIN;

ALTER TABLE public.legacy_account_partner_mappings
 ADD COLUMN IF NOT EXISTS auth_suspension_status text NOT NULL DEFAULT 'not_requested',
 ADD COLUMN IF NOT EXISTS auth_suspension_request_id uuid,
 ADD COLUMN IF NOT EXISTS auth_suspension_requested_at timestamptz,
 ADD COLUMN IF NOT EXISTS auth_suspension_completed_at timestamptz,
 ADD COLUMN IF NOT EXISTS auth_suspension_error_code text;
DO $block$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='legacy_mapping_auth_suspension_status_check' AND conrelid='public.legacy_account_partner_mappings'::regclass) THEN
  ALTER TABLE public.legacy_account_partner_mappings ADD CONSTRAINT legacy_mapping_auth_suspension_status_check
   CHECK(auth_suspension_status IN('not_requested','requested','failed','completed'));
 END IF;
END $block$;

CREATE OR REPLACE FUNCTION public.phase2_update_partner(p_partner_id uuid,p_expected_version integer,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.partner_entities; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 IF NOT public.phase2_current_has_capability('partnership.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['name','legal_name','lifecycle']) THEN RAISE EXCEPTION 'unknown partner field' USING ERRCODE='22023'; END IF;
 SELECT * INTO item FROM public.partner_entities WHERE id=p_partner_id FOR UPDATE;
 PERFORM public.phase2_assert_v2_write_authority('partners',item.data_mode);
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale partner version' USING ERRCODE='40001'; END IF;
 IF item.lifecycle='merged' THEN RAISE EXCEPTION 'merged Partner is immutable' USING ERRCODE='42501'; END IF;
 IF p_payload?'name' AND length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'invalid partner name' USING ERRCODE='22023'; END IF;
 IF p_payload?'lifecycle' AND p_payload->>'lifecycle' NOT IN('active','inactive') THEN RAISE EXCEPTION 'invalid lifecycle' USING ERRCODE='22023'; END IF;
 UPDATE public.partner_entities SET name=CASE WHEN p_payload?'name' THEN btrim(p_payload->>'name') ELSE name END,
  legal_name=CASE WHEN p_payload?'legal_name' THEN nullif(btrim(p_payload->>'legal_name'),'') ELSE legal_name END,
  lifecycle=CASE WHEN p_payload?'lifecycle' THEN p_payload->>'lifecycle' ELSE lifecycle END,
  row_version=row_version+1,updated_at=now() WHERE id=p_partner_id;
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,snapshot) VALUES(p_partner_id,'partner_updated',auth.uid(),p_payload);
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'partner.update','partner_entity',p_partner_id::text);
 RETURN p_expected_version+1;
END;
$function$;

-- There must be one active primary contact whenever an entity has an active
-- contact. The first active contact is promoted automatically.
CREATE OR REPLACE FUNCTION public.phase2_add_partner_contact(p_partner_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; make_primary boolean; actor_email text; partner_mode text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 SELECT data_mode INTO partner_mode FROM public.partner_entities WHERE id=p_partner_id AND lifecycle<>'merged';
 PERFORM public.phase2_assert_v2_write_authority('partners',partner_mode);
 IF NOT public.phase2_current_has_capability('partner.contact.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['full_name','title','email','phone','preferred_channel','is_primary','status_email_opt_in','consent_source','consent_at','active_from','active_until']) THEN RAISE EXCEPTION 'unknown contact field' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'full_name',''))) NOT BETWEEN 1 AND 160 OR coalesce(p_payload->>'preferred_channel','manual') NOT IN('email','phone','manual')
    OR nullif(p_payload->>'active_from','') IS NULL THEN RAISE EXCEPTION 'invalid contact' USING ERRCODE='22023'; END IF;
 IF coalesce((p_payload->>'status_email_opt_in')::boolean,false)
    AND (nullif(p_payload->>'email','') IS NULL OR nullif(p_payload->>'consent_source','') IS NULL OR nullif(p_payload->>'consent_at','') IS NULL) THEN
  RAISE EXCEPTION 'email opt-in requires consent evidence' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-primary:'||p_partner_id::text,0));
 make_primary:=coalesce((p_payload->>'is_primary')::boolean,false)
  OR NOT EXISTS(SELECT 1 FROM public.partner_contacts WHERE partner_id=p_partner_id AND active_until IS NULL);
 IF make_primary THEN UPDATE public.partner_contacts SET is_primary=false,row_version=row_version+1,updated_at=now() WHERE partner_id=p_partner_id AND is_primary AND active_until IS NULL; END IF;
 INSERT INTO public.partner_contacts(partner_id,full_name,title,email,phone,preferred_channel,is_primary,status_email_opt_in,consent_source,consent_at,active_from,active_until,created_by)
 VALUES(p_partner_id,btrim(p_payload->>'full_name'),nullif(p_payload->>'title',''),nullif(p_payload->>'email',''),nullif(p_payload->>'phone',''),coalesce(p_payload->>'preferred_channel','manual'),make_primary,
  coalesce((p_payload->>'status_email_opt_in')::boolean,false),nullif(p_payload->>'consent_source',''),nullif(p_payload->>'consent_at','')::timestamptz,(p_payload->>'active_from')::date,nullif(p_payload->>'active_until','')::date,auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,snapshot) VALUES(p_partner_id,'contact_added',auth.uid(),jsonb_build_object('contact_id',new_id,'primary',make_primary));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'partner.contact.create','partner_contact',new_id::text);
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_update_partner_contact(p_partner_id uuid,p_contact_id uuid,p_expected_version integer,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.partner_contacts; desired_primary boolean; actor_email text; updated_item public.partner_contacts; partner_mode text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 SELECT data_mode INTO partner_mode FROM public.partner_entities WHERE id=p_partner_id AND lifecycle<>'merged';
 PERFORM public.phase2_assert_v2_write_authority('partners',partner_mode);
 IF NOT public.phase2_current_has_capability('partner.contact.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['full_name','title','email','phone','preferred_channel','is_primary','status_email_opt_in','consent_source','consent_at','active_until']) THEN RAISE EXCEPTION 'unknown contact field' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-primary:'||p_partner_id::text,0));
 SELECT * INTO item FROM public.partner_contacts WHERE id=p_contact_id AND partner_id=p_partner_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'contact not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale contact version' USING ERRCODE='40001'; END IF;
 desired_primary:=CASE WHEN p_payload?'is_primary' THEN (p_payload->>'is_primary')::boolean ELSE item.is_primary END;
 IF item.is_primary AND NOT desired_primary AND item.active_until IS NULL THEN RAISE EXCEPTION 'promote another active contact instead of removing the only primary' USING ERRCODE='23514'; END IF;
 IF desired_primary THEN UPDATE public.partner_contacts SET is_primary=false,row_version=row_version+1,updated_at=now() WHERE partner_id=p_partner_id AND id<>p_contact_id AND is_primary AND active_until IS NULL; END IF;
 UPDATE public.partner_contacts SET
  full_name=CASE WHEN p_payload?'full_name' THEN btrim(p_payload->>'full_name') ELSE full_name END,
  title=CASE WHEN p_payload?'title' THEN nullif(btrim(p_payload->>'title'),'') ELSE title END,
  email=CASE WHEN p_payload?'email' THEN nullif(btrim(p_payload->>'email'),'') ELSE email END,
  phone=CASE WHEN p_payload?'phone' THEN nullif(btrim(p_payload->>'phone'),'') ELSE phone END,
  preferred_channel=CASE WHEN p_payload?'preferred_channel' THEN p_payload->>'preferred_channel' ELSE preferred_channel END,
  is_primary=desired_primary,
  status_email_opt_in=CASE WHEN p_payload?'status_email_opt_in' THEN (p_payload->>'status_email_opt_in')::boolean ELSE status_email_opt_in END,
  consent_source=CASE WHEN p_payload?'consent_source' THEN nullif(btrim(p_payload->>'consent_source'),'') ELSE consent_source END,
  consent_at=CASE WHEN p_payload?'consent_at' THEN nullif(p_payload->>'consent_at','')::timestamptz ELSE consent_at END,
  active_until=CASE WHEN p_payload?'active_until' THEN nullif(p_payload->>'active_until','')::date ELSE active_until END,
  row_version=row_version+1,updated_at=now()
 WHERE id=p_contact_id RETURNING * INTO updated_item;
 IF updated_item.active_until IS NOT NULL AND updated_item.is_primary THEN RAISE EXCEPTION 'an ended contact cannot remain primary' USING ERRCODE='23514'; END IF;
 IF updated_item.status_email_opt_in AND (updated_item.email IS NULL OR updated_item.consent_source IS NULL OR updated_item.consent_at IS NULL) THEN RAISE EXCEPTION 'email opt-in requires consent evidence' USING ERRCODE='23514'; END IF;
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,snapshot) VALUES(p_partner_id,'contact_updated',auth.uid(),jsonb_build_object('contact_id',p_contact_id,'primary',updated_item.is_primary,'active',updated_item.active_until IS NULL));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'partner.contact.update','partner_contact',p_contact_id::text);
 RETURN updated_item.row_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_transition_partnership_term(p_partner_id uuid,p_term_id uuid,p_expected_version integer,p_action text,p_effective_on date,p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.partnership_terms; next_status text; actor_email text; partner_mode text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 SELECT data_mode INTO partner_mode FROM public.partner_entities WHERE id=p_partner_id AND lifecycle<>'merged';
 PERFORM public.phase2_assert_v2_write_authority('partners',partner_mode);
 IF NOT public.phase2_current_has_capability('partner.renew') OR p_action NOT IN('suspend','resume','end') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'forbidden or invalid term action' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.partnership_terms WHERE id=p_term_id AND partner_id=p_partner_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'term not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale term version' USING ERRCODE='40001'; END IF;
 IF p_effective_on<item.starts_on THEN RAISE EXCEPTION 'effective date precedes term start' USING ERRCODE='22023'; END IF;
 IF p_action='suspend' AND item.status='active' THEN next_status:='suspended';
 ELSIF p_action='resume' AND item.status='suspended' THEN next_status:='active';
 ELSIF p_action='end' AND item.status IN('proposed','active','suspended') THEN next_status:='ended';
 ELSE RAISE EXCEPTION 'invalid term transition' USING ERRCODE='42501'; END IF;
 UPDATE public.partnership_terms SET status=next_status,ends_on=CASE WHEN next_status='ended' THEN p_effective_on ELSE ends_on END,row_version=row_version+1,updated_at=now() WHERE id=p_term_id;
 INSERT INTO public.partnership_events(partner_id,term_id,event_type,actor_id,reason,snapshot) VALUES(p_partner_id,p_term_id,'term_'||p_action,auth.uid(),p_reason,jsonb_build_object('effective_on',p_effective_on));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'partner.term.'||p_action,'partnership_term',p_term_id::text,jsonb_build_object('effective_on',p_effective_on));
 RETURN p_expected_version+1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_merge_partner(p_source_partner_id uuid,p_target_partner_id uuid,p_expected_version integer,p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE source_item public.partner_entities; target_item public.partner_entities; actor_email text;
BEGIN
 IF p_source_partner_id=p_target_partner_id OR length(btrim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'invalid merge request' USING ERRCODE='22023'; END IF;
 PERFORM public.phase2_assert_runtime('partners',p_source_partner_id); PERFORM public.phase2_assert_runtime('partners',p_target_partner_id);
 IF NOT public.phase2_current_has_capability('partner.policy.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.partner_entities WHERE id IN(p_source_partner_id,p_target_partner_id) ORDER BY id FOR UPDATE;
 SELECT * INTO source_item FROM public.partner_entities WHERE id=p_source_partner_id;
 SELECT * INTO target_item FROM public.partner_entities WHERE id=p_target_partner_id;
 PERFORM public.phase2_assert_v2_write_authority('partners',source_item.data_mode);
 IF source_item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale partner version' USING ERRCODE='40001'; END IF;
 IF source_item.lifecycle='merged' OR target_item.lifecycle<>'active' OR source_item.data_mode<>target_item.data_mode
    OR source_item.entity_type<>target_item.entity_type OR source_item.classification<>target_item.classification
    OR (source_item.barangay_id IS NOT NULL AND source_item.barangay_id IS DISTINCT FROM target_item.barangay_id) THEN
  RAISE EXCEPTION 'merge target is incompatible' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.partner_entity_roles(partner_id,role,created_by) SELECT p_target_partner_id,role,auth.uid() FROM public.partner_entity_roles WHERE partner_id=p_source_partner_id ON CONFLICT DO NOTHING;
 UPDATE public.partner_entities SET lifecycle='merged',merged_into_id=p_target_partner_id,row_version=row_version+1,updated_at=now() WHERE id=p_source_partner_id;
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,reason,snapshot) VALUES
  (p_source_partner_id,'partner_merged',auth.uid(),p_reason,jsonb_build_object('target_partner_id',p_target_partner_id)),
  (p_target_partner_id,'partner_merge_received',auth.uid(),p_reason,jsonb_build_object('source_partner_id',p_source_partner_id));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(auth.uid(),actor_email,'partner.merge','partner_entity',p_source_partner_id::text,'warning',jsonb_build_object('target_partner_id',p_target_partner_id));
 RETURN p_expected_version+1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_upsert_partnership_need(p_partner_id uuid,p_term_id uuid,p_need_id uuid,p_expected_term_version integer,p_coverage text,p_notes text,p_evidence_type text,p_evidence_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE term public.partnership_terms; partner public.partner_entities; need public.community_needs; link_id uuid; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 IF NOT public.phase2_current_has_capability('partnership.manage') OR p_coverage NOT IN('unaddressed','partial','addressed')
    OR p_evidence_type NOT IN('program','historical_program','partner_document','manual_note') THEN RAISE EXCEPTION 'forbidden or invalid need link' USING ERRCODE='42501'; END IF;
 SELECT * INTO partner FROM public.partner_entities WHERE id=p_partner_id AND lifecycle<>'merged'; PERFORM public.phase2_assert_v2_write_authority('partners',partner.data_mode);
 SELECT * INTO term FROM public.partnership_terms WHERE id=p_term_id AND partner_id=p_partner_id FOR UPDATE;
 SELECT * INTO need FROM public.community_needs WHERE id=p_need_id;
 IF term.id IS NULL OR term.row_version<>p_expected_term_version OR term.status='ended' THEN RAISE EXCEPTION 'stale or closed term' USING ERRCODE='40001'; END IF;
 IF need.id IS NULL OR need.approval_status<>'approved' OR (partner.barangay_id IS NOT NULL AND need.barangay_id<>partner.barangay_id) THEN RAISE EXCEPTION 'need is not approved for this Partner' USING ERRCODE='23514'; END IF;
 IF p_evidence_type='manual_note' AND (p_evidence_id IS NOT NULL OR length(btrim(coalesce(p_notes,'')))<5) THEN RAISE EXCEPTION 'manual evidence requires notes only' USING ERRCODE='23514'; END IF;
 IF p_evidence_type='program' AND NOT EXISTS(SELECT 1 FROM public.program_partner_links WHERE program_id=p_evidence_id AND partner_id=p_partner_id)
 OR p_evidence_type='historical_program' AND NOT EXISTS(SELECT 1 FROM public.historical_program_partner_links WHERE historical_program_id=p_evidence_id AND partner_id=p_partner_id)
 OR p_evidence_type='partner_document' AND NOT EXISTS(SELECT 1 FROM public.partnership_documents WHERE id=p_evidence_id AND partner_id=p_partner_id AND scan_status IN('approved','risk_accepted')) THEN
  RAISE EXCEPTION 'evidence is not authorized for this Partner' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.partnership_need_links(term_id,need_id,coverage,notes,evidence,created_by)
 VALUES(p_term_id,p_need_id,p_coverage,nullif(btrim(p_notes),''),jsonb_build_object('type',p_evidence_type,'id',p_evidence_id),auth.uid())
 ON CONFLICT(term_id,need_id) DO UPDATE SET coverage=excluded.coverage,notes=excluded.notes,evidence=excluded.evidence RETURNING id INTO link_id;
 INSERT INTO public.partnership_events(partner_id,term_id,event_type,actor_id,snapshot) VALUES(p_partner_id,p_term_id,'need_link_updated',auth.uid(),jsonb_build_object('need_id',p_need_id,'coverage',p_coverage,'evidence_type',p_evidence_type));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'partner.need.upsert','partnership_need_link',link_id::text);
 RETURN link_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_partner_type_policies()
RETURNS TABLE(entity_type text,agreement_required boolean,effective_from date,changed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 PERFORM public.phase2_assert_actor_runtime('partners');
 IF NOT public.phase2_current_has_capability('partnership.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.entity_type,p.agreement_required,p.effective_from,p.changed_at FROM public.partner_type_policies p ORDER BY p.entity_type;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_configure_partner_type_policy(p_entity_type text,p_agreement_required boolean,p_effective_from date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor_email text;
BEGIN
 PERFORM public.phase2_assert_actor_runtime('partners');
 IF NOT public.phase2_current_has_capability('partner.policy.manage') OR p_effective_from<current_date THEN RAISE EXCEPTION 'Director-only prospective policy required' USING ERRCODE='42501'; END IF;
 UPDATE public.partner_type_policies SET agreement_required=p_agreement_required,effective_from=p_effective_from,changed_by=auth.uid(),changed_at=now() WHERE entity_type=p_entity_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown Partner type' USING ERRCODE='22023'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(auth.uid(),actor_email,'partner.policy.configure','partner_type_policy',p_entity_type,'warning',jsonb_build_object('agreement_required',p_agreement_required,'effective_from',p_effective_from));
END;
$function$;

-- Sign-off records a durable Auth suspension request. The application account
-- is deactivated only after the separately authorized Auth operation succeeds.
CREATE OR REPLACE FUNCTION public.phase2_reconcile_legacy_partner_mapping_v2(p_legacy_user_id uuid,p_partner_id uuid,p_responsible_officer_id uuid,p_expected_version integer,p_action text,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.legacy_account_partner_mappings; partner_mode text; next_status text; pc integer; gc integer; mapped_pc integer; mapped_gc integer; pending integer; actor_email text; request_id uuid; new_version integer;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 IF NOT public.phase2_current_has_capability('partner.legacy_mapping.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT data_mode INTO partner_mode FROM public.partner_entities WHERE id=p_partner_id AND lifecycle<>'merged'; PERFORM public.phase2_assert_v2_write_authority('partners',partner_mode);
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_responsible_officer_id AND status='active' AND is_active AND role IN('paraya_director','paraya_associate','paraya_researcher')) THEN RAISE EXCEPTION 'responsible officer is invalid' USING ERRCODE='23514'; END IF;
 SELECT * INTO item FROM public.legacy_account_partner_mappings WHERE legacy_user_id=p_legacy_user_id FOR UPDATE;
 IF item.legacy_user_id IS NULL THEN RAISE EXCEPTION 'mapping not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale mapping version' USING ERRCODE='40001'; END IF;
 IF partner_mode='synthetic' AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_legacy_user_id AND is_synthetic_test) THEN RAISE EXCEPTION 'synthetic cutover cannot target a live identity' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN('start_review','approve','sign_off') OR length(btrim(coalesce(p_notes,'')))<5 THEN RAISE EXCEPTION 'invalid mapping action' USING ERRCODE='22023'; END IF;
 IF p_action='start_review' AND item.reconciliation_status NOT IN('candidate','in_review')
 OR p_action='approve' AND item.reconciliation_status<>'in_review'
 OR p_action='sign_off' AND item.reconciliation_status<>'approved' THEN RAISE EXCEPTION 'invalid mapping transition' USING ERRCODE='42501'; END IF;
 next_status:=CASE p_action WHEN 'start_review' THEN 'in_review' WHEN 'approve' THEN 'approved' ELSE 'signed_off' END;
 SELECT count(*)::int INTO pc FROM public.project_proposals WHERE created_by=p_legacy_user_id;
 SELECT count(DISTINCT pr.id)::int INTO gc FROM public.programs pr LEFT JOIN public.project_proposals q ON q.id=pr.project_proposal_id WHERE pr.created_by=p_legacy_user_id OR q.created_by=p_legacy_user_id;
 SELECT count(*)::int INTO pending FROM public.project_proposals WHERE created_by=p_legacy_user_id AND status NOT IN('approved','rejected');
 INSERT INTO public.proposal_partner_links(proposal_id,partner_id,partner_role,created_by) SELECT q.id,p_partner_id,'originating_proponent',auth.uid() FROM public.project_proposals q WHERE q.created_by=p_legacy_user_id ON CONFLICT DO NOTHING;
 INSERT INTO public.program_partner_links(program_id,partner_id,partner_role,created_by)
 SELECT DISTINCT pr.id,p_partner_id,'lead_implementer',auth.uid() FROM public.programs pr LEFT JOIN public.project_proposals q ON q.id=pr.project_proposal_id
 WHERE pr.created_by=p_legacy_user_id OR q.created_by=p_legacy_user_id ON CONFLICT DO NOTHING;
 SELECT count(DISTINCT l.proposal_id)::int INTO mapped_pc FROM public.proposal_partner_links l JOIN public.project_proposals q ON q.id=l.proposal_id WHERE l.partner_id=p_partner_id AND l.partner_role='originating_proponent' AND q.created_by=p_legacy_user_id;
 SELECT count(DISTINCT l.program_id)::int INTO mapped_gc FROM public.program_partner_links l JOIN public.programs pr ON pr.id=l.program_id LEFT JOIN public.project_proposals q ON q.id=pr.project_proposal_id WHERE l.partner_id=p_partner_id AND (pr.created_by=p_legacy_user_id OR q.created_by=p_legacy_user_id);
 IF p_action='sign_off' AND (mapped_pc<>pc OR mapped_gc<>gc) THEN RAISE EXCEPTION 'source and mapped work counts do not reconcile' USING ERRCODE='23514'; END IF;
 IF p_action='sign_off' THEN
  request_id:=gen_random_uuid();
  UPDATE public.proposal_v2_profiles v SET responsible_officer_id=p_responsible_officer_id,updated_at=now() FROM public.project_proposals q WHERE q.id=v.proposal_id AND q.created_by=p_legacy_user_id AND v.workflow_status NOT IN('approved','rejected');
  UPDATE public.programs pr SET phase2_responsible_officer_id=p_responsible_officer_id,updated_at=now() WHERE (pr.created_by=p_legacy_user_id OR EXISTS(SELECT 1 FROM public.project_proposals q WHERE q.id=pr.project_proposal_id AND q.created_by=p_legacy_user_id)) AND pr.status NOT IN('completed','cancelled');
 END IF;
 UPDATE public.legacy_account_partner_mappings SET partner_id=p_partner_id,responsible_officer_id=p_responsible_officer_id,reconciliation_status=next_status,
  proposal_count=pc,program_count=gc,pending_work_count=pending,notes=p_notes,row_version=row_version+1,updated_at=now(),
  approved_by=CASE WHEN p_action='approve' THEN auth.uid() ELSE approved_by END,approved_at=CASE WHEN p_action='approve' THEN now() ELSE approved_at END,
  signed_off_by=CASE WHEN p_action='sign_off' THEN auth.uid() ELSE signed_off_by END,signed_off_at=CASE WHEN p_action='sign_off' THEN now() ELSE signed_off_at END,
  auth_suspension_status=CASE WHEN p_action='sign_off' THEN 'requested' ELSE auth_suspension_status END,
  auth_suspension_request_id=CASE WHEN p_action='sign_off' THEN request_id ELSE auth_suspension_request_id END,
  auth_suspension_requested_at=CASE WHEN p_action='sign_off' THEN now() ELSE auth_suspension_requested_at END,
  auth_suspension_error_code=CASE WHEN p_action='sign_off' THEN NULL ELSE auth_suspension_error_code END
 WHERE legacy_user_id=p_legacy_user_id RETURNING row_version INTO new_version;
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,reason,snapshot) VALUES(p_partner_id,'legacy_mapping_'||p_action,auth.uid(),p_notes,jsonb_build_object('legacy_user_id',p_legacy_user_id,'proposal_count',pc,'program_count',gc,'pending_work_count',pending,'suspension_request_id',request_id));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(auth.uid(),actor_email,'partner.mapping.'||p_action,'legacy_account_partner_mapping',p_legacy_user_id::text,'warning',jsonb_build_object('partner_id',p_partner_id,'suspension_request_id',request_id));
 RETURN jsonb_build_object('status',next_status,'rowVersion',new_version,'suspensionRequestId',request_id,'dataMode',partner_mode);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_finalize_legacy_auth_suspension(p_actor_id uuid,p_legacy_user_id uuid,p_request_id uuid,p_succeeded boolean,p_error_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.legacy_account_partner_mappings; partner_mode text; runtime_mode text; actor public.users; allowed_users uuid[]; allowed_entities uuid[]; actor_email text; new_version integer;
BEGIN
 SELECT * INTO item FROM public.legacy_account_partner_mappings WHERE legacy_user_id=p_legacy_user_id FOR UPDATE;
 IF item.legacy_user_id IS NULL OR item.auth_suspension_request_id IS DISTINCT FROM p_request_id OR item.reconciliation_status<>'signed_off' OR item.auth_suspension_status NOT IN('requested','failed') THEN RAISE EXCEPTION 'stale suspension request' USING ERRCODE='40001'; END IF;
 SELECT data_mode INTO partner_mode FROM public.partner_entities WHERE id=item.partner_id;
 SELECT mode,synthetic_user_ids,synthetic_entity_ids INTO runtime_mode,allowed_users,allowed_entities FROM public.phase2_component_runtime WHERE component='partners';
 SELECT * INTO actor FROM public.users WHERE id=p_actor_id;
 IF runtime_mode IS NULL OR runtime_mode='off' OR runtime_mode<>partner_mode OR actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE
    OR NOT public.phase2_role_has_capability(actor.role,'partner.legacy_mapping.manage')
    OR coalesce((actor.permissions->>public.phase2_permission_module('partner.legacy_mapping.manage'))::boolean,true) IS FALSE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF partner_mode='synthetic' AND NOT(actor.is_synthetic_test IS TRUE AND actor.id=ANY(allowed_users) AND item.partner_id=ANY(allowed_entities)) THEN RAISE EXCEPTION 'synthetic suspension is outside the allowlist' USING ERRCODE='42501'; END IF;
 IF NOT p_succeeded AND coalesce(p_error_code,'') !~ '^[a-z0-9_]{3,80}$' THEN RAISE EXCEPTION 'bounded error code required' USING ERRCODE='22023'; END IF;
 IF p_succeeded THEN
  UPDATE public.users SET status='suspended',is_active=false,updated_at=now() WHERE id=p_legacy_user_id;
  UPDATE public.legacy_account_partner_mappings SET reconciliation_status='suspended',auth_suspension_status='completed',auth_suspension_completed_at=now(),auth_suspension_error_code=NULL,row_version=row_version+1,updated_at=now() WHERE legacy_user_id=p_legacy_user_id RETURNING row_version INTO new_version;
 ELSE
  UPDATE public.legacy_account_partner_mappings SET auth_suspension_status='failed',auth_suspension_error_code=p_error_code,row_version=row_version+1,updated_at=now() WHERE legacy_user_id=p_legacy_user_id RETURNING row_version INTO new_version;
 END IF;
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,snapshot) VALUES(item.partner_id,CASE WHEN p_succeeded THEN 'legacy_auth_suspension_completed' ELSE 'legacy_auth_suspension_failed' END,p_actor_id,jsonb_build_object('legacy_user_id',p_legacy_user_id,'request_id',p_request_id,'error_code',CASE WHEN p_succeeded THEN NULL ELSE p_error_code END));
 SELECT email INTO actor_email FROM public.users WHERE id=p_actor_id;
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(p_actor_id,actor_email,'partner.mapping.auth_suspension','legacy_account_partner_mapping',p_legacy_user_id::text,'warning',jsonb_build_object('request_id',p_request_id,'succeeded',p_succeeded,'error_code',CASE WHEN p_succeeded THEN NULL ELSE p_error_code END,'data_mode',partner_mode));
 RETURN jsonb_build_object('status',CASE WHEN p_succeeded THEN 'suspended' ELSE 'signed_off' END,'authSuspensionStatus',CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END,'rowVersion',new_version);
END;
$function$;

-- Add suspension state to the allowlisted mapping queue and use the additive
-- current-proposal key when deriving program attribution.
DROP FUNCTION public.phase2_list_legacy_partner_mappings();
CREATE OR REPLACE FUNCTION public.phase2_list_legacy_partner_mappings()
RETURNS TABLE(legacy_user_id uuid,legacy_email text,legacy_role text,org_name text,partner_id uuid,partner_name text,reconciliation_status text,responsible_officer_id uuid,proposal_count integer,program_count integer,pending_work_count integer,row_version integer,auth_suspension_status text,auth_suspension_request_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 PERFORM public.phase2_assert_actor_runtime('partners');
 IF NOT public.phase2_current_has_capability('partner.legacy_mapping.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT m.legacy_user_id,u.email,u.role,u.org_name,m.partner_id,p.name,m.reconciliation_status,m.responsible_officer_id,
  (SELECT count(*)::int FROM public.project_proposals q WHERE q.created_by=m.legacy_user_id),
  (SELECT count(DISTINCT pr.id)::int FROM public.programs pr LEFT JOIN public.project_proposals q ON q.id=pr.project_proposal_id WHERE pr.created_by=m.legacy_user_id OR q.created_by=m.legacy_user_id),
  (SELECT count(*)::int FROM public.project_proposals q WHERE q.created_by=m.legacy_user_id AND q.status NOT IN('approved','rejected')),
  m.row_version,m.auth_suspension_status,m.auth_suspension_request_id
 FROM public.legacy_account_partner_mappings m JOIN public.users u ON u.id=m.legacy_user_id JOIN public.partner_entities p ON p.id=m.partner_id
 WHERE p.data_mode=(SELECT mode FROM public.phase2_component_runtime WHERE component='partners') ORDER BY p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_partner_relationship_detail(p_partner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users; result jsonb; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 IF NOT public.phase2_current_has_capability('partnership.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF actor.role NOT IN('paraya_director','paraya_associate','paraya_researcher')
    AND NOT EXISTS(SELECT 1 FROM public.partner_entities WHERE id=p_partner_id AND barangay_id=actor.barangay_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'termId',d.term_id,'type',d.document_type,'mimeType',d.mime_type,
    'sizeBytes',d.size_bytes,'effectiveOn',d.effective_on,'expiresOn',d.expires_on,'visibility',d.visibility,'scanStatus',d.scan_status,'createdAt',d.created_at) ORDER BY d.created_at DESC)
   FROM public.partnership_documents d WHERE d.partner_id=p_partner_id AND
    (public.phase2_current_has_capability('partner.document.read') OR d.visibility='linked_barangay' AND actor.barangay_id=(SELECT barangay_id FROM public.partner_entities WHERE id=p_partner_id))),'[]'::jsonb),
  'needs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'termId',n.term_id,'needId',n.need_id,'category',c.category,
    'coverage',n.coverage,'notes',n.notes,'evidenceType',n.evidence->>'type','evidenceId',n.evidence->>'id') ORDER BY t.starts_on DESC,c.category)
   FROM public.partnership_need_links n JOIN public.partnership_terms t ON t.id=n.term_id JOIN public.community_needs c ON c.id=n.need_id
   WHERE t.partner_id=p_partner_id),'[]'::jsonb)
 ) INTO result;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'partner.relationship_detail.read','partner_entity',p_partner_id::text);
 RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_reconcile_legacy_partner_mapping(uuid,uuid,uuid,integer,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.phase2_update_partner_contact(uuid,uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_transition_partnership_term(uuid,uuid,integer,text,date,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_merge_partner(uuid,uuid,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_upsert_partnership_need(uuid,uuid,uuid,integer,text,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_partner_type_policies() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_configure_partner_type_policy(text,boolean,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_reconcile_legacy_partner_mapping_v2(uuid,uuid,uuid,integer,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_finalize_legacy_auth_suspension(uuid,uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_get_partner_relationship_detail(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_update_partner_contact(uuid,uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_transition_partnership_term(uuid,uuid,integer,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_merge_partner(uuid,uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_upsert_partnership_need(uuid,uuid,uuid,integer,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_partner_type_policies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_configure_partner_type_policy(text,boolean,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_reconcile_legacy_partner_mapping_v2(uuid,uuid,uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_finalize_legacy_auth_suspension(uuid,uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase2_get_partner_relationship_detail(uuid) TO authenticated;

-- Direct changes remain RPC-only and the release boundary remains disabled.
REVOKE INSERT,UPDATE,DELETE ON public.partner_contacts,public.partnership_terms,public.partnership_need_links,public.partner_type_policies,public.legacy_account_partner_mappings FROM authenticated;
UPDATE public.phase2_component_runtime SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state SET write_authority='v1',changed_at=now();

COMMIT;
