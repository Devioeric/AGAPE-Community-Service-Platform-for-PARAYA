-- Phase 2 Packet 16: private-document review, atomic worker leases, and
-- allowlisted operational selectors. Forward-only and disabled by default.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.partner_contact_email_outbox') IS NULL
     OR to_regclass('public.program_budget_revisions') IS NULL
     OR to_regprocedure('public.phase2_assert_runtime(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Packet 16 requires the complete Phase 2 chain through 20260818000880';
  END IF;
END;
$preflight$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE public.partner_contact_email_outbox
  ADD COLUMN IF NOT EXISTS claim_token uuid;
CREATE INDEX IF NOT EXISTS partner_contact_email_claim_queue
  ON public.partner_contact_email_outbox(status,next_attempt_at,created_at)
  WHERE status IN ('queued','sending');

DO $documents$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'partnership_documents','historical_program_documents',
    'proposal_budget_documents','program_financial_documents'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id)',table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reviewed_at timestamptz',table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS review_reason text',table_name);
  END LOOP;
END;
$documents$;

CREATE OR REPLACE FUNCTION public.phase2_document_parent(p_kind text,p_document_id uuid)
RETURNS TABLE(component text,parent_id uuid,scan_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF p_kind='partnership' THEN
    RETURN QUERY SELECT 'partners'::text,d.partner_id,d.scan_status FROM public.partnership_documents d WHERE d.id=p_document_id;
  ELSIF p_kind='historical' THEN
    RETURN QUERY SELECT 'historical_programs'::text,d.historical_program_id,d.scan_status FROM public.historical_program_documents d WHERE d.id=p_document_id;
  ELSIF p_kind='proposal_budget' THEN
    RETURN QUERY SELECT 'proposals'::text,r.proposal_id,d.scan_status FROM public.proposal_budget_documents d JOIN public.proposal_budget_revisions r ON r.id=d.revision_id WHERE d.id=p_document_id;
  ELSIF p_kind='program_finance' THEN
    RETURN QUERY SELECT 'program_finance'::text,d.program_id,d.scan_status FROM public.program_financial_documents d WHERE d.id=p_document_id;
  ELSE
    RAISE EXCEPTION 'unknown document kind' USING ERRCODE='22023';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_review_document(p_kind text,p_document_id uuid,p_decision text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE target record; changed integer; next_status text; actor_email text;
BEGIN
  SELECT * INTO target FROM public.phase2_document_parent(p_kind,p_document_id);
  IF target.parent_id IS NULL THEN RAISE EXCEPTION 'document not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase2_assert_runtime(target.component,target.parent_id);
  IF NOT public.phase2_current_has_capability('partner.policy.manage') THEN RAISE EXCEPTION 'Director document review is required' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN('approve','reject') OR length(btrim(coalesce(p_reason,'')))<5
     OR (p_decision='reject' AND length(btrim(p_reason))<10) THEN
    RAISE EXCEPTION 'a valid document decision and reason are required' USING ERRCODE='22023';
  END IF;
  next_status:=CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  IF p_kind='partnership' THEN
    UPDATE public.partnership_documents SET scan_status=next_status,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
      WHERE id=p_document_id AND partner_id=target.parent_id AND scan_status='quarantined';
  ELSIF p_kind='historical' THEN
    UPDATE public.historical_program_documents SET scan_status=next_status,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
      WHERE id=p_document_id AND historical_program_id=target.parent_id AND scan_status='quarantined';
  ELSIF p_kind='proposal_budget' THEN
    UPDATE public.proposal_budget_documents d SET scan_status=next_status,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
      FROM public.proposal_budget_revisions r WHERE d.id=p_document_id AND r.id=d.revision_id AND r.proposal_id=target.parent_id AND d.scan_status='quarantined';
  ELSE
    UPDATE public.program_financial_documents SET scan_status=next_status,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
      WHERE id=p_document_id AND program_id=target.parent_id AND scan_status='quarantined';
  END IF;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'document is already reviewed' USING ERRCODE='40001'; END IF;
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata)
  VALUES(auth.uid(),actor_email,'phase2.document.'||p_decision,p_kind,p_document_id::text,
    jsonb_build_object('parent_id',target.parent_id,'component',target.component,'reason',btrim(p_reason)));
  RETURN jsonb_build_object('id',p_document_id,'scanStatus',next_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_accept_document_risk(p_kind text,p_document_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE target record; changed integer; actor_email text;
BEGIN
  SELECT * INTO target FROM public.phase2_document_parent(p_kind,p_document_id);
  IF target.parent_id IS NULL THEN RAISE EXCEPTION 'document not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase2_assert_runtime(target.component,target.parent_id);
  IF NOT public.phase2_current_has_capability('partner.policy.manage') OR length(btrim(coalesce(p_reason,'')))<20 THEN
    RAISE EXCEPTION 'Director risk acceptance and a detailed reason are required' USING ERRCODE='42501';
  END IF;
  IF p_kind='partnership' THEN
    UPDATE public.partnership_documents SET scan_status='risk_accepted',reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
      WHERE id=p_document_id AND partner_id=target.parent_id AND scan_status='quarantined';
  ELSIF p_kind='historical' THEN
    UPDATE public.historical_program_documents SET scan_status='risk_accepted',reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
      WHERE id=p_document_id AND historical_program_id=target.parent_id AND scan_status='quarantined';
  ELSIF p_kind='proposal_budget' THEN
    UPDATE public.proposal_budget_documents d SET scan_status='risk_accepted',reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
      FROM public.proposal_budget_revisions r WHERE d.id=p_document_id AND r.id=d.revision_id AND r.proposal_id=target.parent_id AND d.scan_status='quarantined';
  ELSE
    UPDATE public.program_financial_documents SET scan_status='risk_accepted',reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason)
      WHERE id=p_document_id AND program_id=target.parent_id AND scan_status='quarantined';
  END IF;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'document is already reviewed' USING ERRCODE='40001'; END IF;
  SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  VALUES(auth.uid(),actor_email,'phase2.document.risk_accept',p_kind,p_document_id::text,'warning',
    jsonb_build_object('parent_id',target.parent_id,'component',target.component,'reason',btrim(p_reason)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_documents(p_kind text,p_parent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE component text; allowed boolean:=false; result jsonb;
BEGIN
  component:=CASE p_kind WHEN 'partnership' THEN 'partners' WHEN 'historical' THEN 'historical_programs'
    WHEN 'proposal_budget' THEN 'proposals' WHEN 'program_finance' THEN 'program_finance' ELSE NULL END;
  IF component IS NULL THEN RAISE EXCEPTION 'unknown document kind' USING ERRCODE='22023'; END IF;
  PERFORM public.phase2_assert_runtime(component,p_parent_id);
  allowed:=CASE p_kind WHEN 'partnership' THEN public.phase2_current_has_capability('partner.document.read')
    WHEN 'historical' THEN public.phase2_current_has_capability('historical_program.read')
    ELSE public.phase2_current_has_capability('budget.read') END;
  IF NOT allowed THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_kind='partnership' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'name',d.original_name,'mimeType',d.mime_type,
      'sizeBytes',d.size_bytes,'scanStatus',d.scan_status,'visibility',d.visibility,'effectiveOn',d.effective_on,'expiresOn',d.expires_on,
      'reviewedAt',d.reviewed_at,'createdAt',d.created_at) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO result
      FROM public.partnership_documents d WHERE d.partner_id=p_parent_id;
  ELSIF p_kind='historical' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type','source_evidence','name',d.original_name,'mimeType',d.mime_type,
      'sizeBytes',d.size_bytes,'scanStatus',d.scan_status,'reviewedAt',d.reviewed_at,'createdAt',d.created_at) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO result
      FROM public.historical_program_documents d WHERE d.historical_program_id=p_parent_id;
  ELSIF p_kind='proposal_budget' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'name',d.original_name,'mimeType',d.mime_type,
      'sizeBytes',d.size_bytes,'scanStatus',d.scan_status,'reviewedAt',d.reviewed_at,'createdAt',d.created_at) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO result
      FROM public.proposal_budget_documents d JOIN public.proposal_budget_revisions r ON r.id=d.revision_id WHERE r.proposal_id=p_parent_id;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'name',d.original_name,'mimeType',d.mime_type,
      'sizeBytes',d.size_bytes,'scanStatus',d.scan_status,'reviewedAt',d.reviewed_at,'createdAt',d.created_at) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO result
      FROM public.program_financial_documents d WHERE d.program_id=p_parent_id;
  END IF;
  INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
  VALUES(auth.uid(),'phase2.document.list',p_kind,p_parent_id::text,jsonb_build_object('count',jsonb_array_length(result)));
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_claim_contact_email_outbox(p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE partner_mode text; email_mode text; result jsonb; recovered record; now_at timestamptz:=clock_timestamp();
BEGIN
  IF p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 60 AND 900 THEN RAISE EXCEPTION 'invalid claim bounds' USING ERRCODE='22023'; END IF;
  SELECT mode INTO partner_mode FROM public.phase2_component_runtime WHERE component='partners';
  SELECT mode INTO email_mode FROM public.phase2_component_runtime WHERE component='external_contact_email';
  IF partner_mode IS NULL OR email_mode IS NULL OR partner_mode='off' OR email_mode='off' OR partner_mode<>email_mode THEN RETURN '[]'::jsonb; END IF;

  FOR recovered IN
    UPDATE public.partner_contact_email_outbox o SET status='queued',claim_token=NULL,claimed_at=NULL,lease_expires_at=NULL,next_attempt_at=now_at
    FROM public.partner_contacts c JOIN public.partner_entities p ON p.id=c.partner_id
    WHERE o.contact_id=c.id AND p.data_mode=email_mode AND o.status='sending' AND o.lease_expires_at<now_at
    RETURNING o.id,o.attempt_count
  LOOP
    INSERT INTO public.partner_contact_email_events(outbox_id,from_status,to_status,attempt_number,error_code)
    VALUES(recovered.id,'sending','queued',recovered.attempt_count,'lease_recovered');
  END LOOP;

  WITH ineligible AS (
    UPDATE public.partner_contact_email_outbox o SET status='cancelled',claim_token=NULL,claimed_at=NULL,lease_expires_at=NULL,last_error='contact_not_eligible'
    FROM public.partner_contacts c JOIN public.partner_entities p ON p.id=c.partner_id
    WHERE o.contact_id=c.id AND p.data_mode=email_mode AND o.status='queued'
      AND (c.email IS NULL OR NOT c.status_email_opt_in OR c.active_from>current_date OR (c.active_until IS NOT NULL AND c.active_until<current_date))
    RETURNING o.id,o.attempt_count
  )
  INSERT INTO public.partner_contact_email_events(outbox_id,from_status,to_status,attempt_number,error_code)
  SELECT id,'queued','cancelled',attempt_count,'contact_not_eligible' FROM ineligible;

  WITH candidates AS (
    SELECT o.id FROM public.partner_contact_email_outbox o
    JOIN public.partner_contacts c ON c.id=o.contact_id JOIN public.partner_entities p ON p.id=c.partner_id
    WHERE p.data_mode=email_mode AND o.status='queued' AND (o.next_attempt_at IS NULL OR o.next_attempt_at<=now_at)
      AND c.email IS NOT NULL AND c.status_email_opt_in AND c.active_from<=current_date AND (c.active_until IS NULL OR c.active_until>=current_date)
    ORDER BY o.created_at,o.id FOR UPDATE OF o SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.partner_contact_email_outbox o SET status='sending',claim_token=gen_random_uuid(),claimed_at=now_at,
      lease_expires_at=now_at+make_interval(secs=>p_lease_seconds)
    FROM candidates q WHERE o.id=q.id
    RETURNING o.id,o.contact_id,o.template_key,o.template_version,o.payload,o.attempt_count,o.claim_token
  ), events AS (
    INSERT INTO public.partner_contact_email_events(outbox_id,from_status,to_status,attempt_number,error_code)
    SELECT id,'queued','sending',attempt_count+1,'worker_claim' FROM claimed RETURNING outbox_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'claimToken',c.claim_token,'templateKey',c.template_key,
    'templateVersion',c.template_version,'payload',c.payload,'attemptNumber',c.attempt_count+1,'contactEmail',pc.email)
    ORDER BY c.id),'[]'::jsonb) INTO result
  FROM claimed c JOIN public.partner_contacts pc ON pc.id=c.contact_id JOIN events e ON e.outbox_id=c.id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_finalize_contact_email(p_outbox_id uuid,p_claim_token uuid,p_outcome text,p_error_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.partner_contact_email_outbox; next_status text; attempts integer; retry_at timestamptz;
BEGIN
  IF p_outcome NOT IN('sent','retry','failed','cancelled') OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_:-]{1,80}$') THEN
    RAISE EXCEPTION 'invalid delivery outcome' USING ERRCODE='22023';
  END IF;
  SELECT * INTO item FROM public.partner_contact_email_outbox WHERE id=p_outbox_id FOR UPDATE;
  IF item.id IS NULL OR item.status<>'sending' OR item.claim_token IS DISTINCT FROM p_claim_token OR item.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'delivery lease is missing, stale, or expired' USING ERRCODE='40001';
  END IF;
  attempts:=item.attempt_count+1;
  next_status:=CASE p_outcome WHEN 'retry' THEN CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END ELSE p_outcome END;
  retry_at:=CASE WHEN next_status='queued' THEN clock_timestamp()+make_interval(secs=>least(86400,(power(2,attempts)::integer)*3600)) ELSE NULL END;
  UPDATE public.partner_contact_email_outbox SET status=next_status,attempt_count=attempts,next_attempt_at=retry_at,
    last_error=CASE WHEN next_status='sent' THEN NULL ELSE coalesce(p_error_code,'delivery_failed') END,
    sent_at=CASE WHEN next_status='sent' THEN clock_timestamp() ELSE sent_at END,
    claim_token=NULL,claimed_at=NULL,lease_expires_at=NULL WHERE id=item.id;
  INSERT INTO public.partner_contact_email_events(outbox_id,from_status,to_status,attempt_number,error_code)
  VALUES(item.id,'sending',next_status,attempts,CASE WHEN next_status='sent' THEN NULL ELSE coalesce(p_error_code,'delivery_failed') END);
  RETURN jsonb_build_object('id',item.id,'status',next_status,'attemptCount',attempts,'nextAttemptAt',retry_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_program_finance_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; result jsonb;
BEGIN
  active_mode:=public.phase2_assert_actor_runtime('program_finance');
  IF NOT public.phase2_current_has_capability('budget.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'status',p.status,'dataMode',p.phase2_data_mode,
    'responsibleOfficerId',p.phase2_responsible_officer_id,'allocationStatus',r.status,'allocationRevision',r.revision_number,
    'cashTotal',coalesce(r.cash_total,0)::text,'inKindTotal',coalesce(r.in_kind_total,0)::text)
    ORDER BY p.updated_at DESC,p.id),'[]'::jsonb) INTO result
  FROM public.programs p LEFT JOIN LATERAL(SELECT b.status,b.revision_number,b.cash_total,b.in_kind_total
    FROM public.program_budget_revisions b WHERE b.program_id=p.id ORDER BY b.revision_number DESC LIMIT 1) r ON true
  WHERE p.phase2_data_mode=active_mode AND p.project_proposal_id IS NOT NULL;
  INSERT INTO public.audit_logs(user_id,action,resource_type,metadata)
  VALUES(auth.uid(),'program_finance.queue.read','program_finance',jsonb_build_object('data_mode',active_mode,'count',jsonb_array_length(result)));
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_partner_operating_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; result jsonb;
BEGIN
  active_mode:=public.phase2_assert_actor_runtime('partners');
  IF NOT public.phase2_current_has_capability('partnership.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'entityTypes',jsonb_build_array('barangay','dyci_office','student_organization','academic_department','external_organization','government_agency','school','faith_based','other'),
    'officers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'role',u.role) ORDER BY u.full_name,u.id)
      FROM public.users u WHERE u.status='active' AND u.is_active AND u.role IN('paraya_director','paraya_associate','paraya_researcher')
      AND (active_mode='live' OR u.is_synthetic_test)),'[]'::jsonb),
    'barangays',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) ORDER BY b.name,b.id)
      FROM public.barangays b WHERE b.is_synthetic_test=(active_mode='synthetic')),'[]'::jsonb),
    'policies',coalesce((SELECT jsonb_agg(jsonb_build_object('entityType',p.entity_type,'agreementRequired',p.agreement_required,'effectiveFrom',p.effective_from)
      ORDER BY p.entity_type) FROM public.partner_type_policies p),'[]'::jsonb)
  ) INTO result;
  INSERT INTO public.audit_logs(user_id,action,resource_type,metadata) VALUES(auth.uid(),'partner.catalog.read','partner_catalog',jsonb_build_object('data_mode',active_mode));
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_document_parent(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_review_document(text,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_accept_document_risk(text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_documents(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_claim_contact_email_outbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_finalize_contact_email(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_list_program_finance_queue() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_partner_operating_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_review_document(text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_accept_document_risk(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_documents(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_claim_contact_email_outbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase2_finalize_contact_email(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase2_list_program_finance_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_partner_operating_catalog() TO authenticated;

UPDATE public.phase2_component_runtime SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state SET write_authority='v1',reconciliation_hash=NULL,reconciled_at=NULL,changed_by=NULL,changed_at=now();

COMMIT;
