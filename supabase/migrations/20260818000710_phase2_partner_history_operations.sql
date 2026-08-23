-- Complete the Partner/Proponent and historical-program vertical slices.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase2_list_partners()
RETURNS TABLE(id uuid,code text,name text,legal_name text,entity_type text,classification text,lifecycle text,barangay_id uuid,row_version integer,roles text[],term_status text,derived_term_status text,starts_on date,expires_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users; active_mode text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('partners');
 IF NOT public.phase2_current_has_capability('partnership.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE public.users.id=auth.uid();
 RETURN QUERY SELECT p.id,p.code,p.name,p.legal_name,p.entity_type,p.classification,p.lifecycle,p.barangay_id,p.row_version,
  ARRAY(SELECT r.role FROM public.partner_entity_roles r WHERE r.partner_id=p.id ORDER BY r.role),t.status,
  CASE WHEN t.status='active' AND t.expires_on<current_date THEN 'expired'
       WHEN t.status='active' AND t.expires_on<=current_date+60 THEN 'expiring_soon' ELSE t.status END,
  t.starts_on,t.expires_on
 FROM public.partner_entities p
 LEFT JOIN LATERAL(SELECT pt.* FROM public.partnership_terms pt WHERE pt.partner_id=p.id AND pt.status IN('proposed','active','suspended') ORDER BY pt.created_at DESC LIMIT 1)t ON true
 WHERE p.data_mode=active_mode AND (actor.role IN('paraya_director','paraya_associate','paraya_researcher') OR p.barangay_id=actor.barangay_id)
 ORDER BY p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_create_partner(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; role_name text; actor_email text; active_mode text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('partners');
 PERFORM public.phase2_assert_v2_write_authority('partners',active_mode);
 IF NOT public.phase2_current_has_capability('partnership.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['name','legal_name','entity_type','classification','roles','barangay_id']) THEN RAISE EXCEPTION 'unknown partner field' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 160
  OR p_payload->>'entity_type' NOT IN('barangay','dyci_office','student_organization','academic_department','external_organization','government_agency','school','faith_based','other')
 OR p_payload->>'classification' NOT IN('internal','external') OR jsonb_typeof(coalesce(p_payload->'roles','[]'))<>'array'
 THEN RAISE EXCEPTION 'invalid partner payload' USING ERRCODE='22023'; END IF;
 IF nullif(p_payload->>'barangay_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=(p_payload->>'barangay_id')::uuid AND b.is_synthetic_test=(active_mode='synthetic')) THEN RAISE EXCEPTION 'barangay is outside the active data mode' USING ERRCODE='42501'; END IF;
 INSERT INTO public.partner_entities(name,legal_name,entity_type,classification,barangay_id,created_by,data_mode)
 VALUES(btrim(p_payload->>'name'),nullif(btrim(p_payload->>'legal_name'),''),p_payload->>'entity_type',p_payload->>'classification',nullif(p_payload->>'barangay_id','')::uuid,auth.uid(),active_mode)
 RETURNING id INTO new_id;
 FOR role_name IN SELECT jsonb_array_elements_text(coalesce(p_payload->'roles','[]')) LOOP
  IF role_name NOT IN('partner','proponent') THEN RAISE EXCEPTION 'invalid entity role' USING ERRCODE='22023'; END IF;
  INSERT INTO public.partner_entity_roles(partner_id,role,created_by) VALUES(new_id,role_name,auth.uid()) ON CONFLICT DO NOTHING;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.partner_entity_roles WHERE partner_id=new_id) THEN RAISE EXCEPTION 'at least one entity role is required' USING ERRCODE='22023'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'partner.create','partner_entity',new_id::text,jsonb_build_object('entity_type',p_payload->>'entity_type','data_mode',active_mode));
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,snapshot) VALUES(new_id,'partner_created',auth.uid(),jsonb_build_object('name',p_payload->>'name','data_mode',active_mode));
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_partner(p_partner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users; result jsonb; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 IF NOT public.phase2_current_has_capability('partnership.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF actor.role NOT IN('paraya_director','paraya_associate','paraya_researcher')
   AND NOT EXISTS(SELECT 1 FROM public.partner_entities WHERE id=p_partner_id AND barangay_id=actor.barangay_id) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
  'id',p.id,'code',p.code,'name',p.name,'legalName',p.legal_name,'type',p.entity_type,'classification',p.classification,
  'lifecycle',p.lifecycle,'barangayId',p.barangay_id,'rowVersion',p.row_version,
  'roles',coalesce((SELECT jsonb_agg(r.role ORDER BY r.role) FROM public.partner_entity_roles r WHERE r.partner_id=p.id),'[]'::jsonb),
  'contacts',CASE WHEN public.phase2_current_has_capability('partner.contact.read') THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',c.id,'fullName',c.full_name,'title',c.title,'email',c.email,'phone',c.phone,'preferredChannel',c.preferred_channel,
    'isPrimary',c.is_primary,'statusEmailOptIn',c.status_email_opt_in,'activeFrom',c.active_from,'activeUntil',c.active_until,'rowVersion',c.row_version
   ) ORDER BY c.is_primary DESC,c.full_name) FROM public.partner_contacts c WHERE c.partner_id=p.id),'[]'::jsonb) ELSE '[]'::jsonb END,
  'terms',coalesce((SELECT jsonb_agg(CASE WHEN public.phase2_current_has_capability('partner.contact.read') THEN jsonb_build_object('id',t.id,'status',t.status,
    'derivedStatus',CASE WHEN t.status='active' AND t.expires_on<current_date THEN 'expired' WHEN t.status='active' AND t.expires_on<=current_date+60 THEN 'expiring_soon' ELSE t.status END,
    'startsOn',t.starts_on,'expiresOn',t.expires_on,'endsOn',t.ends_on,'responsibleOfficerId',t.responsible_officer_id,
    'agreementDocumentId',t.agreement_document_id,'agreementException',CASE WHEN t.agreement_exception_reason IS NULL THEN NULL ELSE jsonb_build_object('reason',t.agreement_exception_reason,'dueOn',t.agreement_exception_due_on) END,'rowVersion',t.row_version)
    ELSE jsonb_build_object('status',t.status,'derivedStatus',CASE WHEN t.status='active' AND t.expires_on<current_date THEN 'expired' WHEN t.status='active' AND t.expires_on<=current_date+60 THEN 'expiring_soon' ELSE t.status END,'startsOn',t.starts_on,'expiresOn',t.expires_on) END
   ORDER BY t.starts_on DESC) FROM public.partnership_terms t WHERE t.partner_id=p.id),'[]'::jsonb),
  'metrics',jsonb_build_object(
    'programCount',(SELECT count(DISTINCT l.program_id) FROM public.program_partner_links l WHERE l.partner_id=p.id),
    'proposalCount',(SELECT count(DISTINCT l.proposal_id) FROM public.proposal_partner_links l WHERE l.partner_id=p.id),
    'historicalVerifiedCount',(SELECT count(DISTINCT l.historical_program_id) FROM public.historical_program_partner_links l JOIN public.historical_programs h ON h.id=l.historical_program_id WHERE l.partner_id=p.id AND h.status='accepted' AND h.quality IN('complete','partial_verified')),
    'remainingNeedCount',(SELECT count(*) FROM public.partnership_need_links n JOIN public.partnership_terms t ON t.id=n.term_id WHERE t.partner_id=p.id AND n.coverage<>'addressed')),
  'timeline',CASE WHEN public.phase2_current_has_capability('partner.contact.read') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'type',e.event_type,'reason',e.reason,'occurredAt',e.occurred_at) ORDER BY e.occurred_at DESC) FROM public.partnership_events e WHERE e.partner_id=p.id),'[]'::jsonb) ELSE '[]'::jsonb END
 ) INTO result FROM public.partner_entities p WHERE p.id=p_partner_id;
 IF result IS NULL THEN RAISE EXCEPTION 'partner not found' USING ERRCODE='P0002'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'partner.detail.read','partner_entity',p_partner_id::text);
 RETURN result;
END;
$function$;

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
 IF p_payload ? 'name' AND length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'invalid partner name' USING ERRCODE='22023'; END IF;
 IF p_payload ? 'lifecycle' AND p_payload->>'lifecycle' NOT IN('active','inactive') THEN RAISE EXCEPTION 'invalid lifecycle' USING ERRCODE='22023'; END IF;
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

CREATE OR REPLACE FUNCTION public.phase2_add_partner_contact(p_partner_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; make_primary boolean; actor_email text; partner_mode text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 SELECT data_mode INTO partner_mode FROM public.partner_entities WHERE id=p_partner_id;
 PERFORM public.phase2_assert_v2_write_authority('partners',partner_mode);
 IF NOT public.phase2_current_has_capability('partner.contact.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['full_name','title','email','phone','preferred_channel','is_primary','status_email_opt_in','consent_source','consent_at','active_from','active_until']) THEN RAISE EXCEPTION 'unknown contact field' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'full_name',''))) NOT BETWEEN 1 AND 160 OR coalesce(p_payload->>'preferred_channel','manual') NOT IN('email','phone','manual') THEN RAISE EXCEPTION 'invalid contact' USING ERRCODE='22023'; END IF;
 make_primary:=coalesce((p_payload->>'is_primary')::boolean,false);
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-primary:'||p_partner_id::text,0));
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

CREATE OR REPLACE FUNCTION public.phase2_renew_partnership_term(p_partner_id uuid,p_expected_term_version integer,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE previous public.partnership_terms; new_id uuid; actor_email text; partner_mode text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 SELECT data_mode INTO partner_mode FROM public.partner_entities WHERE id=p_partner_id;
 PERFORM public.phase2_assert_v2_write_authority('partners',partner_mode);
 IF NOT public.phase2_current_has_capability('partner.renew') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['starts_on','expires_on','responsible_officer_id','agreement_document_id','agreement_exception_reason','agreement_exception_due_on']) THEN RAISE EXCEPTION 'unknown term field' USING ERRCODE='22023'; END IF;
 IF nullif(p_payload->>'agreement_exception_reason','') IS NOT NULL AND NOT public.phase2_current_has_capability('partner.policy.manage') THEN
  RAISE EXCEPTION 'only the Director may grant an agreement exception' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-term:'||p_partner_id::text,0));
 SELECT * INTO previous FROM public.partnership_terms WHERE partner_id=p_partner_id AND status IN('proposed','active','suspended') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF previous.id IS NOT NULL AND previous.row_version<>p_expected_term_version THEN RAISE EXCEPTION 'stale term version' USING ERRCODE='40001'; END IF;
 IF previous.id IS NOT NULL THEN UPDATE public.partnership_terms SET status='ended',ends_on=greatest(starts_on,(p_payload->>'starts_on')::date-1),row_version=row_version+1,updated_at=now() WHERE id=previous.id; END IF;
 INSERT INTO public.partnership_terms(partner_id,status,starts_on,expires_on,responsible_officer_id,renewed_from_id,agreement_document_id,agreement_exception_reason,agreement_exception_due_on,created_by)
 VALUES(p_partner_id,'active',(p_payload->>'starts_on')::date,nullif(p_payload->>'expires_on','')::date,(p_payload->>'responsible_officer_id')::uuid,previous.id,
  nullif(p_payload->>'agreement_document_id','')::uuid,nullif(p_payload->>'agreement_exception_reason',''),nullif(p_payload->>'agreement_exception_due_on','')::date,auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.partnership_events(partner_id,term_id,event_type,actor_id,snapshot) VALUES(p_partner_id,new_id,CASE WHEN previous.id IS NULL THEN 'term_activated' ELSE 'term_renewed' END,auth.uid(),jsonb_build_object('renewed_from_id',previous.id));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'partner.term.renew','partnership_term',new_id::text);
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_legacy_partner_mappings()
RETURNS TABLE(legacy_user_id uuid,legacy_email text,legacy_role text,org_name text,partner_id uuid,partner_name text,reconciliation_status text,responsible_officer_id uuid,proposal_count integer,program_count integer,pending_work_count integer,row_version integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 PERFORM public.phase2_assert_actor_runtime('partners');
 IF NOT public.phase2_current_has_capability('partner.legacy_mapping.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT m.legacy_user_id,u.email,u.role,u.org_name,m.partner_id,p.name,m.reconciliation_status,m.responsible_officer_id,
  (SELECT count(*)::int FROM public.project_proposals q WHERE q.created_by=m.legacy_user_id),
  (SELECT count(DISTINCT pr.id)::int FROM public.programs pr LEFT JOIN public.project_proposals q ON q.id=pr.proposal_id WHERE pr.created_by=m.legacy_user_id OR q.created_by=m.legacy_user_id),
  (SELECT count(*)::int FROM public.project_proposals q WHERE q.created_by=m.legacy_user_id AND q.status NOT IN('approved','rejected')),
  m.row_version
 FROM public.legacy_account_partner_mappings m JOIN public.users u ON u.id=m.legacy_user_id JOIN public.partner_entities p ON p.id=m.partner_id
 WHERE p.data_mode=(SELECT mode FROM public.phase2_component_runtime WHERE component='partners') ORDER BY p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_reconcile_legacy_partner_mapping(p_legacy_user_id uuid,p_partner_id uuid,p_responsible_officer_id uuid,p_expected_version integer,p_action text,p_notes text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.legacy_account_partner_mappings; next_status text; pc integer; gc integer; mapped_pc integer; mapped_gc integer; pending integer; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 IF NOT public.phase2_current_has_capability('partner.legacy_mapping.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.legacy_account_partner_mappings WHERE legacy_user_id=p_legacy_user_id FOR UPDATE;
 IF item.legacy_user_id IS NULL THEN RAISE EXCEPTION 'mapping not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale mapping version' USING ERRCODE='40001'; END IF;
 IF p_action NOT IN('start_review','approve','sign_off') OR length(btrim(coalesce(p_notes,'')))<5 THEN RAISE EXCEPTION 'invalid mapping action' USING ERRCODE='22023'; END IF;
 next_status:=CASE p_action WHEN 'start_review' THEN 'in_review' WHEN 'approve' THEN 'approved' ELSE 'suspended' END;
 IF p_action='approve' AND item.reconciliation_status<>'in_review' OR p_action='sign_off' AND item.reconciliation_status<>'approved' THEN RAISE EXCEPTION 'invalid mapping transition' USING ERRCODE='42501'; END IF;
 SELECT count(*)::int INTO pc FROM public.project_proposals WHERE created_by=p_legacy_user_id;
 SELECT count(DISTINCT pr.id)::int INTO gc FROM public.programs pr LEFT JOIN public.project_proposals q ON q.id=pr.proposal_id WHERE pr.created_by=p_legacy_user_id OR q.created_by=p_legacy_user_id;
 SELECT count(*)::int INTO pending FROM public.project_proposals WHERE created_by=p_legacy_user_id AND status NOT IN('approved','rejected');
 IF p_action='sign_off' AND pending>0 AND p_responsible_officer_id IS NULL THEN RAISE EXCEPTION 'unfinished work requires a responsible officer' USING ERRCODE='23514'; END IF;
 INSERT INTO public.proposal_partner_links(proposal_id,partner_id,partner_role,created_by)
 SELECT q.id,p_partner_id,'originating_proponent',auth.uid() FROM public.project_proposals q WHERE q.created_by=p_legacy_user_id ON CONFLICT DO NOTHING;
 INSERT INTO public.program_partner_links(program_id,partner_id,partner_role,created_by)
 SELECT DISTINCT pr.id,p_partner_id,'lead_implementer',auth.uid() FROM public.programs pr LEFT JOIN public.project_proposals q ON q.id=pr.proposal_id
 WHERE pr.created_by=p_legacy_user_id OR q.created_by=p_legacy_user_id ON CONFLICT DO NOTHING;
 SELECT count(DISTINCT l.proposal_id)::int INTO mapped_pc FROM public.proposal_partner_links l JOIN public.project_proposals q ON q.id=l.proposal_id WHERE l.partner_id=p_partner_id AND l.partner_role='originating_proponent' AND q.created_by=p_legacy_user_id;
 SELECT count(DISTINCT l.program_id)::int INTO mapped_gc FROM public.program_partner_links l JOIN public.programs pr ON pr.id=l.program_id LEFT JOIN public.project_proposals q ON q.id=pr.proposal_id WHERE l.partner_id=p_partner_id AND (pr.created_by=p_legacy_user_id OR q.created_by=p_legacy_user_id);
 IF p_action='sign_off' AND (mapped_pc<>pc OR mapped_gc<>gc) THEN RAISE EXCEPTION 'source and mapped work counts do not reconcile' USING ERRCODE='23514'; END IF;
 UPDATE public.legacy_account_partner_mappings SET partner_id=p_partner_id,responsible_officer_id=p_responsible_officer_id,reconciliation_status=next_status,
  proposal_count=pc,program_count=gc,pending_work_count=pending,notes=p_notes,row_version=row_version+1,updated_at=now(),
  approved_by=CASE WHEN p_action='approve' THEN auth.uid() ELSE approved_by END,approved_at=CASE WHEN p_action='approve' THEN now() ELSE approved_at END,
  signed_off_by=CASE WHEN p_action='sign_off' THEN auth.uid() ELSE signed_off_by END,signed_off_at=CASE WHEN p_action='sign_off' THEN now() ELSE signed_off_at END
 WHERE legacy_user_id=p_legacy_user_id;
 IF p_action='sign_off' THEN
  UPDATE public.proposal_v2_profiles v SET responsible_officer_id=p_responsible_officer_id,updated_at=now()
   FROM public.project_proposals q WHERE q.id=v.proposal_id AND q.created_by=p_legacy_user_id AND v.workflow_status NOT IN('approved','rejected');
  UPDATE public.programs pr SET phase2_responsible_officer_id=p_responsible_officer_id,updated_at=now()
   WHERE (pr.created_by=p_legacy_user_id OR EXISTS(SELECT 1 FROM public.project_proposals q WHERE q.id=pr.proposal_id AND q.created_by=p_legacy_user_id))
     AND pr.status NOT IN('completed','cancelled');
 END IF;
 IF p_action='sign_off' THEN UPDATE public.users SET status='suspended',is_active=false,updated_at=now() WHERE id=p_legacy_user_id; END IF;
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,reason,snapshot) VALUES(p_partner_id,'legacy_mapping_'||p_action,auth.uid(),p_notes,jsonb_build_object('legacy_user_id',p_legacy_user_id,'proposal_count',pc,'program_count',gc,'pending_work_count',pending));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(auth.uid(),actor_email,'partner.mapping.'||p_action,'legacy_account_partner_mapping',p_legacy_user_id::text,'warning',jsonb_build_object('partner_id',p_partner_id));
 RETURN next_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_historical_allowed_quality(p_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE h public.historical_programs; has_source boolean; complete_fields boolean;
BEGIN
 SELECT * INTO h FROM public.historical_programs WHERE id=p_id;
 IF h.id IS NULL THEN RAISE EXCEPTION 'historical program not found' USING ERRCODE='P0002'; END IF;
 has_source:=length(btrim(coalesce(h.source_notes,'')))>=5 OR EXISTS(SELECT 1 FROM public.historical_program_documents d WHERE d.historical_program_id=h.id AND d.scan_status IN('approved','risk_accepted'));
 complete_fields:=h.summary IS NOT NULL AND h.beneficiary_count IS NOT NULL AND h.budget_total IS NOT NULL AND h.outcomes IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.historical_program_partner_links l WHERE l.historical_program_id=h.id)
  AND EXISTS(SELECT 1 FROM public.historical_program_barangay_links l WHERE l.historical_program_id=h.id);
 RETURN CASE WHEN complete_fields AND has_source THEN 'complete' WHEN has_source THEN 'partial_verified' WHEN complete_fields THEN 'partial_unverified' ELSE 'unverified' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_create_historical_program(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; impl date; years_back integer; actor_email text; active_mode text; partner_value text; barangay_value text; sdg_value text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['title','summary','category','date_precision','starts_on','ends_on','beneficiary_count','volunteer_count','volunteer_hours','budget_total','currency','resources','historical_need_description','outcomes','follow_up','source_type','source_notes','partner_ids','barangay_ids','sdgs']) THEN RAISE EXCEPTION 'unknown historical field' USING ERRCODE='22023'; END IF;
 SELECT implementation_date,retrospective_years INTO impl,years_back FROM public.phase2_component_runtime WHERE component='historical_programs';
 IF impl IS NULL THEN RAISE EXCEPTION 'implementation date is not configured' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(p_payload->>'category',''))) NOT BETWEEN 1 AND 80
  OR p_payload->>'date_precision' NOT IN('exact','month','year','unknown') OR p_payload->>'source_type' NOT IN('excel','word','pdf','paper','database','other')
  OR jsonb_typeof(coalesce(p_payload->'partner_ids','[]'))<>'array' OR jsonb_typeof(coalesce(p_payload->'barangay_ids','[]'))<>'array' OR jsonb_typeof(coalesce(p_payload->'sdgs','[]'))<>'array'
 THEN RAISE EXCEPTION 'invalid historical payload' USING ERRCODE='22023'; END IF;
 IF p_payload->>'date_precision'<>'unknown' AND (nullif(p_payload->>'starts_on','')::date < impl-make_interval(years=>years_back) OR nullif(p_payload->>'starts_on','')::date >= impl) THEN RAISE EXCEPTION 'program is outside the retrospective window' USING ERRCODE='22023'; END IF;
 INSERT INTO public.historical_programs(title,summary,category,date_precision,starts_on,ends_on,beneficiary_count,volunteer_count,volunteer_hours,budget_total,currency,resources,historical_need_description,outcomes,follow_up,source_type,source_notes,created_by,data_mode)
 VALUES(btrim(p_payload->>'title'),nullif(btrim(p_payload->>'summary'),''),btrim(p_payload->>'category'),p_payload->>'date_precision',nullif(p_payload->>'starts_on','')::date,nullif(p_payload->>'ends_on','')::date,
  nullif(p_payload->>'beneficiary_count','')::int,nullif(p_payload->>'volunteer_count','')::int,nullif(p_payload->>'volunteer_hours','')::numeric,nullif(p_payload->>'budget_total','')::numeric,'PHP',
  nullif(btrim(p_payload->>'resources'),''),nullif(btrim(p_payload->>'historical_need_description'),''),nullif(btrim(p_payload->>'outcomes'),''),nullif(btrim(p_payload->>'follow_up'),''),p_payload->>'source_type',nullif(btrim(p_payload->>'source_notes'),''),auth.uid(),active_mode)
 RETURNING id INTO new_id;
 FOR partner_value IN SELECT jsonb_array_elements_text(coalesce(p_payload->'partner_ids','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.partner_entities WHERE id=partner_value::uuid AND data_mode=active_mode) THEN RAISE EXCEPTION 'historical Partner is outside the active data mode' USING ERRCODE='42501'; END IF;
  INSERT INTO public.historical_program_partner_links VALUES(new_id,partner_value::uuid);
 END LOOP;
 FOR barangay_value IN SELECT jsonb_array_elements_text(coalesce(p_payload->'barangay_ids','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=barangay_value::uuid AND b.is_synthetic_test=(active_mode='synthetic')) THEN RAISE EXCEPTION 'historical barangay is outside the active data mode' USING ERRCODE='42501'; END IF;
  INSERT INTO public.historical_program_barangay_links VALUES(new_id,barangay_value::uuid);
 END LOOP;
 FOR sdg_value IN SELECT jsonb_array_elements(coalesce(p_payload->'sdgs','[]'))::text LOOP
  IF NOT public.phase1_json_object_has_only(sdg_value::jsonb,ARRAY['number','source']) OR (sdg_value::jsonb->>'number')::int NOT BETWEEN 1 AND 17 OR sdg_value::jsonb->>'source' NOT IN('documented','retrospective') THEN RAISE EXCEPTION 'invalid historical SDG' USING ERRCODE='22023'; END IF;
  INSERT INTO public.historical_program_sdg_links(historical_program_id,sdg_number,classification_source) VALUES(new_id,(sdg_value::jsonb->>'number')::smallint,sdg_value::jsonb->>'source');
 END LOOP;
 INSERT INTO public.historical_program_events(historical_program_id,action,to_status,actor_id) VALUES(new_id,'created','draft',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_program.create','historical_program',new_id::text,jsonb_build_object('data_mode',active_mode));
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_historical_programs()
RETURNS TABLE(id uuid,code text,title text,summary text,category text,date_precision text,starts_on date,ends_on date,beneficiary_count integer,volunteer_count integer,volunteer_hours numeric,budget_total numeric,currency text,source_type text,status text,quality text,row_version integer,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users; active_mode text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 RETURN QUERY SELECT h.id,h.code,h.title,h.summary,h.category,h.date_precision,h.starts_on,h.ends_on,h.beneficiary_count,h.volunteer_count,h.volunteer_hours,h.budget_total,h.currency,h.source_type,h.status,h.quality,h.row_version,h.created_at
 FROM public.historical_programs h WHERE h.data_mode=active_mode AND (actor.role IN('paraya_director','paraya_associate','paraya_researcher') OR EXISTS(SELECT 1 FROM public.historical_program_barangay_links b WHERE b.historical_program_id=h.id AND b.barangay_id=actor.barangay_id AND h.status='accepted'))
 ORDER BY h.starts_on DESC NULLS LAST,h.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_update_historical_program(p_id uuid,p_expected_version integer,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE item public.historical_programs; active_mode text; impl date; years_back integer; snapshot jsonb; version_no integer; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs',p_id);
 IF NOT public.phase2_current_has_capability('historical_program.create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['title','summary','category','date_precision','starts_on','ends_on','beneficiary_count','volunteer_count','volunteer_hours','budget_total','resources','historical_need_description','outcomes','follow_up','source_type','source_notes']) THEN RAISE EXCEPTION 'unknown historical field' USING ERRCODE='22023'; END IF;
 SELECT * INTO item FROM public.historical_programs WHERE id=p_id FOR UPDATE;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale historical version' USING ERRCODE='40001'; END IF;
 IF item.status NOT IN('draft','returned') THEN RAISE EXCEPTION 'only draft or returned history can be corrected' USING ERRCODE='42501'; END IF;
 SELECT mode,implementation_date,retrospective_years INTO active_mode,impl,years_back FROM public.phase2_component_runtime WHERE component='historical_programs';
 UPDATE public.historical_programs SET
  title=coalesce(nullif(btrim(p_payload->>'title'),''),title),summary=CASE WHEN p_payload?'summary' THEN nullif(btrim(p_payload->>'summary'),'') ELSE summary END,
  category=coalesce(nullif(btrim(p_payload->>'category'),''),category),date_precision=coalesce(p_payload->>'date_precision',date_precision),
  starts_on=CASE WHEN p_payload?'starts_on' THEN nullif(p_payload->>'starts_on','')::date ELSE starts_on END,
  ends_on=CASE WHEN p_payload?'ends_on' THEN nullif(p_payload->>'ends_on','')::date ELSE ends_on END,
  beneficiary_count=CASE WHEN p_payload?'beneficiary_count' THEN nullif(p_payload->>'beneficiary_count','')::int ELSE beneficiary_count END,
  volunteer_count=CASE WHEN p_payload?'volunteer_count' THEN nullif(p_payload->>'volunteer_count','')::int ELSE volunteer_count END,
  volunteer_hours=CASE WHEN p_payload?'volunteer_hours' THEN nullif(p_payload->>'volunteer_hours','')::numeric ELSE volunteer_hours END,
  budget_total=CASE WHEN p_payload?'budget_total' THEN nullif(p_payload->>'budget_total','')::numeric ELSE budget_total END,
  resources=CASE WHEN p_payload?'resources' THEN nullif(btrim(p_payload->>'resources'),'') ELSE resources END,
  historical_need_description=CASE WHEN p_payload?'historical_need_description' THEN nullif(btrim(p_payload->>'historical_need_description'),'') ELSE historical_need_description END,
  outcomes=CASE WHEN p_payload?'outcomes' THEN nullif(btrim(p_payload->>'outcomes'),'') ELSE outcomes END,
  follow_up=CASE WHEN p_payload?'follow_up' THEN nullif(btrim(p_payload->>'follow_up'),'') ELSE follow_up END,
  source_type=coalesce(p_payload->>'source_type',source_type),source_notes=CASE WHEN p_payload?'source_notes' THEN nullif(btrim(p_payload->>'source_notes'),'') ELSE source_notes END,
  row_version=row_version+1,updated_at=now() WHERE id=p_id;
 IF EXISTS(SELECT 1 FROM public.historical_programs h WHERE h.id=p_id AND h.date_precision<>'unknown' AND (h.starts_on<impl-make_interval(years=>years_back) OR h.starts_on>=impl)) THEN
  RAISE EXCEPTION 'historical date is outside the configured window' USING ERRCODE='22023';
 END IF;
 SELECT to_jsonb(h)-'created_by'-'reviewed_by' INTO snapshot FROM public.historical_programs h WHERE h.id=p_id;
 SELECT coalesce(max(version_number),0)+1 INTO version_no FROM public.historical_program_versions WHERE historical_program_id=p_id;
 INSERT INTO public.historical_program_versions(historical_program_id,version_number,snapshot,canonical_hash,reason,created_by)
 VALUES(p_id,version_no,snapshot,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),'correction',auth.uid());
 INSERT INTO public.historical_program_events(historical_program_id,action,from_status,to_status,remarks,actor_id) VALUES(p_id,'corrected',item.status,item.status,'Corrected draft/returned record',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'historical_program.correct','historical_program',p_id::text);
 RETURN p_expected_version+1;
END;
$function$;

-- Rebuild historical review with target-bound runtime, date eligibility, and a
-- quality ceiling derived from fields and evidence.
CREATE OR REPLACE FUNCTION public.phase2_review_historical_program(p_id uuid,p_action text,p_expected_version integer,p_quality text DEFAULT NULL,p_remarks text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE item public.historical_programs; next_status text; allowed_quality text; snapshot jsonb; version_no integer; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs',p_id);
 SELECT * INTO item FROM public.historical_programs WHERE id=p_id FOR UPDATE;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale historical version' USING ERRCODE='40001'; END IF;
 IF p_action='submit' THEN
  IF NOT public.phase2_current_has_capability('historical_program.create') OR item.status NOT IN('draft','returned') OR item.date_precision='unknown' THEN RAISE EXCEPTION 'invalid or ineligible submit transition' USING ERRCODE='42501'; END IF; next_status:='pending_review';
 ELSIF p_action='return' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'pending_review' OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid return transition' USING ERRCODE='42501'; END IF; next_status:='returned';
 ELSIF p_action='accept' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'pending_review' OR item.date_precision='unknown' OR item.starts_on IS NULL OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid accept transition; eligible date evidence is required' USING ERRCODE='42501'; END IF;
  allowed_quality:=public.phase2_historical_allowed_quality(p_id);
  IF p_quality NOT IN('complete','partial_verified','partial_unverified','unverified')
    OR CASE p_quality WHEN 'complete' THEN 4 WHEN 'partial_verified' THEN 3 WHEN 'partial_unverified' THEN 2 ELSE 1 END
       > CASE allowed_quality WHEN 'complete' THEN 4 WHEN 'partial_verified' THEN 3 WHEN 'partial_unverified' THEN 2 ELSE 1 END
  THEN RAISE EXCEPTION 'quality exceeds the evidence-supported tier' USING ERRCODE='23514'; END IF; next_status:='accepted';
 ELSIF p_action='archive' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'accepted' OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid archive transition' USING ERRCODE='42501'; END IF; next_status:='archived';
 ELSE RAISE EXCEPTION 'unknown historical action' USING ERRCODE='22023'; END IF;
 UPDATE public.historical_programs SET status=next_status,quality=coalesce(p_quality,quality),row_version=row_version+1,
  reviewed_by=CASE WHEN p_action IN('return','accept','archive') THEN auth.uid() ELSE reviewed_by END,
  reviewed_at=CASE WHEN p_action IN('return','accept','archive') THEN now() ELSE reviewed_at END,updated_at=now() WHERE id=p_id;
 SELECT to_jsonb(h)-'created_by'-'reviewed_by' INTO snapshot FROM public.historical_programs h WHERE h.id=p_id;
 SELECT coalesce(max(version_number),0)+1 INTO version_no FROM public.historical_program_versions WHERE historical_program_id=p_id;
 INSERT INTO public.historical_program_versions(historical_program_id,version_number,snapshot,canonical_hash,reason,created_by)
 VALUES(p_id,version_no,snapshot,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),p_action,auth.uid());
 INSERT INTO public.historical_program_events(historical_program_id,action,from_status,to_status,quality,remarks,actor_id) VALUES(p_id,p_action,item.status,next_status,p_quality,p_remarks,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_program.'||p_action,'historical_program',p_id::text,jsonb_build_object('from',item.status,'to',next_status));
END;
$function$;

-- Cron-safe generator: service_role does not impersonate an application user.
-- It observes component mode, keeps synthetic/live data separate, and uses
-- conflict-safe inserts for catch-up reminders.
CREATE OR REPLACE FUNCTION public.phase2_generate_renewal_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item record; recipient uuid; contact public.partner_contacts; notification uuid; outbox uuid; key text; created_count integer:=0; partner_mode text; external_mode text;
BEGIN
 SELECT mode INTO partner_mode FROM public.phase2_component_runtime WHERE component='partners';
 SELECT mode INTO external_mode FROM public.phase2_component_runtime WHERE component='external_contact_email';
 IF partner_mode IS NULL OR partner_mode='off' THEN RETURN 0; END IF;
 FOR item IN
  SELECT t.id term_id,t.partner_id,t.expires_on,t.responsible_officer_id,p.name,d.threshold
  FROM public.partnership_terms t JOIN public.partner_entities p ON p.id=t.partner_id
  CROSS JOIN LATERAL(SELECT min(v) threshold FROM unnest(ARRAY[60,30,7]) v WHERE t.expires_on-current_date<=v) d
  WHERE t.status='active' AND t.expires_on>=current_date AND t.expires_on<=current_date+60 AND p.data_mode=partner_mode AND d.threshold IS NOT NULL
 LOOP
  FOR recipient IN SELECT DISTINCT id FROM public.users WHERE status='active' AND is_active IS TRUE AND (id=item.responsible_officer_id OR role='paraya_director') LOOP
   key:=item.term_id||':'||item.expires_on||':'||item.threshold||':'||recipient||':in_app';
   INSERT INTO public.partnership_reminder_deliveries(term_id,threshold_days,recipient_user_id,channel,delivery_key)
   VALUES(item.term_id,item.threshold,recipient,'in_app',key) ON CONFLICT(delivery_key) DO NOTHING RETURNING id INTO notification;
   IF notification IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,type,title,message,action_url,is_read) VALUES(recipient,'reminder','Partnership renewal due',item.name||' expires in '||(item.expires_on-current_date)||' days.','/officer/phase-2',false) RETURNING id INTO outbox;
    UPDATE public.partnership_reminder_deliveries SET notification_id=outbox WHERE id=notification; created_count:=created_count+1;
   END IF;
  END LOOP;
  SELECT * INTO contact FROM public.partner_contacts WHERE partner_id=item.partner_id AND is_primary AND status_email_opt_in
   AND active_from<=current_date AND (active_until IS NULL OR active_until>=current_date) ORDER BY created_at DESC LIMIT 1;
  IF contact.id IS NOT NULL THEN
   key:=item.term_id||':'||item.expires_on||':'||item.threshold||':'||contact.id||':external_email';
   INSERT INTO public.partner_contact_email_outbox(contact_id,template_key,template_version,payload,idempotency_key,status)
   VALUES(contact.id,'partnership_renewal',1,jsonb_build_object('partner_name',item.name,'expires_on',item.expires_on,'days',item.expires_on-current_date),key,CASE WHEN external_mode=partner_mode THEN 'queued' ELSE 'suppressed' END)
   ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO outbox;
   IF outbox IS NOT NULL THEN
    INSERT INTO public.partnership_reminder_deliveries(term_id,threshold_days,contact_id,channel,delivery_key,outbox_id)
    VALUES(item.term_id,item.threshold,contact.id,'external_email',key,outbox) ON CONFLICT(delivery_key) DO NOTHING;
    created_count:=created_count+1;
   END IF;
  END IF;
 END LOOP;
 RETURN created_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_requeue_contact_email(p_outbox_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.partner_contact_email_outbox; contact public.partner_contacts; external_mode text;
BEGIN
 IF NOT public.phase2_current_has_capability('partnership.manage') OR length(btrim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'forbidden or missing reason' USING ERRCODE='42501'; END IF;
 SELECT mode INTO external_mode FROM public.phase2_component_runtime WHERE component='external_contact_email';
 IF external_mode NOT IN('synthetic','live') THEN RAISE EXCEPTION 'external contact email is off' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.partner_contact_email_outbox WHERE id=p_outbox_id FOR UPDATE;
 SELECT * INTO contact FROM public.partner_contacts WHERE id=item.contact_id;
 IF item.id IS NULL OR item.status NOT IN('suppressed','failed') OR NOT contact.status_email_opt_in OR contact.email IS NULL OR contact.active_from>current_date OR (contact.active_until IS NOT NULL AND contact.active_until<current_date) THEN RAISE EXCEPTION 'message is not eligible for explicit requeue' USING ERRCODE='23514'; END IF;
 UPDATE public.partner_contact_email_outbox SET status='queued',attempt_count=0,next_attempt_at=now(),last_error=NULL,claimed_at=NULL,lease_expires_at=NULL WHERE id=item.id;
 INSERT INTO public.partner_contact_email_events(outbox_id,from_status,to_status,attempt_number,error_code) VALUES(item.id,item.status,'queued',0,'manual_requeue');
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),'partner.contact_email.requeue','partner_contact_email_outbox',item.id::text,jsonb_build_object('reason',p_reason));
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_list_partners() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_create_partner(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_partner(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_update_partner(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_add_partner_contact(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_renew_partnership_term(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_legacy_partner_mappings() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_reconcile_legacy_partner_mapping(uuid,uuid,uuid,integer,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_historical_allowed_quality(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_create_historical_program(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_historical_programs() FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION public.phase2_get_historical_program(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs',p_id);
 IF NOT public.phase2_current_has_capability('historical_program.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(h)-'created_by'-'reviewed_by'||jsonb_build_object(
  'partners',coalesce((SELECT jsonb_agg(l.partner_id) FROM public.historical_program_partner_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'barangays',coalesce((SELECT jsonb_agg(l.barangay_id) FROM public.historical_program_barangay_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'sdgs',coalesce((SELECT jsonb_agg(jsonb_build_object('number',s.sdg_number,'source',s.classification_source) ORDER BY s.sdg_number) FROM public.historical_program_sdg_links s WHERE s.historical_program_id=h.id),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'fromStatus',e.from_status,'toStatus',e.to_status,'remarks',e.remarks,'occurredAt',e.created_at) ORDER BY e.created_at) FROM public.historical_program_events e WHERE e.historical_program_id=h.id),'[]'::jsonb)
 ) INTO result FROM public.historical_programs h WHERE h.id=p_id;
 IF result IS NULL THEN RAISE EXCEPTION 'historical program not found' USING ERRCODE='P0002'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'historical_program.read','historical_program',p_id::text);
 RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.phase2_get_historical_program(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_get_historical_program(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.phase2_update_historical_program(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_review_historical_program(uuid,text,integer,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_generate_renewal_reminders() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_requeue_contact_email(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_list_partners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_create_partner(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_partner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_update_partner(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_add_partner_contact(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_renew_partnership_term(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_legacy_partner_mappings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_reconcile_legacy_partner_mapping(uuid,uuid,uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_create_historical_program(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_historical_programs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_update_historical_program(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_review_historical_program(uuid,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_generate_renewal_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.phase2_requeue_contact_email(uuid,text) TO authenticated;

COMMIT;
