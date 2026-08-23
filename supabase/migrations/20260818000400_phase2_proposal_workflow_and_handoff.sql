-- Human-only structured proposal workflow and one-to-one program handoff.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase2_capture_proposal_version(p_proposal_id uuid,p_reason text,p_actor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE snapshot jsonb; version_no integer; new_id uuid;
BEGIN
 PERFORM 1 FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id FOR UPDATE;
 SELECT jsonb_build_object(
  'proposal',(SELECT to_jsonb(q)-'created_by'-'reviewed_by' FROM public.project_proposals q WHERE q.id=p_proposal_id),
  'profile',(SELECT to_jsonb(p)-'responsible_officer_id' FROM public.proposal_v2_profiles p WHERE p.proposal_id=p_proposal_id),
  'targets',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.is_lead DESC,t.id) FROM public.proposal_target_areas t WHERE t.proposal_id=p_proposal_id),'[]'),
  'needs',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.proposal_need_links_v2 n WHERE n.proposal_id=p_proposal_id),'[]'),
  'beneficiaries',coalesce((SELECT jsonb_agg(to_jsonb(e)-'override_actor_id' ORDER BY e.id) FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=p_proposal_id),'[]'),
  'sdgs',coalesce((SELECT jsonb_agg(s.sdg_number ORDER BY s.sdg_number) FROM public.proposal_sdg_alignment s WHERE s.proposal_id=p_proposal_id),'[]')
 ) INTO snapshot;
 SELECT coalesce(max(version_number),0)+1 INTO version_no FROM public.proposal_versions WHERE proposal_id=p_proposal_id;
 INSERT INTO public.proposal_versions(proposal_id,version_number,reason,snapshot,canonical_hash,created_by)
 VALUES(p_proposal_id,version_no,p_reason,snapshot,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),p_actor_id) RETURNING id INTO new_id;
 UPDATE public.proposal_v2_profiles SET active_version_id=new_id WHERE proposal_id=p_proposal_id;
 RETURN new_id;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_apply_proposal_action(
 p_proposal_id uuid,p_action text,p_expected_version integer,p_remarks text DEFAULT NULL,p_warning_codes text[] DEFAULT '{}'
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE p public.proposal_v2_profiles; budget public.proposal_budget_revisions; next_status text; version_id uuid; actor_email text; cash_sources numeric; cash_items numeric;
BEGIN
 PERFORM public.phase2_assert_runtime('proposals');
 SELECT * INTO p FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id FOR UPDATE;
 IF p.proposal_id IS NULL THEN RAISE EXCEPTION 'structured proposal not found' USING ERRCODE='P0002'; END IF;
 IF p.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale proposal version' USING ERRCODE='40001'; END IF;
 SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=p.active_budget_revision_id FOR UPDATE;
 IF p_action='submit' THEN
  IF NOT public.phase2_current_has_capability('proposal.submit') OR p.workflow_status NOT IN('draft','revisions_requested') THEN RAISE EXCEPTION 'invalid submit transition' USING ERRCODE='42501'; END IF;
  IF budget.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.proposal_target_areas WHERE proposal_id=p_proposal_id)
   OR NOT EXISTS(SELECT 1 FROM public.proposal_need_links_v2 WHERE proposal_id=p_proposal_id)
   OR NOT EXISTS(SELECT 1 FROM public.proposal_beneficiary_estimates WHERE proposal_id=p_proposal_id)
   OR NOT EXISTS(SELECT 1 FROM public.proposal_sdg_alignment WHERE proposal_id=p_proposal_id AND sdg_number BETWEEN 1 AND 17)
  THEN RAISE EXCEPTION 'proposal graph is incomplete' USING ERRCODE='23514'; END IF;
  next_status:=CASE WHEN p.workflow_status='revisions_requested' THEN coalesce(p.return_stage,'pre_screening') ELSE 'submitted' END;
  UPDATE public.proposal_budget_revisions SET status=CASE WHEN status IN('draft','returned') THEN 'submitted' ELSE status END,submitted_by=auth.uid(),submitted_at=now(),updated_at=now() WHERE id=budget.id;
  version_id:=public.phase2_capture_proposal_version(p_proposal_id,CASE WHEN p.workflow_status='draft' THEN 'submission' ELSE 'resubmission' END,auth.uid());
 ELSIF p_action='pass_pre_screening' THEN
  IF NOT public.phase2_current_has_capability('proposal.review') OR p.workflow_status NOT IN('submitted','pre_screening') THEN RAISE EXCEPTION 'invalid pre-screen transition' USING ERRCODE='42501'; END IF;
  next_status:=CASE WHEN p.workflow_status='submitted' THEN 'pre_screening' ELSE 'evidence_review' END;
 ELSIF p_action='confirm_evidence' THEN
  IF NOT public.phase2_current_has_capability('proposal.evidence.confirm') OR p.workflow_status<>'evidence_review' THEN RAISE EXCEPTION 'invalid evidence transition' USING ERRCODE='42501'; END IF; next_status:='finance_review';
 ELSIF p_action='request_revision' THEN
  IF NOT public.phase2_current_has_capability('proposal.review') OR p.workflow_status NOT IN('pre_screening','evidence_review','director_review') OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid revision request' USING ERRCODE='42501'; END IF;
  next_status:='revisions_requested'; UPDATE public.proposal_v2_profiles SET return_stage=p.workflow_status WHERE proposal_id=p_proposal_id;
 ELSIF p_action='finance_return' THEN
  IF NOT public.phase2_current_has_capability('budget.review') OR p.workflow_status<>'finance_review' OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid finance return' USING ERRCODE='42501'; END IF;
  next_status:='revisions_requested'; UPDATE public.proposal_v2_profiles SET return_stage='finance_review' WHERE proposal_id=p_proposal_id;
  UPDATE public.proposal_budget_revisions SET status='returned',row_version=row_version+1,updated_at=now() WHERE id=budget.id;
  INSERT INTO public.budget_review_events(proposal_id,revision_id,action,remarks,actor_id) VALUES(p_proposal_id,budget.id,'returned',p_remarks,auth.uid());
 ELSIF p_action='finance_clear' THEN
  PERFORM public.phase2_assert_runtime('program_finance');
  IF NOT public.phase2_current_has_capability('budget.review') OR p.workflow_status<>'finance_review' OR budget.status<>'submitted' THEN RAISE EXCEPTION 'invalid finance clearance' USING ERRCODE='42501'; END IF;
  SELECT coalesce(sum(cash_value),0) INTO cash_sources FROM public.proposal_budget_funding_sources WHERE revision_id=budget.id;
  SELECT coalesce(sum(amount),0) INTO cash_items FROM public.proposal_budget_items WHERE revision_id=budget.id AND item_kind='cash';
  IF cash_sources<>cash_items OR cash_items<>budget.cash_total THEN RAISE EXCEPTION 'cash funding and item totals do not reconcile' USING ERRCODE='23514'; END IF;
  IF budget.zero_cash AND NOT EXISTS(SELECT 1 FROM public.proposal_budget_items WHERE revision_id=budget.id AND item_kind='in_kind') THEN RAISE EXCEPTION 'zero-cash budget requires in-kind resources' USING ERRCODE='23514'; END IF;
  UPDATE public.proposal_budget_revisions SET status='cleared',canonical_hash=encode(extensions.digest(convert_to((SELECT jsonb_build_object('revision',to_jsonb(r),'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order,i.id) FROM public.proposal_budget_items i WHERE i.revision_id=r.id),'[]'),'funding',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.proposal_budget_funding_sources f WHERE f.revision_id=r.id),'[]')) FROM public.proposal_budget_revisions r WHERE r.id=budget.id)::text,'UTF8'),'sha256'),'hex'),cleared_by=auth.uid(),cleared_at=now(),row_version=row_version+1,updated_at=now() WHERE id=budget.id;
  next_status:='director_review'; version_id:=public.phase2_capture_proposal_version(p_proposal_id,'finance_clearance',auth.uid());
  INSERT INTO public.budget_review_events(proposal_id,revision_id,action,remarks,actor_id) VALUES(p_proposal_id,budget.id,'cleared',p_remarks,auth.uid());
 ELSIF p_action IN('director_approve','director_reject') THEN
  IF NOT public.phase2_current_has_capability('proposal.decide') OR p.workflow_status<>'director_review' OR budget.status<>'cleared' THEN RAISE EXCEPTION 'invalid Director decision' USING ERRCODE='42501'; END IF;
  IF p_action='director_reject' AND length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'rejection remarks are required' USING ERRCODE='22023'; END IF;
  next_status:=CASE WHEN p_action='director_approve' THEN 'approved' ELSE 'rejected' END;
  version_id:=public.phase2_capture_proposal_version(p_proposal_id,'final_decision',auth.uid());
 ELSE RAISE EXCEPTION 'unknown workflow action' USING ERRCODE='22023'; END IF;
 UPDATE public.proposal_v2_profiles SET workflow_status=next_status,row_version=row_version+1,updated_at=now() WHERE proposal_id=p_proposal_id;
 INSERT INTO public.proposal_workflow_events_v2(proposal_id,action,from_status,to_status,proposal_version_id,budget_revision_id,warning_acknowledgements,remarks,actor_id)
 VALUES(p_proposal_id,p_action,p.workflow_status,next_status,coalesce(version_id,p.active_version_id),budget.id,to_jsonb(coalesce(p_warning_codes,'{}')),p_remarks,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'proposal.v2.'||p_action,'proposal',p_proposal_id::text,jsonb_build_object('from',p.workflow_status,'to',next_status));
 RETURN next_status;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_handoff_proposal(p_proposal_id uuid,p_expected_version integer)
RETURNS TABLE(handoff_id uuid,program_id uuid,created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE p public.proposal_v2_profiles; q public.project_proposals; b public.proposal_budget_revisions; existing public.program_handoffs; new_program uuid; new_handoff uuid; allocation uuid; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('proposals'); PERFORM public.phase2_assert_runtime('program_finance');
 IF NOT public.phase2_current_has_capability('proposal.handoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.program_handoffs WHERE proposal_id=p_proposal_id;
 IF existing.id IS NOT NULL THEN RETURN QUERY SELECT existing.id,existing.program_id,existing.created_at; RETURN; END IF;
 SELECT * INTO p FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id FOR UPDATE;
 SELECT * INTO q FROM public.project_proposals WHERE id=p_proposal_id FOR UPDATE;
 SELECT * INTO b FROM public.proposal_budget_revisions WHERE id=p.active_budget_revision_id FOR UPDATE;
 IF p.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale proposal version' USING ERRCODE='40001'; END IF;
 IF p.workflow_status<>'approved' OR p.active_version_id IS NULL OR b.status<>'cleared' THEN RAISE EXCEPTION 'proposal is not ready for handoff' USING ERRCODE='23514'; END IF;
 INSERT INTO public.programs(proposal_id,title,description,barangay_id,start_date,end_date,status,budget_allocated,budget_spent,created_by)
 SELECT q.id,q.title,q.rationale,t.barangay_id,p.starts_on,p.ends_on,'planning',b.cash_total,0,auth.uid()
 FROM public.proposal_target_areas t WHERE t.proposal_id=q.id AND t.is_lead RETURNING id INTO new_program;
 INSERT INTO public.program_handoffs(proposal_id,proposal_version_id,budget_revision_id,program_id,handed_off_by)
 VALUES(p_proposal_id,p.active_version_id,b.id,new_program,auth.uid()) RETURNING id INTO new_handoff;
 INSERT INTO public.program_target_areas_v2(program_id,source_target_area_id,barangay_id,sitio_id,is_lead) SELECT new_program,id,barangay_id,sitio_id,is_lead FROM public.proposal_target_areas WHERE proposal_id=p_proposal_id;
 INSERT INTO public.program_need_links_v2(program_id,source_proposal_need_link_id,need_id,intended_coverage,need_snapshot) SELECT new_program,id,need_id,intended_coverage,need_snapshot FROM public.proposal_need_links_v2 WHERE proposal_id=p_proposal_id;
 INSERT INTO public.program_beneficiary_plans_v2(program_id,source_estimate_id,category_code,planned_count,provenance) SELECT new_program,id,category_code,final_count,source_metadata FROM public.proposal_beneficiary_estimates WHERE proposal_id=p_proposal_id;
 INSERT INTO public.program_sdg_links_v2(program_id,sdg_number) SELECT new_program,sdg_number FROM public.proposal_sdg_alignment WHERE proposal_id=p_proposal_id ON CONFLICT DO NOTHING;
 INSERT INTO public.program_partner_links(program_id,partner_id,partner_role,created_by) SELECT new_program,partner_id,CASE WHEN partner_role='originating_proponent' THEN 'lead_implementer' ELSE 'co_implementer' END,auth.uid() FROM public.proposal_partner_links WHERE proposal_id=p_proposal_id ON CONFLICT DO NOTHING;
 INSERT INTO public.program_budget_revisions(program_id,revision_number,status,source_proposal_budget_revision_id,cash_total,in_kind_total,created_by) VALUES(new_program,1,'active',b.id,b.cash_total,b.in_kind_total,auth.uid()) RETURNING id INTO allocation;
 INSERT INTO public.program_budget_items(revision_id,source_proposal_item_id,category_id,item_kind,description,allocated_amount,sort_order) SELECT allocation,id,category_id,item_kind,description,CASE WHEN item_kind='cash' THEN amount ELSE coalesce(in_kind_valuation,amount) END,sort_order FROM public.proposal_budget_items WHERE revision_id=b.id;
 INSERT INTO public.proposal_workflow_events_v2(proposal_id,action,from_status,to_status,proposal_version_id,budget_revision_id,actor_id) VALUES(p_proposal_id,'program_handoff','approved','approved',p.active_version_id,b.id,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'proposal.v2.handoff','proposal',p_proposal_id::text,jsonb_build_object('program_id',new_program));
 RETURN QUERY SELECT new_handoff,new_program,now();
END;$function$;

REVOKE ALL ON FUNCTION public.phase2_capture_proposal_version(uuid,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_apply_proposal_action(uuid,text,integer,text,text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_handoff_proposal(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_apply_proposal_action(uuid,text,integer,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_handoff_proposal(uuid,integer) TO authenticated;
COMMIT;
