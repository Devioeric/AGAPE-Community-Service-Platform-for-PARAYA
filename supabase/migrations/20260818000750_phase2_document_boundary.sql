-- Private document metadata boundary. Object bytes remain private and direct
-- Storage access stays denied; signed URLs require a parent-authorized RPC.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase2_register_document(p_kind text,p_parent_id uuid,p_term_id uuid,p_metadata jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; component text; bucket text; parent_mode text; revision public.proposal_budget_revisions;
BEGIN
 IF NOT public.phase1_json_object_has_only(p_metadata,ARRAY['document_type','original_name','storage_path','sha256','mime_type','size_bytes','effective_on','expires_on','visibility'])
  OR p_metadata->>'sha256' !~ '^[0-9a-f]{64}$' OR (p_metadata->>'size_bytes')::bigint NOT BETWEEN 1 AND 10485760
  OR p_metadata->>'mime_type' NOT IN('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png')
 THEN RAISE EXCEPTION 'invalid document metadata' USING ERRCODE='22023'; END IF;
 IF p_kind='partnership' THEN
  component:='partners'; PERFORM public.phase2_assert_runtime(component,p_parent_id);
  IF NOT public.phase2_current_has_capability('partner.document.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_term_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partnership_terms WHERE id=p_term_id AND partner_id=p_parent_id) THEN RAISE EXCEPTION 'term does not belong to Partner' USING ERRCODE='23514'; END IF;
  bucket:='phase2-partnership-documents';
  INSERT INTO public.partnership_documents(partner_id,term_id,document_type,original_name,storage_path,sha256,mime_type,size_bytes,effective_on,expires_on,visibility,uploaded_by)
  VALUES(p_parent_id,p_term_id,p_metadata->>'document_type',p_metadata->>'original_name',p_metadata->>'storage_path',p_metadata->>'sha256',p_metadata->>'mime_type',(p_metadata->>'size_bytes')::bigint,
    nullif(p_metadata->>'effective_on','')::date,nullif(p_metadata->>'expires_on','')::date,coalesce(p_metadata->>'visibility','paraya_only'),auth.uid()) RETURNING id INTO new_id;
 ELSIF p_kind='historical' THEN
  component:='historical_programs'; PERFORM public.phase2_assert_runtime(component,p_parent_id);
  IF NOT public.phase2_current_has_capability('historical_program.create') OR NOT EXISTS(SELECT 1 FROM public.historical_programs WHERE id=p_parent_id AND status IN('draft','returned')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  bucket:='phase2-historical-evidence';
  INSERT INTO public.historical_program_documents(historical_program_id,original_name,storage_path,sha256,mime_type,size_bytes,uploaded_by)
  VALUES(p_parent_id,p_metadata->>'original_name',p_metadata->>'storage_path',p_metadata->>'sha256',p_metadata->>'mime_type',(p_metadata->>'size_bytes')::bigint,auth.uid()) RETURNING id INTO new_id;
 ELSIF p_kind='proposal_budget' THEN
  SELECT * INTO revision FROM public.proposal_budget_revisions WHERE id=p_parent_id;
  IF revision.id IS NULL THEN RAISE EXCEPTION 'budget revision not found' USING ERRCODE='P0002'; END IF;
  component:='proposals'; PERFORM public.phase2_assert_runtime(component,revision.proposal_id);
  IF NOT public.phase2_current_has_capability('budget.prepare') OR revision.status<>'draft' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  bucket:='phase2-proposal-budget-evidence';
  INSERT INTO public.proposal_budget_documents(revision_id,document_type,original_name,storage_path,sha256,mime_type,size_bytes,uploaded_by)
  VALUES(p_parent_id,p_metadata->>'document_type',p_metadata->>'original_name',p_metadata->>'storage_path',p_metadata->>'sha256',p_metadata->>'mime_type',(p_metadata->>'size_bytes')::bigint,auth.uid()) RETURNING id INTO new_id;
 ELSIF p_kind='program_finance' THEN
  component:='program_finance'; PERFORM public.phase2_assert_runtime(component,p_parent_id);
  IF NOT public.phase2_current_has_capability('budget.actual.record') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  bucket:='phase2-program-financial-evidence';
  INSERT INTO public.program_financial_documents(program_id,document_type,original_name,storage_path,sha256,mime_type,size_bytes,uploaded_by)
  VALUES(p_parent_id,p_metadata->>'document_type',p_metadata->>'original_name',p_metadata->>'storage_path',p_metadata->>'sha256',p_metadata->>'mime_type',(p_metadata->>'size_bytes')::bigint,auth.uid()) RETURNING id INTO new_id;
 ELSE RAISE EXCEPTION 'unknown document kind' USING ERRCODE='22023'; END IF;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),'phase2.document.register',p_kind,new_id::text,jsonb_build_object('parent_id',p_parent_id,'bucket',bucket));
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_authorize_document_read(p_kind text,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE bucket text; path text; parent uuid; status text; allowed boolean:=false; visibility text; linked_barangay uuid;
BEGIN
 IF p_kind='partnership' THEN SELECT 'phase2-partnership-documents',d.storage_path,d.partner_id,d.scan_status,d.visibility,e.barangay_id INTO bucket,path,parent,status,visibility,linked_barangay FROM public.partnership_documents d JOIN public.partner_entities e ON e.id=d.partner_id WHERE d.id=p_document_id;
  PERFORM public.phase2_assert_runtime('partners',parent); allowed:=public.phase2_current_has_capability('partner.document.read') OR (visibility='linked_barangay' AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.status='active' AND u.is_active AND u.role IN('barangay_captain','barangay_secretary') AND u.barangay_id=linked_barangay AND coalesce((u.permissions->>'partnerships')::boolean,true) IS NOT FALSE));
 ELSIF p_kind='historical' THEN SELECT 'phase2-historical-evidence',d.storage_path,d.historical_program_id,d.scan_status INTO bucket,path,parent,status FROM public.historical_program_documents d WHERE d.id=p_document_id;
  PERFORM public.phase2_assert_runtime('historical_programs',parent); allowed:=public.phase2_current_has_capability('historical_program.read');
 ELSIF p_kind='proposal_budget' THEN SELECT 'phase2-proposal-budget-evidence',d.storage_path,r.proposal_id,d.scan_status INTO bucket,path,parent,status FROM public.proposal_budget_documents d JOIN public.proposal_budget_revisions r ON r.id=d.revision_id WHERE d.id=p_document_id;
  PERFORM public.phase2_assert_runtime('proposals',parent); allowed:=public.phase2_current_has_capability('budget.read');
 ELSIF p_kind='program_finance' THEN SELECT 'phase2-program-financial-evidence',d.storage_path,d.program_id,d.scan_status INTO bucket,path,parent,status FROM public.program_financial_documents d WHERE d.id=p_document_id;
  PERFORM public.phase2_assert_runtime('program_finance',parent); allowed:=public.phase2_current_has_capability('budget.read');
 ELSE RAISE EXCEPTION 'unknown document kind' USING ERRCODE='22023'; END IF;
 IF path IS NULL THEN RAISE EXCEPTION 'document not found' USING ERRCODE='P0002'; END IF;
 IF NOT allowed OR status NOT IN('approved','risk_accepted') THEN RAISE EXCEPTION 'document is unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.phase2_storage_read_events(bucket_id,object_path,parent_type,parent_id,actor_id) VALUES(bucket,path,p_kind,parent,auth.uid());
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),'phase2.document.read',p_kind,p_document_id::text,jsonb_build_object('parent_id',parent));
 RETURN jsonb_build_object('bucket',bucket,'path',path);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_accept_document_risk(p_kind text,p_document_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE changed integer;
BEGIN
 IF NOT public.phase2_current_has_capability('partner.policy.manage') OR length(btrim(coalesce(p_reason,'')))<20 THEN RAISE EXCEPTION 'Director risk acceptance and reason are required' USING ERRCODE='42501'; END IF;
 IF p_kind='partnership' THEN UPDATE public.partnership_documents SET scan_status='risk_accepted' WHERE id=p_document_id AND scan_status='quarantined';
 ELSIF p_kind='historical' THEN UPDATE public.historical_program_documents SET scan_status='risk_accepted' WHERE id=p_document_id AND scan_status='quarantined';
 ELSIF p_kind='proposal_budget' THEN UPDATE public.proposal_budget_documents SET scan_status='risk_accepted' WHERE id=p_document_id AND scan_status='quarantined';
 ELSIF p_kind='program_finance' THEN UPDATE public.program_financial_documents SET scan_status='risk_accepted' WHERE id=p_document_id AND scan_status='quarantined';
 ELSE RAISE EXCEPTION 'unknown document kind' USING ERRCODE='22023'; END IF;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'document is missing or already reviewed' USING ERRCODE='40001'; END IF;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,level,metadata) VALUES(auth.uid(),'phase2.document.risk_accept',p_kind,p_document_id::text,'warning',jsonb_build_object('reason',p_reason));
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_register_document(text,uuid,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_authorize_document_read(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_accept_document_risk(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_register_document(text,uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_authorize_document_read(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_accept_document_risk(text,uuid,text) TO authenticated;
COMMIT;
