-- Structured proposal graph, immutable budget revisions, human-only workflow,
-- and frozen-snapshot program handoff.
BEGIN;

DROP INDEX IF EXISTS public.proposal_one_active_budget_revision;
CREATE UNIQUE INDEX proposal_one_editable_budget_revision ON public.proposal_budget_revisions(proposal_id)
 WHERE status IN('draft','submitted');

CREATE OR REPLACE FUNCTION public.phase2_guard_budget_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
 IF TG_OP='DELETE' OR OLD.status IN('returned','cleared','superseded') THEN
  RAISE EXCEPTION 'reviewed budget revision is immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_budget_snapshot(p_revision_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT jsonb_build_object(
  'revision',jsonb_build_object('id',r.id,'proposal_id',r.proposal_id,'revision_number',r.revision_number,'currency',r.currency,
    'zero_cash',r.zero_cash,'zero_cash_justification',r.zero_cash_justification,'source_revision_id',r.source_revision_id,
    'cash_total',r.cash_total::text,'in_kind_total',r.in_kind_total::text),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'category_id',i.category_id,'item_kind',i.item_kind,
    'description',i.description,'quantity',i.quantity::text,'unit',i.unit,'unit_cost',i.unit_cost::text,'amount',i.amount::text,
    'in_kind_valuation',CASE WHEN i.in_kind_valuation IS NULL THEN NULL ELSE i.in_kind_valuation::text END,'notes',i.notes,'sort_order',i.sort_order)
    ORDER BY i.sort_order,i.id) FROM public.proposal_budget_items i WHERE i.revision_id=r.id),'[]'::jsonb),
  'funding',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'source_type',f.source_type,'source_state',f.source_state,
    'partner_id',f.partner_id,'cash_value',f.cash_value::text,'in_kind_value',f.in_kind_value::text,'notes',f.notes) ORDER BY f.id)
    FROM public.proposal_budget_funding_sources f WHERE f.revision_id=r.id),'[]'::jsonb),
  'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'document_type',d.document_type,'sha256',d.sha256,
    'mime_type',d.mime_type,'size_bytes',d.size_bytes,'scan_status',d.scan_status) ORDER BY d.id)
    FROM public.proposal_budget_documents d WHERE d.revision_id=r.id),'[]'::jsonb)
 ) FROM public.proposal_budget_revisions r WHERE r.id=p_revision_id;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_recalculate_budget(p_revision_id uuid)
RETURNS TABLE(cash_total numeric,in_kind_total numeric,cash_funding numeric,in_kind_funding numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE revision public.proposal_budget_revisions;
BEGIN
 SELECT * INTO revision FROM public.proposal_budget_revisions WHERE id=p_revision_id FOR UPDATE;
 IF revision.id IS NULL THEN RAISE EXCEPTION 'budget revision not found' USING ERRCODE='P0002'; END IF;
 IF revision.status<>'draft' THEN RAISE EXCEPTION 'only draft budgets can be recalculated' USING ERRCODE='42501'; END IF;
 SELECT coalesce(sum(amount) FILTER(WHERE item_kind='cash'),0),coalesce(sum(coalesce(in_kind_valuation,amount)) FILTER(WHERE item_kind='in_kind'),0)
 INTO cash_total,in_kind_total FROM public.proposal_budget_items WHERE revision_id=p_revision_id;
 SELECT coalesce(sum(cash_value),0),coalesce(sum(in_kind_value),0) INTO cash_funding,in_kind_funding FROM public.proposal_budget_funding_sources WHERE revision_id=p_revision_id;
 UPDATE public.proposal_budget_revisions r SET cash_total=phase2_recalculate_budget.cash_total,in_kind_total=phase2_recalculate_budget.in_kind_total,
  row_version=row_version+1,updated_at=now() WHERE r.id=p_revision_id;
 RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_clone_budget_revision(p_proposal_id uuid,p_source_revision_id uuid,p_actor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE source public.proposal_budget_revisions; new_id uuid; next_number integer;
BEGIN
 SELECT * INTO source FROM public.proposal_budget_revisions WHERE id=p_source_revision_id AND proposal_id=p_proposal_id FOR UPDATE;
 IF source.id IS NULL THEN RAISE EXCEPTION 'source budget not found' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('proposal-budget:'||p_proposal_id::text,0));
 SELECT coalesce(max(revision_number),0)+1 INTO next_number FROM public.proposal_budget_revisions WHERE proposal_id=p_proposal_id;
 INSERT INTO public.proposal_budget_revisions(proposal_id,revision_number,status,currency,zero_cash,zero_cash_justification,source_revision_id,cash_total,in_kind_total,created_by)
 VALUES(p_proposal_id,next_number,'draft',source.currency,source.zero_cash,source.zero_cash_justification,source.id,source.cash_total,source.in_kind_total,p_actor_id) RETURNING id INTO new_id;
 INSERT INTO public.proposal_budget_items(revision_id,category_id,item_kind,description,quantity,unit,unit_cost,in_kind_valuation,notes,sort_order)
 SELECT new_id,category_id,item_kind,description,quantity,unit,unit_cost,in_kind_valuation,notes,sort_order FROM public.proposal_budget_items WHERE revision_id=source.id;
 INSERT INTO public.proposal_budget_funding_sources(revision_id,source_type,source_state,partner_id,cash_value,in_kind_value,notes)
 SELECT new_id,source_type,source_state,partner_id,cash_value,in_kind_value,notes FROM public.proposal_budget_funding_sources WHERE revision_id=source.id;
 UPDATE public.proposal_v2_profiles SET active_budget_revision_id=new_id,updated_at=now() WHERE proposal_id=p_proposal_id;
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_proposal_snapshot(p_proposal_id uuid,p_budget_revision_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT jsonb_build_object(
  'schema','agape.proposal.snapshot.v2',
  'proposal',(SELECT jsonb_build_object('id',q.id,'title',q.title,'description',q.rationale,'rationale',q.rationale,
    'objectives',q.objectives,'expected_output',q.expected_output,'created_by',q.created_by) FROM public.project_proposals q WHERE q.id=p_proposal_id),
  'profile',(SELECT jsonb_build_object('proposal_id',p.proposal_id,'workflow_status',p.workflow_status,'origin_channel',p.origin_channel,'originating_partner_id',p.originating_partner_id,
    'responsible_officer_id',p.responsible_officer_id,'project_category_id',p.project_category_id,'starts_on',p.starts_on,'ends_on',p.ends_on,
    'data_mode',p.data_mode) FROM public.proposal_v2_profiles p WHERE p.proposal_id=p_proposal_id),
  'targets',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.is_lead DESC,t.id) FROM public.proposal_target_areas t WHERE t.proposal_id=p_proposal_id),'[]'::jsonb),
  'needs',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.proposal_need_links_v2 n WHERE n.proposal_id=p_proposal_id),'[]'::jsonb),
  'beneficiaries',coalesce((SELECT jsonb_agg(to_jsonb(e)-'override_actor_id' ORDER BY e.id) FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=p_proposal_id),'[]'::jsonb),
  'sdgs',coalesce((SELECT jsonb_agg(jsonb_build_object('number',s.sdg_number,'indicator',s.indicator) ORDER BY s.sdg_number) FROM public.proposal_sdg_alignment s WHERE s.proposal_id=p_proposal_id),'[]'::jsonb),
  'partners',coalesce((SELECT jsonb_agg(jsonb_build_object('partner_id',l.partner_id,'role',l.partner_role) ORDER BY l.partner_role,l.partner_id) FROM public.proposal_partner_links l WHERE l.proposal_id=p_proposal_id),'[]'::jsonb),
  'budget',public.phase2_budget_snapshot(p_budget_revision_id)
 );
$function$;

CREATE OR REPLACE FUNCTION public.phase2_capture_proposal_version(p_proposal_id uuid,p_reason text,p_actor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE snapshot jsonb; version_no integer; new_id uuid; budget_id uuid;
BEGIN
 SELECT active_budget_revision_id INTO budget_id FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id FOR UPDATE;
 IF budget_id IS NULL THEN RAISE EXCEPTION 'proposal has no active budget' USING ERRCODE='23514'; END IF;
 snapshot:=public.phase2_proposal_snapshot(p_proposal_id,budget_id);
 SELECT coalesce(max(version_number),0)+1 INTO version_no FROM public.proposal_versions WHERE proposal_id=p_proposal_id;
 INSERT INTO public.proposal_versions(proposal_id,version_number,reason,snapshot,canonical_hash,created_by,budget_revision_id)
 VALUES(p_proposal_id,version_no,p_reason,snapshot,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),p_actor_id,budget_id) RETURNING id INTO new_id;
 UPDATE public.proposal_v2_profiles SET active_version_id=new_id WHERE proposal_id=p_proposal_id;
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_validate_proposal_graph(p_proposal_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE p public.proposal_v2_profiles; lead_count integer;
BEGIN
 SELECT * INTO p FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id;
 SELECT count(*) INTO lead_count FROM public.proposal_target_areas WHERE proposal_id=p_proposal_id AND is_lead;
 IF p.proposal_id IS NULL OR p.project_category_id IS NULL OR p.starts_on IS NULL OR p.ends_on IS NULL OR lead_count<>1
  OR NOT EXISTS(SELECT 1 FROM public.proposal_need_links_v2 WHERE proposal_id=p_proposal_id AND need_snapshot IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM public.proposal_beneficiary_estimates WHERE proposal_id=p_proposal_id)
  OR NOT EXISTS(SELECT 1 FROM public.proposal_sdg_alignment WHERE proposal_id=p_proposal_id AND sdg_number BETWEEN 1 AND 17)
 THEN RAISE EXCEPTION 'proposal graph is incomplete' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.proposal_target_areas a JOIN public.proposal_target_areas b ON b.proposal_id=a.proposal_id AND b.barangay_id=a.barangay_id AND b.id<>a.id WHERE a.proposal_id=p_proposal_id AND (a.sitio_id IS NULL OR b.sitio_id IS NULL)) THEN
  RAISE EXCEPTION 'barangay-wide and sitio-specific targets cannot coexist' USING ERRCODE='23514';
 END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_save_proposal_graph(p_proposal_id uuid,p_expected_version integer,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; v_proposal_id uuid; profile public.proposal_v2_profiles; budget public.proposal_budget_revisions; budget_id uuid; next_number integer;
DECLARE target jsonb; need jsonb; item jsonb; funding jsonb; category_value text; sdg_value text; target_id uuid; lead_barangay uuid; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('proposals');
 PERFORM public.phase2_assert_v2_write_authority('proposals',active_mode);
 IF NOT (public.phase2_current_has_capability('proposal.create') AND public.phase2_current_has_capability('budget.prepare')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['title','description','origin_channel','originating_partner_id','responsible_officer_id','project_category_id','starts_on','ends_on','targets','needs','beneficiary_category_codes','final_beneficiary_count','beneficiary_source_description','sdg_numbers','zero_cash','zero_cash_justification','budget_items','funding_sources']) THEN RAISE EXCEPTION 'unknown proposal graph field' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(p_payload->>'description',''))) NOT BETWEEN 1 AND 5000
  OR p_payload->>'origin_channel' NOT IN('paraya_internal','partner_document','barangay_referral') OR (p_payload->>'starts_on')::date>(p_payload->>'ends_on')::date
  OR jsonb_typeof(p_payload->'targets')<>'array' OR jsonb_array_length(p_payload->'targets')<1 OR jsonb_typeof(p_payload->'needs')<>'array'
  OR jsonb_typeof(p_payload->'budget_items')<>'array' OR jsonb_typeof(p_payload->'funding_sources')<>'array' THEN RAISE EXCEPTION 'invalid proposal graph' USING ERRCODE='22023'; END IF;
 IF p_payload->>'origin_channel'<>'paraya_internal' AND nullif(p_payload->>'originating_partner_id','') IS NULL THEN RAISE EXCEPTION 'non-internal origin requires a Partner' USING ERRCODE='23514'; END IF;
 IF nullif(p_payload->>'originating_partner_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_entities WHERE id=(p_payload->>'originating_partner_id')::uuid AND data_mode=active_mode AND lifecycle='active') THEN RAISE EXCEPTION 'originating Partner is outside the active data mode' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=(p_payload->>'responsible_officer_id')::uuid AND role IN('paraya_director','paraya_associate','paraya_researcher') AND status='active' AND is_active) THEN RAISE EXCEPTION 'responsible officer is invalid' USING ERRCODE='22023'; END IF;

 IF p_proposal_id IS NULL THEN
  INSERT INTO public.project_proposals(title,rationale,status,created_by,start_date,end_date)
  VALUES(btrim(p_payload->>'title'),btrim(p_payload->>'description'),'draft',auth.uid(),(p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date) RETURNING id INTO v_proposal_id;
  INSERT INTO public.proposal_v2_profiles(proposal_id,workflow_status,origin_channel,originating_partner_id,responsible_officer_id,project_category_id,starts_on,ends_on,data_mode)
  VALUES(v_proposal_id,'draft',p_payload->>'origin_channel',nullif(p_payload->>'originating_partner_id','')::uuid,(p_payload->>'responsible_officer_id')::uuid,(p_payload->>'project_category_id')::uuid,(p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date,active_mode)
  RETURNING * INTO profile;
 ELSE
  v_proposal_id:=p_proposal_id; PERFORM public.phase2_assert_runtime('proposals',v_proposal_id);
  SELECT * INTO profile FROM public.proposal_v2_profiles p WHERE p.proposal_id=v_proposal_id FOR UPDATE;
  IF profile.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale proposal version' USING ERRCODE='40001'; END IF;
  IF profile.workflow_status NOT IN('draft','revisions_requested') THEN RAISE EXCEPTION 'proposal is not editable' USING ERRCODE='42501'; END IF;
  UPDATE public.project_proposals SET title=btrim(p_payload->>'title'),rationale=btrim(p_payload->>'description'),start_date=(p_payload->>'starts_on')::date,end_date=(p_payload->>'ends_on')::date,updated_at=now() WHERE id=v_proposal_id;
  UPDATE public.proposal_v2_profiles SET origin_channel=p_payload->>'origin_channel',originating_partner_id=nullif(p_payload->>'originating_partner_id','')::uuid,
   responsible_officer_id=(p_payload->>'responsible_officer_id')::uuid,project_category_id=(p_payload->>'project_category_id')::uuid,
   starts_on=(p_payload->>'starts_on')::date,ends_on=(p_payload->>'ends_on')::date,row_version=row_version+1,updated_at=now() WHERE proposal_v2_profiles.proposal_id=v_proposal_id RETURNING * INTO profile;
 END IF;

 DELETE FROM public.proposal_need_links_v2 n WHERE n.proposal_id=v_proposal_id;
 DELETE FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=v_proposal_id;
 DELETE FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id;
 DELETE FROM public.proposal_sdg_alignment s WHERE s.proposal_id=v_proposal_id;
 DELETE FROM public.proposal_partner_links l WHERE l.proposal_id=v_proposal_id;

 FOR target IN SELECT value FROM jsonb_array_elements(p_payload->'targets') LOOP
  IF NOT public.phase1_json_object_has_only(target,ARRAY['barangay_id','sitio_id','is_lead']) THEN RAISE EXCEPTION 'unknown target field' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=(target->>'barangay_id')::uuid AND b.is_synthetic_test=(active_mode='synthetic')) THEN RAISE EXCEPTION 'target barangay is outside the active data mode' USING ERRCODE='42501'; END IF;
  IF nullif(target->>'sitio_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.barangay_sitios s WHERE s.id=(target->>'sitio_id')::uuid AND s.barangay_id=(target->>'barangay_id')::uuid) THEN RAISE EXCEPTION 'sitio does not belong to target barangay' USING ERRCODE='23514'; END IF;
  INSERT INTO public.proposal_target_areas(proposal_id,barangay_id,sitio_id,is_lead) VALUES(v_proposal_id,(target->>'barangay_id')::uuid,nullif(target->>'sitio_id','')::uuid,coalesce((target->>'is_lead')::boolean,false));
 END LOOP;
 SELECT t.barangay_id INTO lead_barangay FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id AND t.is_lead;
 IF lead_barangay IS NULL OR (SELECT count(*) FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id AND t.is_lead)<>1 THEN RAISE EXCEPTION 'exactly one lead target is required' USING ERRCODE='23514'; END IF;

 FOR need IN SELECT value FROM jsonb_array_elements(p_payload->'needs') LOOP
  IF NOT public.phase1_json_object_has_only(need,ARRAY['need_id','target_area_key','intended_coverage','planned_beneficiary_count','planned_beneficiary_percentage','notes']) THEN RAISE EXCEPTION 'unknown need field' USING ERRCODE='22023'; END IF;
  SELECT t.id INTO target_id FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id AND (t.barangay_id::text||':'||coalesce(t.sitio_id::text,'all'))=need->>'target_area_key';
  IF target_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.community_needs n JOIN public.proposal_target_areas t ON t.id=target_id WHERE n.id=(need->>'need_id')::uuid AND n.approval_status='approved' AND n.barangay_id=t.barangay_id) THEN RAISE EXCEPTION 'need is not approved for the selected target' USING ERRCODE='23514'; END IF;
  INSERT INTO public.proposal_need_links_v2(proposal_id,need_id,target_area_id,intended_coverage,planned_beneficiary_count,planned_beneficiary_percentage,notes,need_snapshot)
  SELECT v_proposal_id,n.id,target_id,need->>'intended_coverage',nullif(need->>'planned_beneficiary_count','')::int,nullif(need->>'planned_beneficiary_percentage','')::numeric,nullif(need->>'notes',''),
   jsonb_build_object('id',n.id,'title',n.title,'priority',n.priority,'approval_status',n.approval_status,'category',n.category,'barangay_id',n.barangay_id)
  FROM public.community_needs n WHERE n.id=(need->>'need_id')::uuid;
 END LOOP;

 FOR category_value IN SELECT jsonb_array_elements_text(p_payload->'beneficiary_category_codes') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.proposal_beneficiary_categories WHERE code=category_value AND is_active) THEN RAISE EXCEPTION 'unknown beneficiary category' USING ERRCODE='22023'; END IF;
  INSERT INTO public.proposal_beneficiary_estimates(proposal_id,category_code,target_area_id,calculated_count,is_suppressed,final_count,source_description,source_metadata,as_of_date)
  VALUES(v_proposal_id,category_value,(SELECT t.id FROM public.proposal_target_areas t WHERE t.proposal_id=v_proposal_id AND t.is_lead),NULL,false,(p_payload->>'final_beneficiary_count')::int,
   nullif(btrim(p_payload->>'beneficiary_source_description'),''),jsonb_build_object('kind','manual_fallback','non_additive_categories',true),current_date);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=v_proposal_id) OR length(btrim(coalesce(p_payload->>'beneficiary_source_description','')))<10 THEN RAISE EXCEPTION 'manual beneficiary count requires categories and a source description' USING ERRCODE='23514'; END IF;

 FOR sdg_value IN SELECT jsonb_array_elements_text(p_payload->'sdg_numbers') LOOP
  IF sdg_value::int NOT BETWEEN 1 AND 17 THEN RAISE EXCEPTION 'invalid SDG' USING ERRCODE='22023'; END IF;
  INSERT INTO public.proposal_sdg_alignment(proposal_id,sdg_number,indicator) VALUES(v_proposal_id,sdg_value::int,NULL) ON CONFLICT DO NOTHING;
 END LOOP;
 IF nullif(p_payload->>'originating_partner_id','') IS NOT NULL THEN INSERT INTO public.proposal_partner_links(proposal_id,partner_id,partner_role,created_by) VALUES(v_proposal_id,(p_payload->>'originating_partner_id')::uuid,'originating_proponent',auth.uid()); END IF;

 SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=profile.active_budget_revision_id FOR UPDATE;
 IF budget.id IS NULL OR budget.status<>'draft' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('proposal-budget:'||v_proposal_id::text,0));
  SELECT coalesce(max(r.revision_number),0)+1 INTO next_number FROM public.proposal_budget_revisions r WHERE r.proposal_id=v_proposal_id;
  INSERT INTO public.proposal_budget_revisions(proposal_id,revision_number,status,zero_cash,zero_cash_justification,source_revision_id,created_by)
  VALUES(v_proposal_id,next_number,'draft',coalesce((p_payload->>'zero_cash')::boolean,false),nullif(p_payload->>'zero_cash_justification',''),budget.id,auth.uid()) RETURNING id INTO budget_id;
 ELSE
  budget_id:=budget.id; DELETE FROM public.proposal_budget_items WHERE revision_id=budget_id; DELETE FROM public.proposal_budget_funding_sources WHERE revision_id=budget_id;
  UPDATE public.proposal_budget_revisions SET zero_cash=coalesce((p_payload->>'zero_cash')::boolean,false),zero_cash_justification=nullif(p_payload->>'zero_cash_justification',''),updated_at=now() WHERE id=budget_id;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'budget_items') LOOP
  IF NOT public.phase1_json_object_has_only(item,ARRAY['category_id','item_kind','description','quantity','unit','unit_cost','in_kind_valuation','notes','sort_order']) THEN RAISE EXCEPTION 'unknown budget item field' USING ERRCODE='22023'; END IF;
  IF item->>'item_kind' NOT IN('cash','in_kind') OR (item->>'quantity')::numeric<=0 OR (item->>'unit_cost')::numeric<0
    OR (item->>'item_kind'='in_kind' AND nullif(item->>'in_kind_valuation','') IS NULL) THEN RAISE EXCEPTION 'invalid budget item' USING ERRCODE='22023'; END IF;
  INSERT INTO public.proposal_budget_items(revision_id,category_id,item_kind,description,quantity,unit,unit_cost,in_kind_valuation,notes,sort_order)
  VALUES(budget_id,(item->>'category_id')::uuid,item->>'item_kind',btrim(item->>'description'),(item->>'quantity')::numeric,btrim(item->>'unit'),(item->>'unit_cost')::numeric,nullif(item->>'in_kind_valuation','')::numeric,nullif(item->>'notes',''),coalesce((item->>'sort_order')::int,0));
 END LOOP;
 FOR funding IN SELECT value FROM jsonb_array_elements(p_payload->'funding_sources') LOOP
  IF NOT public.phase1_json_object_has_only(funding,ARRAY['source_type','source_state','partner_id','cash_value','in_kind_value','notes']) THEN RAISE EXCEPTION 'unknown funding field' USING ERRCODE='22023'; END IF;
  INSERT INTO public.proposal_budget_funding_sources(revision_id,source_type,source_state,partner_id,cash_value,in_kind_value,notes)
  VALUES(budget_id,funding->>'source_type',funding->>'source_state',nullif(funding->>'partner_id','')::uuid,(funding->>'cash_value')::numeric,(funding->>'in_kind_value')::numeric,nullif(funding->>'notes',''));
 END LOOP;
 PERFORM public.phase2_recalculate_budget(budget_id);
 IF coalesce((p_payload->>'zero_cash')::boolean,false) AND NOT EXISTS(SELECT 1 FROM public.proposal_budget_items WHERE revision_id=budget_id AND item_kind='in_kind') THEN RAISE EXCEPTION 'zero-cash budget requires in-kind resources' USING ERRCODE='23514'; END IF;
 UPDATE public.proposal_v2_profiles SET active_budget_revision_id=budget_id WHERE proposal_v2_profiles.proposal_id=v_proposal_id;
 UPDATE public.project_proposals SET barangay_id=lead_barangay,target_beneficiaries=array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_payload->'beneficiary_category_codes')),', '),expected_beneficiary_count=(p_payload->>'final_beneficiary_count')::int,budget=(SELECT cash_total FROM public.proposal_budget_revisions WHERE id=budget_id),updated_at=now() WHERE id=v_proposal_id;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,CASE WHEN p_proposal_id IS NULL THEN 'proposal.v2.create' ELSE 'proposal.v2.update' END,'proposal',v_proposal_id::text,jsonb_build_object('budget_revision_id',budget_id));
 RETURN v_proposal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('proposals',p_proposal_id);
 IF NOT public.phase2_current_has_capability('proposal.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',q.id,'title',q.title,'description',q.rationale,'status',p.workflow_status,
  'originChannel',p.origin_channel,'originatingPartnerId',p.originating_partner_id,'responsibleOfficerId',p.responsible_officer_id,
  'projectCategoryId',p.project_category_id,'startsOn',p.starts_on,'endsOn',p.ends_on,'rowVersion',p.row_version,
  'targets',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.is_lead DESC,t.id) FROM public.proposal_target_areas t WHERE t.proposal_id=q.id),'[]'::jsonb),
  'needs',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.proposal_need_links_v2 n WHERE n.proposal_id=q.id),'[]'::jsonb),
  'beneficiaries',coalesce((SELECT jsonb_agg(to_jsonb(e)-'override_actor_id' ORDER BY e.id) FROM public.proposal_beneficiary_estimates e WHERE e.proposal_id=q.id),'[]'::jsonb),
  'sdgs',coalesce((SELECT jsonb_agg(s.sdg_number ORDER BY s.sdg_number) FROM public.proposal_sdg_alignment s WHERE s.proposal_id=q.id),'[]'::jsonb),
  'budget',public.phase2_budget_snapshot(p.active_budget_revision_id),
  'activeVersion',(SELECT jsonb_build_object('id',v.id,'versionNumber',v.version_number,'canonicalHash',v.canonical_hash,'reason',v.reason,'createdAt',v.created_at) FROM public.proposal_versions v WHERE v.id=p.active_version_id)
 ) INTO result FROM public.project_proposals q JOIN public.proposal_v2_profiles p ON p.proposal_id=q.id WHERE q.id=p_proposal_id;
 IF result IS NULL THEN RAISE EXCEPTION 'proposal not found' USING ERRCODE='P0002'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'proposal.v2.read','proposal',p_proposal_id::text);
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_finance_proposals()
RETURNS TABLE(proposal_id uuid,title text,workflow_status text,row_version integer,budget_revision_id uuid,budget_revision_number integer,budget_status text,cash_total text,in_kind_total text,zero_cash boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('proposals');
 IF NOT (public.phase2_current_has_capability('budget.read') AND public.phase2_current_has_capability('budget.review')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.proposal_id,q.title,p.workflow_status,p.row_version,r.id,r.revision_number,r.status,r.cash_total::text,r.in_kind_total::text,r.zero_cash
 FROM public.proposal_v2_profiles p JOIN public.project_proposals q ON q.id=p.proposal_id
 JOIN public.proposal_budget_revisions r ON r.id=p.active_budget_revision_id
 WHERE p.data_mode=active_mode AND p.workflow_status IN('finance_review','revisions_requested','director_review')
 ORDER BY q.updated_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_apply_proposal_action(p_proposal_id uuid,p_action text,p_expected_version integer,p_remarks text DEFAULT NULL,p_warning_codes text[] DEFAULT '{}')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE p public.proposal_v2_profiles; budget public.proposal_budget_revisions; next_status text; version_id uuid; new_budget_id uuid; actor_email text;
DECLARE totals record; frozen jsonb; frozen_hash text; finance_mode text;
BEGIN
 PERFORM public.phase2_assert_runtime('proposals',p_proposal_id);
 SELECT * INTO p FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id FOR UPDATE;
 PERFORM public.phase2_assert_v2_write_authority('proposals',p.data_mode);
 IF p.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale proposal version' USING ERRCODE='40001'; END IF;
 SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=p.active_budget_revision_id FOR UPDATE;
 IF p_action='submit' THEN
  IF NOT public.phase2_current_has_capability('proposal.submit') OR p.workflow_status NOT IN('draft','revisions_requested') OR budget.status<>'draft' THEN RAISE EXCEPTION 'invalid submit transition' USING ERRCODE='42501'; END IF;
  PERFORM public.phase2_validate_proposal_graph(p_proposal_id);
  SELECT * INTO totals FROM public.phase2_recalculate_budget(budget.id);
  IF totals.cash_total<>totals.cash_funding OR totals.in_kind_total<>totals.in_kind_funding THEN RAISE EXCEPTION 'cash and in-kind funding must reconcile with planned items' USING ERRCODE='23514'; END IF;
  frozen:=public.phase2_budget_snapshot(budget.id); frozen_hash:=encode(extensions.digest(convert_to(frozen::text,'UTF8'),'sha256'),'hex');
  UPDATE public.proposal_budget_revisions SET status='submitted',frozen_snapshot=frozen,canonical_hash=frozen_hash,submitted_by=auth.uid(),submitted_at=now(),row_version=row_version+1,updated_at=now() WHERE id=budget.id;
  next_status:=CASE WHEN p.workflow_status='draft' THEN 'submitted' ELSE coalesce(p.return_stage,'pre_screening') END;
 ELSIF p_action='pass_pre_screening' THEN
  IF NOT public.phase2_current_has_capability('proposal.review') OR p.workflow_status NOT IN('submitted','pre_screening') THEN RAISE EXCEPTION 'invalid pre-screen transition' USING ERRCODE='42501'; END IF;
  next_status:=CASE WHEN p.workflow_status='submitted' THEN 'pre_screening' ELSE 'evidence_review' END;
 ELSIF p_action='confirm_evidence' THEN
  IF NOT public.phase2_current_has_capability('proposal.evidence.confirm') OR p.workflow_status<>'evidence_review' THEN RAISE EXCEPTION 'invalid evidence transition' USING ERRCODE='42501'; END IF; next_status:='finance_review';
 ELSIF p_action='request_revision' THEN
  IF NOT public.phase2_current_has_capability('proposal.review') OR p.workflow_status NOT IN('pre_screening','evidence_review','director_review') OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid revision request' USING ERRCODE='42501'; END IF;
  IF budget.status='submitted' THEN UPDATE public.proposal_budget_revisions SET status='returned',row_version=row_version+1,updated_at=now() WHERE id=budget.id; END IF;
  new_budget_id:=public.phase2_clone_budget_revision(p_proposal_id,budget.id,auth.uid());
  next_status:='revisions_requested'; UPDATE public.proposal_v2_profiles SET return_stage=CASE WHEN p.workflow_status='director_review' THEN 'finance_review' ELSE p.workflow_status END WHERE proposal_id=p_proposal_id;
 ELSIF p_action='finance_return' THEN
  finance_mode:=public.phase2_assert_actor_runtime('program_finance');
  IF finance_mode<>p.data_mode THEN RAISE EXCEPTION 'Finance component data mode does not match proposal' USING ERRCODE='42501'; END IF;
  IF NOT public.phase2_current_has_capability('budget.review') OR p.workflow_status<>'finance_review' OR budget.status<>'submitted' OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid finance return' USING ERRCODE='42501'; END IF;
  UPDATE public.proposal_budget_revisions SET status='returned',row_version=row_version+1,updated_at=now() WHERE id=budget.id;
  new_budget_id:=public.phase2_clone_budget_revision(p_proposal_id,budget.id,auth.uid());
  INSERT INTO public.budget_review_events(proposal_id,revision_id,action,remarks,actor_id) VALUES(p_proposal_id,budget.id,'returned',p_remarks,auth.uid());
  next_status:='revisions_requested'; UPDATE public.proposal_v2_profiles SET return_stage='finance_review' WHERE proposal_id=p_proposal_id;
 ELSIF p_action='finance_clear' THEN
  finance_mode:=public.phase2_assert_actor_runtime('program_finance');
  IF finance_mode<>p.data_mode THEN RAISE EXCEPTION 'Finance component data mode does not match proposal' USING ERRCODE='42501'; END IF;
  IF NOT public.phase2_current_has_capability('budget.review') OR p.workflow_status<>'finance_review' OR budget.status<>'submitted' THEN RAISE EXCEPTION 'invalid finance clearance' USING ERRCODE='42501'; END IF;
  frozen:=public.phase2_budget_snapshot(budget.id); frozen_hash:=encode(extensions.digest(convert_to(frozen::text,'UTF8'),'sha256'),'hex');
  IF budget.frozen_snapshot IS NULL OR budget.frozen_snapshot<>frozen OR budget.canonical_hash<>frozen_hash THEN RAISE EXCEPTION 'submitted budget snapshot changed before Finance clearance' USING ERRCODE='23514'; END IF;
  UPDATE public.proposal_budget_revisions SET status='cleared',cleared_by=auth.uid(),cleared_at=now(),row_version=row_version+1,updated_at=now() WHERE id=budget.id;
  INSERT INTO public.budget_review_events(proposal_id,revision_id,action,remarks,actor_id) VALUES(p_proposal_id,budget.id,'cleared',p_remarks,auth.uid()); next_status:='director_review';
 ELSIF p_action IN('director_approve','director_reject') THEN
  IF NOT public.phase2_current_has_capability('proposal.decide') OR p.workflow_status<>'director_review' OR budget.status<>'cleared' THEN RAISE EXCEPTION 'invalid Director decision' USING ERRCODE='42501'; END IF;
  IF p_action='director_reject' AND length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'rejection remarks are required' USING ERRCODE='22023'; END IF;
  next_status:=CASE WHEN p_action='director_approve' THEN 'approved' ELSE 'rejected' END;
 ELSE RAISE EXCEPTION 'unknown workflow action' USING ERRCODE='22023'; END IF;
 UPDATE public.proposal_v2_profiles SET workflow_status=next_status,row_version=row_version+1,updated_at=now() WHERE proposal_id=p_proposal_id;
 IF p_action IN('submit','finance_clear','director_approve','director_reject') THEN
  version_id:=public.phase2_capture_proposal_version(p_proposal_id,CASE p_action WHEN 'submit' THEN CASE WHEN p.workflow_status='draft' THEN 'submission' ELSE 'resubmission' END WHEN 'finance_clear' THEN 'finance_clearance' ELSE 'final_decision' END,auth.uid());
 END IF;
 INSERT INTO public.proposal_workflow_events_v2(proposal_id,action,from_status,to_status,proposal_version_id,budget_revision_id,warning_acknowledgements,remarks,actor_id)
 VALUES(p_proposal_id,p_action,p.workflow_status,next_status,coalesce(version_id,p.active_version_id),coalesce(new_budget_id,budget.id),to_jsonb(coalesce(p_warning_codes,'{}')),p_remarks,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'proposal.v2.'||p_action,'proposal',p_proposal_id::text,jsonb_build_object('from',p.workflow_status,'to',next_status));
 RETURN next_status;
END;
$function$;

-- Handoff uses only the immutable final proposal snapshot and its exact cleared
-- budget snapshot. The proposal lock precedes the idempotency check.
CREATE OR REPLACE FUNCTION public.phase2_handoff_proposal(p_proposal_id uuid,p_expected_version integer)
RETURNS TABLE(handoff_id uuid,program_id uuid,created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE p public.proposal_v2_profiles; version public.proposal_versions; budget public.proposal_budget_revisions; existing public.program_handoffs; snap jsonb; new_program uuid; new_handoff uuid; allocation uuid; lead jsonb; actor_email text; row_item jsonb;
BEGIN
 PERFORM public.phase2_assert_runtime('proposals',p_proposal_id);
 IF NOT public.phase2_current_has_capability('proposal.handoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.proposal_v2_profiles WHERE proposal_id=p_proposal_id FOR UPDATE;
 PERFORM public.phase2_assert_v2_write_authority('proposals',p.data_mode);
 SELECT * INTO existing FROM public.program_handoffs WHERE proposal_id=p_proposal_id;
 IF existing.id IS NOT NULL THEN RETURN QUERY SELECT existing.id,existing.program_id,existing.created_at; RETURN; END IF;
 IF p.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale proposal version' USING ERRCODE='40001'; END IF;
 SELECT * INTO version FROM public.proposal_versions WHERE id=p.active_version_id AND proposal_id=p_proposal_id;
 SELECT * INTO budget FROM public.proposal_budget_revisions WHERE id=version.budget_revision_id AND proposal_id=p_proposal_id;
 IF p.workflow_status<>'approved' OR version.reason<>'final_decision' OR budget.status<>'cleared' OR budget.frozen_snapshot IS NULL THEN RAISE EXCEPTION 'proposal is not ready for handoff' USING ERRCODE='23514'; END IF;
 snap:=version.snapshot; SELECT value INTO lead FROM jsonb_array_elements(snap->'targets') WHERE coalesce((value->>'is_lead')::boolean,false) LIMIT 1;
 IF lead IS NULL THEN RAISE EXCEPTION 'approved snapshot has no lead target' USING ERRCODE='23514'; END IF;
 INSERT INTO public.programs(proposal_id,title,description,barangay_id,start_date,end_date,status,budget_allocated,budget_spent,created_by,phase2_data_mode,phase2_responsible_officer_id)
 VALUES(p_proposal_id,snap#>>'{proposal,title}',coalesce(snap#>>'{proposal,description}',snap#>>'{proposal,rationale}'),(lead->>'barangay_id')::uuid,(snap#>>'{profile,starts_on}')::date,(snap#>>'{profile,ends_on}')::date,'planning',(budget.frozen_snapshot#>>'{revision,cash_total}')::numeric,0,auth.uid(),p.data_mode,p.responsible_officer_id) RETURNING id INTO new_program;
 INSERT INTO public.program_handoffs(proposal_id,proposal_version_id,budget_revision_id,program_id,handed_off_by) VALUES(p_proposal_id,version.id,budget.id,new_program,auth.uid()) RETURNING id INTO new_handoff;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'targets') LOOP INSERT INTO public.program_target_areas_v2(program_id,source_target_area_id,barangay_id,sitio_id,is_lead) VALUES(new_program,(row_item->>'id')::uuid,(row_item->>'barangay_id')::uuid,nullif(row_item->>'sitio_id','')::uuid,coalesce((row_item->>'is_lead')::boolean,false)); END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'needs') LOOP INSERT INTO public.program_need_links_v2(program_id,source_proposal_need_link_id,need_id,intended_coverage,need_snapshot) VALUES(new_program,(row_item->>'id')::uuid,(row_item->>'need_id')::uuid,row_item->>'intended_coverage',row_item->'need_snapshot'); END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'beneficiaries') LOOP INSERT INTO public.program_beneficiary_plans_v2(program_id,source_estimate_id,category_code,planned_count,provenance) VALUES(new_program,(row_item->>'id')::uuid,row_item->>'category_code',(row_item->>'final_count')::int,row_item->'source_metadata'); END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'sdgs') LOOP INSERT INTO public.program_sdg_links_v2(program_id,sdg_number) VALUES(new_program,(row_item->>'number')::smallint) ON CONFLICT DO NOTHING; END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(snap->'partners') LOOP INSERT INTO public.program_partner_links(program_id,partner_id,partner_role,created_by) VALUES(new_program,(row_item->>'partner_id')::uuid,CASE WHEN row_item->>'role'='originating_proponent' THEN 'lead_implementer' ELSE 'co_implementer' END,auth.uid()) ON CONFLICT DO NOTHING; END LOOP;
 INSERT INTO public.program_budget_revisions(program_id,revision_number,status,source_proposal_budget_revision_id,cash_total,in_kind_total,created_by) VALUES(new_program,1,'active',budget.id,(budget.frozen_snapshot#>>'{revision,cash_total}')::numeric,(budget.frozen_snapshot#>>'{revision,in_kind_total}')::numeric,auth.uid()) RETURNING id INTO allocation;
 FOR row_item IN SELECT value FROM jsonb_array_elements(budget.frozen_snapshot->'items') LOOP INSERT INTO public.program_budget_items(revision_id,source_proposal_item_id,category_id,item_kind,description,allocated_amount,sort_order) VALUES(allocation,(row_item->>'id')::uuid,(row_item->>'category_id')::uuid,row_item->>'item_kind',row_item->>'description',CASE WHEN row_item->>'item_kind'='cash' THEN (row_item->>'amount')::numeric ELSE coalesce(nullif(row_item->>'in_kind_valuation','')::numeric,(row_item->>'amount')::numeric) END,(row_item->>'sort_order')::int); END LOOP;
 INSERT INTO public.proposal_workflow_events_v2(proposal_id,action,from_status,to_status,proposal_version_id,budget_revision_id,actor_id) VALUES(p_proposal_id,'program_handoff','approved','approved',version.id,budget.id,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'proposal.v2.handoff','proposal',p_proposal_id::text,jsonb_build_object('program_id',new_program,'proposal_version_id',version.id,'budget_revision_id',budget.id));
 RETURN QUERY SELECT new_handoff,new_program,now();
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_budget_snapshot(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_recalculate_budget(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_clone_budget_revision(uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_proposal_snapshot(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_capture_proposal_version(uuid,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_validate_proposal_graph(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_save_proposal_graph(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_proposal(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_finance_proposals() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_apply_proposal_action(uuid,text,integer,text,text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_handoff_proposal(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_save_proposal_graph(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_finance_proposals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_apply_proposal_action(uuid,text,integer,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_handoff_proposal(uuid,integer) TO authenticated;

COMMIT;
