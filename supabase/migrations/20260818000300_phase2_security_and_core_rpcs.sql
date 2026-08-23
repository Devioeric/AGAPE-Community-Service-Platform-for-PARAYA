-- Phase 2 reviewed RPC boundary and SQL/TypeScript capability parity.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase2_permission_module(p_capability text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_capability LIKE 'partner.document.%' THEN 'partner_documents'
  WHEN p_capability LIKE 'partner.%' OR p_capability LIKE 'partnership.%' THEN 'partnerships'
  WHEN p_capability LIKE 'historical_program.%' THEN 'historical_programs'
  WHEN p_capability LIKE 'budget.%' THEN 'budgets'
  ELSE public.phase1_permission_module(p_capability) END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
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
  ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_current_has_capability(p_capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.status='active' AND u.is_active IS TRUE
  AND public.phase2_role_has_capability(u.role,p_capability)
  AND coalesce((u.permissions->>public.phase2_permission_module(p_capability))::boolean,true) IS NOT FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.phase2_configure_component(
 p_component text,p_mode text,p_synthetic_user_ids uuid[] DEFAULT '{}',p_synthetic_entity_ids uuid[] DEFAULT '{}',
 p_implementation_date date DEFAULT NULL,p_configuration jsonb DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NOT public.phase2_current_has_capability(CASE WHEN p_component='historical_programs' THEN 'historical_program.review' ELSE 'partner.policy.manage' END)
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_mode NOT IN('off','synthetic','live') THEN RAISE EXCEPTION 'invalid mode' USING ERRCODE='22023'; END IF;
 IF p_mode='live' AND p_component='historical_programs' AND p_implementation_date IS NULL THEN RAISE EXCEPTION 'implementation date is required' USING ERRCODE='22023'; END IF;
 UPDATE public.phase2_component_runtime SET mode=p_mode,synthetic_user_ids=coalesce(p_synthetic_user_ids,'{}'),synthetic_entity_ids=coalesce(p_synthetic_entity_ids,'{}'),
  implementation_date=p_implementation_date,configuration=coalesce(p_configuration,'{}'),updated_by=auth.uid(),updated_at=now() WHERE component=p_component;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,level,metadata)
 VALUES(auth.uid(),'phase2.runtime.configure','phase2_component_runtime',p_component,'warning',jsonb_build_object('mode',p_mode));
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_partners() RETURNS TABLE(
 id uuid,code text,name text,legal_name text,entity_type text,classification text,lifecycle text,barangay_id uuid,row_version integer,
 roles text[],term_status text,derived_term_status text,starts_on date,expires_on date
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users;
BEGIN
 PERFORM public.phase2_assert_runtime('partners');
 IF NOT public.phase2_current_has_capability('partnership.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE public.users.id=auth.uid();
 RETURN QUERY SELECT p.id,p.code,p.name,p.legal_name,p.entity_type,p.classification,p.lifecycle,p.barangay_id,p.row_version,
  ARRAY(SELECT r.role FROM public.partner_entity_roles r WHERE r.partner_id=p.id ORDER BY r.role),
  t.status,
  CASE WHEN t.status='active' AND t.expires_on<current_date THEN 'expired'
       WHEN t.status='active' AND t.expires_on<=current_date+60 THEN 'expiring_soon' ELSE t.status END,
  t.starts_on,t.expires_on
 FROM public.partner_entities p
 LEFT JOIN LATERAL(SELECT pt.* FROM public.partnership_terms pt WHERE pt.partner_id=p.id AND pt.status IN('proposed','active','suspended') ORDER BY pt.created_at DESC LIMIT 1)t ON true
 WHERE actor.role IN('paraya_director','paraya_associate','paraya_researcher') OR p.barangay_id=actor.barangay_id
 ORDER BY p.name;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_create_partner(p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; role_name text; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners');
 IF NOT public.phase2_current_has_capability('partnership.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['name','legal_name','entity_type','classification','roles','barangay_id']) THEN RAISE EXCEPTION 'unknown partner field' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 160 OR p_payload->>'entity_type' NOT IN('barangay','dyci_office','student_organization','academic_department','external_organization','government_agency','school','faith_based','other') OR p_payload->>'classification' NOT IN('internal','external') THEN RAISE EXCEPTION 'invalid partner payload' USING ERRCODE='22023'; END IF;
 INSERT INTO public.partner_entities(name,legal_name,entity_type,classification,barangay_id,created_by)
 VALUES(p_payload->>'name',nullif(p_payload->>'legal_name',''),p_payload->>'entity_type',p_payload->>'classification',nullif(p_payload->>'barangay_id','')::uuid,auth.uid()) RETURNING id INTO new_id;
 FOR role_name IN SELECT jsonb_array_elements_text(coalesce(p_payload->'roles','[]')) LOOP
  IF role_name NOT IN('partner','proponent') THEN RAISE EXCEPTION 'invalid entity role' USING ERRCODE='22023'; END IF;
  INSERT INTO public.partner_entity_roles(partner_id,role,created_by) VALUES(new_id,role_name,auth.uid());
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.partner_entity_roles WHERE partner_id=new_id) THEN RAISE EXCEPTION 'at least one entity role is required' USING ERRCODE='22023'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'partner.create','partner_entity',new_id::text,jsonb_build_object('entity_type',p_payload->>'entity_type'));
 INSERT INTO public.partnership_events(partner_id,event_type,actor_id,snapshot) VALUES(new_id,'partner_created',auth.uid(),jsonb_build_object('name',p_payload->>'name'));
 RETURN new_id;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_create_historical_program(p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid; impl date; years_back int; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['title','summary','category','date_precision','starts_on','ends_on','beneficiary_count','volunteer_count','volunteer_hours','budget_total','currency','resources','historical_need_description','outcomes','follow_up','source_type','source_notes','partner_ids','barangay_ids','sdg_numbers']) THEN RAISE EXCEPTION 'unknown historical field' USING ERRCODE='22023'; END IF;
 SELECT implementation_date,retrospective_years INTO impl,years_back FROM public.phase2_component_runtime WHERE component='historical_programs';
 IF impl IS NULL THEN RAISE EXCEPTION 'implementation date is not configured' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 160 OR p_payload->>'date_precision' NOT IN('exact','month','year','unknown') OR p_payload->>'source_type' NOT IN('excel','word','pdf','paper','database','other') THEN RAISE EXCEPTION 'invalid historical payload' USING ERRCODE='22023'; END IF;
 IF nullif(p_payload->>'starts_on','')::date < impl-make_interval(years=>years_back) OR nullif(p_payload->>'starts_on','')::date >= impl THEN RAISE EXCEPTION 'program is outside the retrospective window' USING ERRCODE='22023'; END IF;
 INSERT INTO public.historical_programs(title,summary,category,date_precision,starts_on,ends_on,beneficiary_count,volunteer_count,volunteer_hours,budget_total,currency,resources,historical_need_description,outcomes,follow_up,source_type,source_notes,created_by)
 VALUES(p_payload->>'title',p_payload->>'summary',p_payload->>'category',p_payload->>'date_precision',nullif(p_payload->>'starts_on','')::date,nullif(p_payload->>'ends_on','')::date,nullif(p_payload->>'beneficiary_count','')::int,nullif(p_payload->>'volunteer_count','')::int,nullif(p_payload->>'volunteer_hours','')::numeric,nullif(p_payload->>'budget_total','')::numeric,coalesce(p_payload->>'currency','PHP'),p_payload->>'resources',p_payload->>'historical_need_description',p_payload->>'outcomes',p_payload->>'follow_up',p_payload->>'source_type',p_payload->>'source_notes',auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.historical_program_events(historical_program_id,action,to_status,actor_id) VALUES(new_id,'created','draft',auth.uid());
 INSERT INTO public.historical_program_partner_links(historical_program_id,partner_id)
 SELECT new_id,value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'partner_ids','[]')) j(value)
 WHERE EXISTS(SELECT 1 FROM public.partner_entities p WHERE p.id=value::uuid);
 INSERT INTO public.historical_program_barangay_links(historical_program_id,barangay_id)
 SELECT new_id,value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'barangay_ids','[]')) j(value)
 WHERE EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=value::uuid);
 INSERT INTO public.historical_program_sdg_links(historical_program_id,sdg_number,classification_source)
 SELECT new_id,value::smallint,'documented' FROM jsonb_array_elements_text(coalesce(p_payload->'sdg_numbers','[]')) j(value)
 WHERE value::int BETWEEN 1 AND 17;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'historical_program.create','historical_program',new_id::text);
 RETURN new_id;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_historical_programs() RETURNS TABLE(
 id uuid,code text,title text,summary text,category text,date_precision text,starts_on date,ends_on date,
 beneficiary_count integer,volunteer_count integer,volunteer_hours numeric,budget_total numeric,currency text,
 source_type text,status text,quality text,row_version integer,created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 RETURN QUERY SELECT h.id,h.code,h.title,h.summary,h.category,h.date_precision,h.starts_on,h.ends_on,
  h.beneficiary_count,h.volunteer_count,h.volunteer_hours,h.budget_total,h.currency,h.source_type,h.status,h.quality,h.row_version,h.created_at
 FROM public.historical_programs h
 WHERE actor.role IN('paraya_director','paraya_associate','paraya_researcher')
    OR EXISTS(SELECT 1 FROM public.historical_program_barangay_links b WHERE b.historical_program_id=h.id AND b.barangay_id=actor.barangay_id AND h.status='accepted')
 ORDER BY h.starts_on DESC NULLS LAST,h.created_at DESC;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase2_review_historical_program(p_id uuid,p_action text,p_expected_version integer,p_quality text DEFAULT NULL,p_remarks text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE item public.historical_programs; next_status text; snapshot jsonb; version_no integer; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs');
 SELECT * INTO item FROM public.historical_programs WHERE id=p_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'historical program not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale historical version' USING ERRCODE='40001'; END IF;
 IF p_action='submit' THEN
  IF NOT public.phase2_current_has_capability('historical_program.create') OR item.status NOT IN('draft','returned') THEN RAISE EXCEPTION 'invalid submit transition' USING ERRCODE='42501'; END IF; next_status:='pending_review';
 ELSIF p_action='return' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'pending_review' OR length(btrim(coalesce(p_remarks,'')))<1 THEN RAISE EXCEPTION 'invalid return transition' USING ERRCODE='42501'; END IF; next_status:='returned';
 ELSIF p_action='accept' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'pending_review' OR p_quality NOT IN('complete','partial_verified','partial_unverified','unverified') OR length(btrim(coalesce(p_remarks,'')))<1 THEN RAISE EXCEPTION 'invalid accept transition' USING ERRCODE='42501'; END IF; next_status:='accepted';
 ELSIF p_action='archive' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'accepted' OR length(btrim(coalesce(p_remarks,'')))<1 THEN RAISE EXCEPTION 'invalid archive transition' USING ERRCODE='42501'; END IF; next_status:='archived';
 ELSE RAISE EXCEPTION 'unknown historical action' USING ERRCODE='22023'; END IF;
 UPDATE public.historical_programs SET status=next_status,quality=coalesce(p_quality,quality),row_version=row_version+1,
  reviewed_by=CASE WHEN p_action IN('return','accept','archive') THEN auth.uid() ELSE reviewed_by END,
  reviewed_at=CASE WHEN p_action IN('return','accept','archive') THEN now() ELSE reviewed_at END,updated_at=now() WHERE id=p_id;
 SELECT to_jsonb(h)-'created_by'-'reviewed_by' INTO snapshot FROM public.historical_programs h WHERE h.id=p_id;
 SELECT coalesce(max(v.version_number),0)+1 INTO version_no FROM public.historical_program_versions v WHERE v.historical_program_id=p_id;
 INSERT INTO public.historical_program_versions(historical_program_id,version_number,snapshot,canonical_hash,reason,created_by)
 VALUES(p_id,version_no,snapshot,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),p_action,auth.uid());
 INSERT INTO public.historical_program_events(historical_program_id,action,from_status,to_status,quality,remarks,actor_id)
 VALUES(p_id,p_action,item.status,next_status,p_quality,p_remarks,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),actor_email,'historical_program.'||p_action,'historical_program',p_id::text,jsonb_build_object('from',item.status,'to',next_status));
END;$function$;

-- No routine direct access. API/RPC DTOs remain the only boundary.
REVOKE ALL ON FUNCTION public.phase2_permission_module(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_role_has_capability(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_current_has_capability(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_configure_component(text,text,uuid[],uuid[],date,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_partners() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_create_partner(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_create_historical_program(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_historical_programs() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_review_historical_program(uuid,text,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_current_has_capability(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.phase2_configure_component(text,text,uuid[],uuid[],date,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_partners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_create_partner(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_create_historical_program(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_historical_programs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_review_historical_program(uuid,text,integer,text,text) TO authenticated;

DO $verify_phase2_tables$
DECLARE item record;
BEGIN
 FOR item IN SELECT c.relname,c.relrowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN('r','p') AND (c.relname LIKE 'partner%' OR c.relname LIKE 'partnership%' OR c.relname LIKE 'historical_program%')
 LOOP
  IF public.phase1_permission_module_for_table(item.relname) IS NULL OR NOT item.relrowsecurity THEN RAISE EXCEPTION 'Phase 2 table % is outside RLS/module mapping',item.relname; END IF;
 END LOOP;
END;$verify_phase2_tables$;

COMMIT;
