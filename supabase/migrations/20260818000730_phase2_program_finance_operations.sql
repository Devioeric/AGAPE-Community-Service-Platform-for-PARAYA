-- Program financial monitoring integrity: parent-bound evidence, corrections,
-- itemized liquidations, and allowlisted read DTOs.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase2_record_expenditure(p_program_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; item public.program_budget_items; doc public.program_financial_documents; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
 IF NOT public.phase2_current_has_capability('budget.actual.record') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['budget_item_id','amount','spent_on','payee_label','description','receipt_document_id','receipt_exception_reason']) THEN RAISE EXCEPTION 'unknown expenditure field' USING ERRCODE='22023'; END IF;
 SELECT i.* INTO item FROM public.program_budget_items i JOIN public.program_budget_revisions r ON r.id=i.revision_id
 WHERE i.id=(p_payload->>'budget_item_id')::uuid AND r.program_id=p_program_id AND r.status='active' FOR SHARE;
 IF item.id IS NULL OR item.item_kind<>'cash' OR (p_payload->>'amount')::numeric<=0 OR length(btrim(coalesce(p_payload->>'description',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid cash expenditure' USING ERRCODE='22023'; END IF;
 IF nullif(p_payload->>'receipt_document_id','') IS NOT NULL THEN
  SELECT * INTO doc FROM public.program_financial_documents WHERE id=(p_payload->>'receipt_document_id')::uuid;
  IF doc.id IS NULL OR doc.program_id<>p_program_id OR doc.scan_status NOT IN('approved','risk_accepted') THEN RAISE EXCEPTION 'receipt is not approved for this program' USING ERRCODE='23514'; END IF;
 ELSIF length(btrim(coalesce(p_payload->>'receipt_exception_reason','')))<10 THEN
  RAISE EXCEPTION 'approved receipt or exception is required' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.program_expenditures(program_id,budget_item_id,amount,spent_on,payee_label,description,receipt_document_id,receipt_exception_reason,recorded_by)
 VALUES(p_program_id,item.id,(p_payload->>'amount')::numeric,(p_payload->>'spent_on')::date,nullif(btrim(p_payload->>'payee_label'),''),btrim(p_payload->>'description'),nullif(p_payload->>'receipt_document_id','')::uuid,nullif(btrim(p_payload->>'receipt_exception_reason'),''),auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.program_finance_events(program_id,expenditure_id,action,to_status,actor_id) VALUES(p_program_id,new_id,'expenditure_recorded','pending',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'program.expenditure.record','program_expenditure',new_id::text,jsonb_build_object('program_id',p_program_id));
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_review_expenditure(p_program_id uuid,p_id uuid,p_action text,p_expected_version integer,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.program_expenditures; next_status text; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
 IF NOT public.phase2_current_has_capability('budget.review') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.program_expenditures WHERE id=p_id AND program_id=p_program_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'expenditure not found for program' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale expenditure' USING ERRCODE='40001'; END IF;
 IF item.status<>'pending' OR p_action NOT IN('verify','return') OR (p_action='return' AND length(btrim(coalesce(p_reason,'')))<5) THEN RAISE EXCEPTION 'invalid expenditure review' USING ERRCODE='42501'; END IF;
 next_status:=CASE WHEN p_action='verify' THEN 'verified' ELSE 'returned' END;
 UPDATE public.program_expenditures SET status=next_status,row_version=row_version+1,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=p_id;
 INSERT INTO public.program_finance_events(program_id,expenditure_id,action,from_status,to_status,reason,actor_id) VALUES(p_program_id,p_id,'expenditure_'||p_action,item.status,next_status,nullif(btrim(p_reason),''),auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'program.expenditure.'||p_action,'program_expenditure',p_id::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_correct_expenditure(p_program_id uuid,p_id uuid,p_expected_version integer,p_replacement_payload jsonb,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE old public.program_expenditures; replacement uuid;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
 IF NOT public.phase2_current_has_capability('budget.actual.record') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'forbidden or missing reason' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM public.program_expenditures WHERE id=p_id AND program_id=p_program_id FOR UPDATE;
 IF old.id IS NULL THEN RAISE EXCEPTION 'expenditure not found for program' USING ERRCODE='P0002'; END IF;
 IF old.row_version<>p_expected_version OR old.status IN('voided','replaced') THEN RAISE EXCEPTION 'stale expenditure' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.liquidation_expenditures WHERE expenditure_id=p_id AND released_at IS NULL) THEN RAISE EXCEPTION 'void the covering liquidation before correcting this expenditure' USING ERRCODE='23514'; END IF;
 replacement:=public.phase2_record_expenditure(p_program_id,p_replacement_payload);
 UPDATE public.program_expenditures SET status='replaced',row_version=row_version+1,updated_at=now() WHERE id=p_id;
 UPDATE public.program_expenditures SET replaces_id=p_id WHERE id=replacement;
 INSERT INTO public.program_finance_events(program_id,expenditure_id,action,from_status,to_status,reason,actor_id) VALUES(p_program_id,p_id,'expenditure_replaced',old.status,'replaced',p_reason,auth.uid());
 RETURN replacement;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_void_expenditure(p_program_id uuid,p_id uuid,p_expected_version integer,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.program_expenditures; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
 IF NOT public.phase2_current_has_capability('budget.actual.record') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'forbidden or missing reason' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.program_expenditures WHERE id=p_id AND program_id=p_program_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'expenditure not found for program' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version OR item.status IN('voided','replaced') THEN RAISE EXCEPTION 'stale expenditure' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.liquidation_expenditures WHERE expenditure_id=p_id AND released_at IS NULL) THEN RAISE EXCEPTION 'void the covering liquidation before voiding this expenditure' USING ERRCODE='23514'; END IF;
 UPDATE public.program_expenditures SET status='voided',row_version=row_version+1,updated_at=now() WHERE id=p_id;
 INSERT INTO public.program_finance_events(program_id,expenditure_id,action,from_status,to_status,reason,actor_id) VALUES(p_program_id,p_id,'expenditure_voided',item.status,'voided',p_reason,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level) VALUES(auth.uid(),actor_email,'program.expenditure.void','program_expenditure',p_id::text,'warning');
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_create_liquidation(p_program_id uuid,p_summary jsonb,p_expenditure_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; next_revision integer; total numeric; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
 IF NOT public.phase2_current_has_capability('budget.actual.record') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_summary,ARRAY['period_start','period_end','narrative','exception_notes'])
  OR length(btrim(coalesce(p_summary->>'narrative',''))) NOT BETWEEN 10 AND 2000
  OR (p_summary->>'period_start')::date>(p_summary->>'period_end')::date THEN RAISE EXCEPTION 'invalid liquidation summary' USING ERRCODE='22023'; END IF;
 IF cardinality(coalesce(p_expenditure_ids,'{}'))=0 OR cardinality(p_expenditure_ids)>1000 THEN RAISE EXCEPTION 'liquidation requires 1-1000 expenditures' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('liquidation:'||p_program_id::text,0));
 IF EXISTS(SELECT 1 FROM unnest(p_expenditure_ids) AS requested(expenditure_id) LEFT JOIN public.program_expenditures e ON e.id=requested.expenditure_id WHERE e.id IS NULL OR e.program_id<>p_program_id OR e.status<>'verified') THEN RAISE EXCEPTION 'liquidation contains an invalid or unverified expenditure' USING ERRCODE='23514'; END IF;
 IF nullif(p_summary->>'period_start','') IS NULL OR nullif(p_summary->>'period_end','') IS NULL THEN RAISE EXCEPTION 'liquidation period is required' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.liquidation_expenditures l WHERE l.expenditure_id=ANY(p_expenditure_ids) AND l.released_at IS NULL) THEN RAISE EXCEPTION 'an expenditure is already claimed by another liquidation' USING ERRCODE='23505'; END IF;
 SELECT coalesce(max(revision_number),0)+1 INTO next_revision FROM public.liquidation_submissions WHERE program_id=p_program_id;
 SELECT sum(amount) INTO total FROM public.program_expenditures WHERE id=ANY(p_expenditure_ids);
 INSERT INTO public.liquidation_submissions(program_id,revision_number,total_submitted,summary,prepared_by) VALUES(p_program_id,next_revision,total,p_summary,auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.liquidation_expenditures(liquidation_id,expenditure_id,amount_snapshot) SELECT new_id,e.id,e.amount FROM public.program_expenditures e WHERE e.id=ANY(p_expenditure_ids);
 INSERT INTO public.program_finance_events(program_id,liquidation_id,action,to_status,actor_id) VALUES(p_program_id,new_id,'liquidation_created','draft',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'program.liquidation.create','liquidation',new_id::text,jsonb_build_object('expenditure_count',cardinality(p_expenditure_ids)));
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_apply_liquidation_action(p_program_id uuid,p_liquidation_id uuid,p_action text,p_expected_version integer,p_remarks text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.liquidation_submissions; next_status text; current_total numeric; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
 SELECT * INTO item FROM public.liquidation_submissions WHERE id=p_liquidation_id AND program_id=p_program_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'liquidation not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale liquidation' USING ERRCODE='40001'; END IF;
 SELECT coalesce(sum(e.amount),0) INTO current_total FROM public.liquidation_expenditures l JOIN public.program_expenditures e ON e.id=l.expenditure_id WHERE l.liquidation_id=item.id AND l.released_at IS NULL AND e.status='verified';
 IF current_total<=0 OR current_total<>item.total_submitted THEN RAISE EXCEPTION 'liquidation coverage is stale or incomplete' USING ERRCODE='23514'; END IF;
 IF p_action='submit' THEN
  IF NOT public.phase2_current_has_capability('budget.actual.record') OR item.status NOT IN('draft','returned') THEN RAISE EXCEPTION 'invalid submit' USING ERRCODE='42501'; END IF; next_status:='submitted';
 ELSIF p_action IN('return','verify','void') THEN
  IF NOT public.phase2_current_has_capability('budget.liquidation.review') OR (p_action IN('return','verify') AND item.status<>'submitted') OR (p_action='void' AND item.status<>'verified') OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid liquidation review' USING ERRCODE='42501'; END IF;
  next_status:=CASE p_action WHEN 'return' THEN 'returned' WHEN 'verify' THEN 'verified' ELSE 'voided' END;
 ELSE RAISE EXCEPTION 'unknown liquidation action' USING ERRCODE='22023'; END IF;
 UPDATE public.liquidation_submissions SET status=next_status,row_version=row_version+1,reviewed_by=CASE WHEN p_action<>'submit' THEN auth.uid() ELSE reviewed_by END,reviewed_at=CASE WHEN p_action<>'submit' THEN now() ELSE reviewed_at END,updated_at=now() WHERE id=p_liquidation_id;
 IF p_action='void' THEN UPDATE public.liquidation_expenditures SET released_at=now(),release_reason=p_remarks WHERE liquidation_id=p_liquidation_id AND released_at IS NULL; END IF;
 INSERT INTO public.program_finance_events(program_id,liquidation_id,action,from_status,to_status,reason,actor_id) VALUES(p_program_id,p_liquidation_id,'liquidation_'||p_action,item.status,next_status,p_remarks,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'program.liquidation.'||p_action,'liquidation',p_liquidation_id::text);
 RETURN next_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_program_finance(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance',p_program_id);
 IF NOT public.phase2_current_has_capability('budget.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('programId',p.id,'title',p.title,
  'allocation',(SELECT jsonb_build_object('id',r.id,'revisionNumber',r.revision_number,'status',r.status,'cashTotal',r.cash_total::text,'inKindTotal',r.in_kind_total::text,'rowVersion',r.row_version,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'kind',i.item_kind,'description',i.description,'allocatedAmount',i.allocated_amount::text,'sortOrder',i.sort_order) ORDER BY i.sort_order,i.id) FROM public.program_budget_items i WHERE i.revision_id=r.id),'[]'::jsonb))
   FROM public.program_budget_revisions r WHERE r.program_id=p.id AND r.status='active'),
  'expenditures',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'budgetItemId',e.budget_item_id,'amount',e.amount::text,'spentOn',e.spent_on,'description',e.description,'status',e.status,'receiptDocumentId',e.receipt_document_id,'receiptExceptionReason',e.receipt_exception_reason,'rowVersion',e.row_version) ORDER BY e.spent_on DESC,e.created_at DESC) FROM public.program_expenditures e WHERE e.program_id=p.id),'[]'::jsonb),
  'liquidations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'revisionNumber',l.revision_number,'status',l.status,'totalSubmitted',l.total_submitted::text,'summary',l.summary,'rowVersion',l.row_version,'expenditureIds',coalesce((SELECT jsonb_agg(x.expenditure_id) FROM public.liquidation_expenditures x WHERE x.liquidation_id=l.id AND x.released_at IS NULL),'[]'::jsonb)) ORDER BY l.revision_number DESC) FROM public.liquidation_submissions l WHERE l.program_id=p.id),'[]'::jsonb),
  'totals',jsonb_build_object(
    'plannedCash',coalesce((SELECT cash_total::text FROM public.program_budget_revisions WHERE program_id=p.id AND status='active'),'0.00'),
    'pendingActual',coalesce((SELECT sum(amount)::text FROM public.program_expenditures WHERE program_id=p.id AND status='pending'),'0.00'),
    'verifiedActual',coalesce((SELECT sum(amount)::text FROM public.program_expenditures WHERE program_id=p.id AND status='verified'),'0.00'),
    'remaining',coalesce(((SELECT cash_total FROM public.program_budget_revisions WHERE program_id=p.id AND status='active')-(SELECT coalesce(sum(amount),0) FROM public.program_expenditures WHERE program_id=p.id AND status='verified'))::text,'0.00'))
 ) INTO result FROM public.programs p WHERE p.id=p_program_id;
 IF result IS NULL THEN RAISE EXCEPTION 'program not found' USING ERRCODE='P0002'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'program.finance.read','program',p_program_id::text);
 RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_record_expenditure(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_review_expenditure(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_review_expenditure(uuid,uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_correct_expenditure(uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_correct_expenditure(uuid,uuid,integer,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_void_expenditure(uuid,uuid,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_create_liquidation(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_create_liquidation(uuid,jsonb,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_apply_liquidation_action(uuid,uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_program_finance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_record_expenditure(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_review_expenditure(uuid,uuid,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_correct_expenditure(uuid,uuid,integer,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_void_expenditure(uuid,uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_create_liquidation(uuid,jsonb,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_apply_liquidation_action(uuid,uuid,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_program_finance(uuid) TO authenticated;

COMMIT;
