-- Corrections found by the executable Phase 2 release-gate audit. This
-- migration remains dark: every component finishes off and V1 remains the
-- mutation authority.
BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Captain and Secretary receive only their barangay-scoped historical
-- aggregate contract. Detail/list functions still require an operational
-- historical capability in addition to this read capability.
CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT public.phase1_role_has_capability(p_role,p_capability) OR CASE
  WHEN p_role='paraya_director' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.category.manage'])
  WHEN p_role='paraya_associate' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','proposal.submit','proposal.handoff','budget.read','budget.prepare','budget.actual.record'])
  WHEN p_role='paraya_researcher' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.actual.record'])
  WHEN p_role='finance_officer' THEN p_capability=ANY(ARRAY['budget.read','budget.review','budget.liquidation.review'])
  WHEN p_role IN('barangay_captain','barangay_secretary') THEN p_capability='historical_program.read'
  ELSE false END;
$function$;

-- A retry of the same renewal request must not renew the successor created by
-- the first request. The requested start must strictly follow the currently
-- open term's start, and external agreements are bound to this Partner and an
-- accepted document state (or a Director exception).
CREATE OR REPLACE FUNCTION public.phase2_renew_partnership_term(p_partner_id uuid,p_expected_term_version integer,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE previous public.partnership_terms; partner public.partner_entities; document public.partnership_documents;
DECLARE new_id uuid; actor_email text; requested_start date; requested_expiry date; document_id uuid;
BEGIN
 PERFORM public.phase2_assert_runtime('partners',p_partner_id);
 SELECT * INTO partner FROM public.partner_entities WHERE id=p_partner_id AND lifecycle<>'merged';
 PERFORM public.phase2_assert_v2_write_authority('partners',partner.data_mode);
 IF NOT public.phase2_current_has_capability('partner.renew') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['starts_on','expires_on','responsible_officer_id','agreement_document_id','agreement_exception_reason','agreement_exception_due_on']) THEN
  RAISE EXCEPTION 'unknown term field' USING ERRCODE='22023';
 END IF;
 requested_start:=nullif(p_payload->>'starts_on','')::date;
 requested_expiry:=nullif(p_payload->>'expires_on','')::date;
 document_id:=nullif(p_payload->>'agreement_document_id','')::uuid;
 IF requested_start IS NULL OR (requested_expiry IS NOT NULL AND requested_expiry<requested_start) THEN
  RAISE EXCEPTION 'invalid renewal dates' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=nullif(p_payload->>'responsible_officer_id','')::uuid
   AND u.status='active' AND u.is_active AND u.role IN('paraya_director','paraya_associate','paraya_researcher')) THEN
  RAISE EXCEPTION 'responsible officer is invalid' USING ERRCODE='23514';
 END IF;
 IF nullif(p_payload->>'agreement_exception_reason','') IS NOT NULL
    AND NOT public.phase2_current_has_capability('partner.policy.manage') THEN
  RAISE EXCEPTION 'only the Director may grant an agreement exception' USING ERRCODE='42501';
 END IF;
 IF document_id IS NOT NULL THEN
  SELECT * INTO document FROM public.partnership_documents d WHERE d.id=document_id AND d.partner_id=p_partner_id;
  IF document.id IS NULL OR document.scan_status NOT IN('approved','risk_accepted')
     OR document.effective_on IS NOT NULL AND document.effective_on>requested_start
     OR document.expires_on IS NOT NULL AND document.expires_on<requested_start THEN
    RAISE EXCEPTION 'agreement document is not valid for this renewal' USING ERRCODE='23514';
  END IF;
 END IF;
 IF partner.classification='external' AND document_id IS NULL
    AND nullif(btrim(p_payload->>'agreement_exception_reason'),'') IS NULL THEN
  RAISE EXCEPTION 'external relationship requires an accepted agreement or Director exception' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('partner-term:'||p_partner_id::text,0));
 SELECT * INTO previous FROM public.partnership_terms
  WHERE partner_id=p_partner_id AND status IN('proposed','active','suspended')
  ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF previous.id IS NOT NULL AND previous.row_version<>p_expected_term_version THEN
  RAISE EXCEPTION 'stale term version' USING ERRCODE='40001';
 END IF;
 IF previous.id IS NOT NULL AND requested_start<=previous.starts_on THEN
  RAISE EXCEPTION 'stale renewal predecessor' USING ERRCODE='40001';
 END IF;
 IF previous.id IS NOT NULL THEN
  UPDATE public.partnership_terms SET status='ended',ends_on=greatest(starts_on,requested_start-1),
   row_version=row_version+1,updated_at=now() WHERE id=previous.id;
 END IF;
 INSERT INTO public.partnership_terms(partner_id,status,starts_on,expires_on,responsible_officer_id,renewed_from_id,
  agreement_document_id,agreement_exception_reason,agreement_exception_due_on,created_by)
 VALUES(p_partner_id,'active',requested_start,requested_expiry,(p_payload->>'responsible_officer_id')::uuid,previous.id,
  document_id,nullif(btrim(p_payload->>'agreement_exception_reason'),''),nullif(p_payload->>'agreement_exception_due_on','')::date,auth.uid())
 RETURNING id INTO new_id;
 INSERT INTO public.partnership_events(partner_id,term_id,event_type,actor_id,snapshot)
 VALUES(p_partner_id,new_id,CASE WHEN previous.id IS NULL THEN 'term_activated' ELSE 'term_renewed' END,auth.uid(),
  jsonb_build_object('renewed_from_id',previous.id,'starts_on',requested_start,'expires_on',requested_expiry));
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id)
 VALUES(auth.uid(),actor_email,'partner.term.renew','partnership_term',new_id::text);
 RETURN new_id;
END;
$function$;

-- Service reminders are mode and synthetic-root allowlist bound. Notifications
-- are created under the same advisory lock and inserted into the immutable
-- delivery row in one step, avoiding orphan notifications and forbidden
-- post-insert delivery updates.
CREATE OR REPLACE FUNCTION public.phase2_generate_renewal_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item record; recipient uuid; contact public.partner_contacts; notification_id uuid; outbox_id uuid; delivery_id uuid;
DECLARE reminder_key text; created_count integer:=0; partner_mode text; external_mode text;
DECLARE partner_entities uuid[]; external_entities uuid[];
BEGIN
 SELECT mode,synthetic_entity_ids INTO partner_mode,partner_entities FROM public.phase2_component_runtime WHERE component='partners';
 SELECT mode,synthetic_entity_ids INTO external_mode,external_entities FROM public.phase2_component_runtime WHERE component='external_contact_email';
 IF partner_mode IS NULL OR partner_mode='off' THEN RETURN 0; END IF;
 FOR item IN
  SELECT t.id term_id,t.partner_id,t.expires_on,t.responsible_officer_id,p.name,d.threshold
  FROM public.partnership_terms t JOIN public.partner_entities p ON p.id=t.partner_id
  CROSS JOIN LATERAL(SELECT min(v) threshold FROM unnest(ARRAY[60,30,7]) v WHERE t.expires_on-current_date<=v) d
  WHERE t.status='active' AND t.expires_on BETWEEN current_date AND current_date+60 AND p.data_mode=partner_mode
    AND (partner_mode<>'synthetic' OR p.id=ANY(coalesce(partner_entities,'{}'))) AND d.threshold IS NOT NULL
 LOOP
  FOR recipient IN SELECT DISTINCT u.id FROM public.users u WHERE u.status='active' AND u.is_active
    AND (u.id=item.responsible_officer_id OR u.role='paraya_director')
    AND (partner_mode<>'synthetic' OR u.is_synthetic_test)
  LOOP
   reminder_key:=item.term_id||':'||item.expires_on||':'||item.threshold||':'||recipient||':in_app';
   PERFORM pg_advisory_xact_lock(hashtextextended('phase2-reminder:'||reminder_key,0));
   IF NOT EXISTS(SELECT 1 FROM public.partnership_reminder_deliveries d WHERE d.delivery_key=reminder_key) THEN
    INSERT INTO public.notifications(user_id,type,title,message,is_read)
    VALUES(recipient,'reminder','Partnership renewal due',item.name||' expires in '||(item.expires_on-current_date)||' days.',false)
    RETURNING id INTO notification_id;
    INSERT INTO public.partnership_reminder_deliveries(term_id,threshold_days,recipient_user_id,channel,delivery_key,notification_id)
    VALUES(item.term_id,item.threshold,recipient,'in_app',reminder_key,notification_id);
    created_count:=created_count+1;
   END IF;
  END LOOP;
  SELECT * INTO contact FROM public.partner_contacts c WHERE c.partner_id=item.partner_id AND c.is_primary AND c.status_email_opt_in
   AND c.email IS NOT NULL AND c.active_from<=current_date AND (c.active_until IS NULL OR c.active_until>=current_date)
   ORDER BY c.created_at DESC,c.id DESC LIMIT 1;
  IF contact.id IS NOT NULL THEN
   reminder_key:=item.term_id||':'||item.expires_on||':'||item.threshold||':'||contact.id||':external_email';
   PERFORM pg_advisory_xact_lock(hashtextextended('phase2-reminder:'||reminder_key,0));
  IF NOT EXISTS(SELECT 1 FROM public.partnership_reminder_deliveries d WHERE d.delivery_key=reminder_key) THEN
    outbox_id:=NULL; delivery_id:=NULL;
    INSERT INTO public.partner_contact_email_outbox(contact_id,template_key,template_version,payload,idempotency_key,status)
    VALUES(contact.id,'partnership_renewal',1,jsonb_build_object('partnerCode',(SELECT code FROM public.partner_entities WHERE id=item.partner_id),
      'expiresOn',item.expires_on,'days',item.expires_on-current_date),reminder_key,
      CASE WHEN external_mode=partner_mode AND (partner_mode<>'synthetic' OR item.partner_id=ANY(coalesce(external_entities,'{}'))) THEN 'queued' ELSE 'suppressed' END)
    ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO outbox_id;
    IF outbox_id IS NULL THEN SELECT id INTO outbox_id FROM public.partner_contact_email_outbox WHERE idempotency_key=reminder_key; END IF;
    INSERT INTO public.partnership_reminder_deliveries(term_id,threshold_days,contact_id,channel,delivery_key,outbox_id)
    VALUES(item.term_id,item.threshold,contact.id,'external_email',reminder_key,outbox_id) RETURNING id INTO delivery_id;
    IF delivery_id IS NOT NULL THEN created_count:=created_count+1; END IF;
   END IF;
  END IF;
 END LOOP;
 RETURN created_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_requeue_contact_email(p_outbox_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.partner_contact_email_outbox; contact public.partner_contacts; partner_id uuid; active_mode text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('external_contact_email');
 IF NOT public.phase2_current_has_capability('partnership.manage') OR length(btrim(coalesce(p_reason,'')))<10 THEN
  RAISE EXCEPTION 'forbidden or missing reason' USING ERRCODE='42501';
 END IF;
 SELECT * INTO item FROM public.partner_contact_email_outbox WHERE id=p_outbox_id FOR UPDATE;
 SELECT c.* INTO contact FROM public.partner_contacts c WHERE c.id=item.contact_id;
 partner_id:=contact.partner_id;
 IF item.id IS NULL OR contact.id IS NULL THEN RAISE EXCEPTION 'message not found' USING ERRCODE='P0002'; END IF;
 PERFORM public.phase2_assert_runtime('external_contact_email',partner_id);
 IF active_mode IS DISTINCT FROM public.phase2_component_entity_mode('external_contact_email',partner_id)
    OR item.status NOT IN('suppressed','failed') OR NOT contact.status_email_opt_in OR contact.email IS NULL
    OR contact.active_from>current_date OR (contact.active_until IS NOT NULL AND contact.active_until<current_date) THEN
  RAISE EXCEPTION 'message is not eligible for explicit requeue' USING ERRCODE='23514';
 END IF;
 UPDATE public.partner_contact_email_outbox SET status='queued',attempt_count=0,next_attempt_at=now(),last_error=NULL,
  claimed_at=NULL,lease_expires_at=NULL,claim_token=NULL WHERE id=item.id;
 INSERT INTO public.partner_contact_email_events(outbox_id,from_status,to_status,attempt_number,error_code)
 VALUES(item.id,item.status,'queued',0,'manual_requeue');
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'partner.contact_email.requeue','partner_contact_email_outbox',item.id::text,
  jsonb_build_object('reason',p_reason,'partner_id',partner_id,'data_mode',active_mode));
END;
$function$;

-- Qualify the actor lookup because the RETURNS TABLE output column named id is
-- also a PL/pgSQL variable and otherwise makes the query ambiguous.
CREATE OR REPLACE FUNCTION public.phase2_list_historical_programs()
RETURNS TABLE(id uuid,code text,title text,summary text,category text,date_precision text,starts_on date,ends_on date,beneficiary_count integer,volunteer_count integer,volunteer_hours numeric,budget_total numeric,currency text,source_type text,status text,quality text,row_version integer,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.read') OR NOT (public.phase2_current_has_capability('historical_program.create') OR public.phase2_current_has_capability('historical_program.import') OR public.phase2_current_has_capability('historical_program.review')) THEN RAISE EXCEPTION 'aggregate-only historical access' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT h.id,h.code,h.title,h.summary,h.category,h.date_precision,h.starts_on,h.ends_on,h.beneficiary_count,h.volunteer_count,h.volunteer_hours,h.budget_total,h.currency,h.source_type,h.status,h.quality,h.row_version,h.created_at
 FROM public.historical_programs h WHERE h.data_mode=active_mode ORDER BY h.starts_on DESC NULLS LAST,h.created_at DESC;
 SELECT u.email INTO actor_email FROM public.users u WHERE u.id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,metadata) VALUES(auth.uid(),actor_email,'historical_program.list','historical_program',jsonb_build_object('data_mode',active_mode));
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_role_has_capability(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_renew_partnership_term(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_generate_renewal_reminders() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_requeue_contact_email(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_historical_programs() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_renew_partnership_term(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_generate_renewal_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.phase2_requeue_contact_email(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_historical_programs() TO authenticated;

UPDATE public.phase2_component_runtime SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state SET write_authority='v1',reconciliation_hash=NULL,reconciled_at=NULL,changed_at=now();

COMMIT;
