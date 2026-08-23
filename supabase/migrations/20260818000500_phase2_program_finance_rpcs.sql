-- Minimal financial monitoring RPCs. AGAPE records/reviews; it does not pay.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase2_record_expenditure(p_program_id uuid,p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; item public.program_budget_items; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance');
 IF NOT public.phase2_current_has_capability('budget.actual.record') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['budget_item_id','amount','spent_on','payee_label','description','receipt_document_id','receipt_exception_reason']) THEN RAISE EXCEPTION 'unknown expenditure field' USING ERRCODE='22023'; END IF;
 SELECT i.* INTO item FROM public.program_budget_items i JOIN public.program_budget_revisions r ON r.id=i.revision_id WHERE i.id=(p_payload->>'budget_item_id')::uuid AND r.program_id=p_program_id AND r.status='active' FOR SHARE;
 IF item.id IS NULL OR (p_payload->>'amount')::numeric<=0 OR length(btrim(coalesce(p_payload->>'description',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid expenditure' USING ERRCODE='22023'; END IF;
 IF nullif(p_payload->>'receipt_document_id','') IS NULL AND length(btrim(coalesce(p_payload->>'receipt_exception_reason','')))<10 THEN RAISE EXCEPTION 'receipt or exception is required' USING ERRCODE='23514'; END IF;
 INSERT INTO public.program_expenditures(program_id,budget_item_id,amount,spent_on,payee_label,description,receipt_document_id,receipt_exception_reason,recorded_by)
 VALUES(p_program_id,item.id,(p_payload->>'amount')::numeric,(p_payload->>'spent_on')::date,nullif(p_payload->>'payee_label',''),p_payload->>'description',nullif(p_payload->>'receipt_document_id','')::uuid,nullif(p_payload->>'receipt_exception_reason',''),auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.program_finance_events(program_id,expenditure_id,action,to_status,actor_id) VALUES(p_program_id,new_id,'expenditure_recorded','pending',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'program.expenditure.record','program_expenditure',new_id::text,jsonb_build_object('program_id',p_program_id));
 RETURN new_id;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_review_expenditure(p_id uuid,p_action text,p_expected_version integer,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.program_expenditures; next_status text; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance');
 IF NOT public.phase2_current_has_capability('budget.review') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.program_expenditures WHERE id=p_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'expenditure not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale expenditure' USING ERRCODE='40001'; END IF;
 IF item.status<>'pending' OR p_action NOT IN('verify','return') OR (p_action='return' AND length(btrim(coalesce(p_reason,'')))<5) THEN RAISE EXCEPTION 'invalid expenditure review' USING ERRCODE='42501'; END IF;
 next_status:=CASE WHEN p_action='verify' THEN 'verified' ELSE 'returned' END;
 UPDATE public.program_expenditures SET status=next_status,row_version=row_version+1,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=p_id;
 INSERT INTO public.program_finance_events(program_id,expenditure_id,action,from_status,to_status,reason,actor_id) VALUES(item.program_id,p_id,'expenditure_'||p_action,item.status,next_status,p_reason,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'program.expenditure.'||p_action,'program_expenditure',p_id::text);
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_correct_expenditure(p_id uuid,p_expected_version integer,p_replacement_payload jsonb,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE old public.program_expenditures; replacement uuid;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance');
 IF NOT public.phase2_current_has_capability('budget.actual.record') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'forbidden or missing reason' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM public.program_expenditures WHERE id=p_id FOR UPDATE;
 IF old.id IS NULL THEN RAISE EXCEPTION 'expenditure not found' USING ERRCODE='P0002'; END IF;
 IF old.row_version<>p_expected_version OR old.status IN('voided','replaced') THEN RAISE EXCEPTION 'stale expenditure' USING ERRCODE='40001'; END IF;
 replacement:=public.phase2_record_expenditure(old.program_id,p_replacement_payload);
 UPDATE public.program_expenditures SET status='replaced',row_version=row_version+1,updated_at=now() WHERE id=p_id;
 UPDATE public.program_expenditures SET replaces_id=p_id WHERE id=replacement;
 INSERT INTO public.program_finance_events(program_id,expenditure_id,action,from_status,to_status,reason,actor_id) VALUES(old.program_id,p_id,'expenditure_replaced',old.status,'replaced',p_reason,auth.uid());
 RETURN replacement;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_apply_liquidation_action(p_program_id uuid,p_liquidation_id uuid,p_action text,p_expected_version integer,p_remarks text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item public.liquidation_submissions; next_status text; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance');
 SELECT * INTO item FROM public.liquidation_submissions WHERE id=p_liquidation_id AND program_id=p_program_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'liquidation not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale liquidation' USING ERRCODE='40001'; END IF;
 IF p_action='submit' THEN
  IF NOT public.phase2_current_has_capability('budget.actual.record') OR item.status NOT IN('draft','returned') THEN RAISE EXCEPTION 'invalid submit' USING ERRCODE='42501'; END IF; next_status:='submitted';
 ELSIF p_action IN('return','verify','void') THEN
  IF NOT public.phase2_current_has_capability('budget.liquidation.review')
    OR (p_action IN('return','verify') AND item.status<>'submitted') OR (p_action='void' AND item.status<>'verified')
    OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid liquidation review' USING ERRCODE='42501'; END IF;
  next_status:=CASE p_action WHEN 'return' THEN 'returned' WHEN 'verify' THEN 'verified' ELSE 'voided' END;
 ELSE RAISE EXCEPTION 'unknown liquidation action' USING ERRCODE='22023'; END IF;
 UPDATE public.liquidation_submissions SET status=next_status,row_version=row_version+1,reviewed_by=CASE WHEN p_action<>'submit' THEN auth.uid() ELSE reviewed_by END,reviewed_at=CASE WHEN p_action<>'submit' THEN now() ELSE reviewed_at END,updated_at=now() WHERE id=p_liquidation_id;
 INSERT INTO public.program_finance_events(program_id,liquidation_id,action,from_status,to_status,reason,actor_id) VALUES(p_program_id,p_liquidation_id,'liquidation_'||p_action,item.status,next_status,p_remarks,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'program.liquidation.'||p_action,'liquidation',p_liquidation_id::text);
 RETURN next_status;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_create_liquidation(p_program_id uuid,p_summary jsonb DEFAULT '{}') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; next_revision integer; total numeric; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('program_finance');
 IF NOT public.phase2_current_has_capability('budget.actual.record') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.programs WHERE id=p_program_id FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'program not found' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('liquidation:'||p_program_id::text,0));
 SELECT coalesce(max(revision_number),0)+1 INTO next_revision FROM public.liquidation_submissions WHERE program_id=p_program_id;
 SELECT coalesce(sum(amount),0) INTO total FROM public.program_expenditures WHERE program_id=p_program_id AND status='verified';
 INSERT INTO public.liquidation_submissions(program_id,revision_number,total_submitted,summary,prepared_by) VALUES(p_program_id,next_revision,total,coalesce(p_summary,'{}'),auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.program_finance_events(program_id,liquidation_id,action,to_status,actor_id) VALUES(p_program_id,new_id,'liquidation_created','draft',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'program.liquidation.create','liquidation',new_id::text);
 RETURN new_id;
END;$function$;

REVOKE ALL ON FUNCTION public.phase2_record_expenditure(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_review_expenditure(uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_correct_expenditure(uuid,integer,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_apply_liquidation_action(uuid,uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_create_liquidation(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_record_expenditure(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_review_expenditure(uuid,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_correct_expenditure(uuid,integer,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_apply_liquidation_action(uuid,uuid,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_create_liquidation(uuid,jsonb) TO authenticated;
COMMIT;
