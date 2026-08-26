-- Complete the historical-program vertical workflow with atomic graph versions,
-- one effective import resolution per row, scoped detail reads, and separated
-- quality-aware aggregates. This migration is additive and forward-only.
BEGIN;

ALTER TABLE public.historical_program_import_batches
  ADD COLUMN IF NOT EXISTS created_count integer NOT NULL DEFAULT 0 CHECK(created_count>=0),
  ADD COLUMN IF NOT EXISTS linked_count integer NOT NULL DEFAULT 0 CHECK(linked_count>=0),
  ADD COLUMN IF NOT EXISTS excluded_count integer NOT NULL DEFAULT 0 CHECK(excluded_count>=0);

CREATE TABLE IF NOT EXISTS public.historical_program_import_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.historical_program_import_batches(id),
  import_row_id uuid NOT NULL UNIQUE REFERENCES public.historical_program_import_rows(id),
  outcome text NOT NULL CHECK(outcome IN('link_existing','distinct','exclude')),
  candidate_program_id uuid REFERENCES public.historical_programs(id),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 1000),
  decided_by uuid NOT NULL REFERENCES public.users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  CHECK((outcome='link_existing')=(candidate_program_id IS NOT NULL))
);

ALTER TABLE public.historical_program_import_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.historical_program_import_resolutions FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON TABLE public.historical_program_import_resolutions FROM authenticated;
DROP POLICY IF EXISTS phase2_service_only ON public.historical_program_import_resolutions;
CREATE POLICY phase2_service_only ON public.historical_program_import_resolutions AS RESTRICTIVE
  FOR ALL TO authenticated USING(false) WITH CHECK(false);
DROP TRIGGER IF EXISTS historical_import_resolutions_immutable ON public.historical_program_import_resolutions;
CREATE TRIGGER historical_import_resolutions_immutable BEFORE UPDATE OR DELETE ON public.historical_program_import_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

INSERT INTO public.historical_program_import_resolutions(batch_id,import_row_id,outcome,candidate_program_id,reason,decided_by,decided_at)
SELECT DISTINCT ON(d.batch_id,d.row_key) d.batch_id,r.id,d.outcome,
  CASE WHEN d.outcome='link_existing' THEN d.candidate_program_id ELSE NULL END,
  coalesce(nullif(btrim(d.reason),''),'Imported reviewed decision'),d.decided_by,d.decided_at
FROM public.historical_program_duplicate_decisions d
JOIN public.historical_program_import_rows r ON r.batch_id=d.batch_id AND r.row_key=d.row_key
WHERE d.decision_status='decided' AND d.outcome IS NOT NULL AND d.decided_by IS NOT NULL AND d.decided_at IS NOT NULL
ORDER BY d.batch_id,d.row_key,d.decided_at DESC,d.id
ON CONFLICT(import_row_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.phase2_register_created_synthetic_root(p_component text,p_entity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; actual_mode text;
BEGIN
 SELECT mode INTO active_mode FROM public.phase2_component_runtime WHERE component=p_component FOR UPDATE;
 IF active_mode='synthetic' THEN
  actual_mode:=public.phase2_component_entity_mode(p_component,p_entity_id);
  IF actual_mode<>'synthetic' THEN RAISE EXCEPTION 'created root is not synthetic' USING ERRCODE='42501'; END IF;
  UPDATE public.phase2_component_runtime SET synthetic_entity_ids=
    CASE WHEN p_entity_id=ANY(synthetic_entity_ids) THEN synthetic_entity_ids ELSE array_append(synthetic_entity_ids,p_entity_id) END,
    updated_at=now() WHERE component=p_component;
 END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_validate_historical_payload(p_payload jsonb,p_partial boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $function$
DECLARE key text; value jsonb; text_value text; sdg jsonb; combined_text text;
BEGIN
 IF jsonb_typeof(p_payload)<>'object' OR NOT public.phase1_json_object_has_only(p_payload,
  ARRAY['title','summary','category','date_precision','starts_on','ends_on','beneficiary_count','volunteer_count','volunteer_hours','budget_total','currency','resources','historical_need_description','outcomes','follow_up','source_type','source_notes','partner_ids','barangay_ids','need_ids','sdgs'])
 THEN RAISE EXCEPTION 'unknown or invalid historical field' USING ERRCODE='22023'; END IF;
 IF NOT p_partial AND NOT (p_payload?'title' AND p_payload?'category' AND p_payload?'date_precision' AND p_payload?'source_type') THEN
  RAISE EXCEPTION 'required historical fields are missing' USING ERRCODE='22023';
 END IF;
 FOREACH key IN ARRAY ARRAY['title','summary','category','date_precision','starts_on','ends_on','currency','resources','historical_need_description','outcomes','follow_up','source_type','source_notes'] LOOP
  IF p_payload?key AND jsonb_typeof(p_payload->key) NOT IN('string','null') THEN RAISE EXCEPTION 'historical field % has the wrong type',key USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_payload?'title' AND (jsonb_typeof(p_payload->'title')<>'string' OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 160) THEN RAISE EXCEPTION 'invalid historical title' USING ERRCODE='22023'; END IF;
 IF p_payload?'category' AND (jsonb_typeof(p_payload->'category')<>'string' OR length(btrim(p_payload->>'category')) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'invalid historical category' USING ERRCODE='22023'; END IF;
 IF p_payload?'date_precision' AND (jsonb_typeof(p_payload->'date_precision')<>'string' OR p_payload->>'date_precision' NOT IN('exact','month','year','unknown')) THEN RAISE EXCEPTION 'invalid historical date precision' USING ERRCODE='22023'; END IF;
 IF p_payload?'source_type' AND (jsonb_typeof(p_payload->'source_type')<>'string' OR p_payload->>'source_type' NOT IN('excel','word','pdf','paper','database','other')) THEN RAISE EXCEPTION 'invalid historical source type' USING ERRCODE='22023'; END IF;
 IF p_payload?'currency' AND p_payload->>'currency'<>'PHP' THEN RAISE EXCEPTION 'historical currency must be PHP' USING ERRCODE='22023'; END IF;
 IF p_payload?'summary' AND length(coalesce(p_payload->>'summary',''))>2000 THEN RAISE EXCEPTION 'historical summary is too long' USING ERRCODE='22023'; END IF;
 IF p_payload?'resources' AND length(coalesce(p_payload->>'resources',''))>2000 THEN RAISE EXCEPTION 'historical resources are too long' USING ERRCODE='22023'; END IF;
 IF p_payload?'historical_need_description' AND length(coalesce(p_payload->>'historical_need_description',''))>2000 THEN RAISE EXCEPTION 'historical need description is too long' USING ERRCODE='22023'; END IF;
 IF p_payload?'outcomes' AND length(coalesce(p_payload->>'outcomes',''))>3000 THEN RAISE EXCEPTION 'historical outcomes are too long' USING ERRCODE='22023'; END IF;
 IF p_payload?'follow_up' AND length(coalesce(p_payload->>'follow_up',''))>2000 THEN RAISE EXCEPTION 'historical follow-up is too long' USING ERRCODE='22023'; END IF;
 IF p_payload?'source_notes' AND length(coalesce(p_payload->>'source_notes',''))>1000 THEN RAISE EXCEPTION 'historical source notes are too long' USING ERRCODE='22023'; END IF;
 FOREACH key IN ARRAY ARRAY['starts_on','ends_on'] LOOP
  IF p_payload?key AND jsonb_typeof(p_payload->key)<>'null' AND (jsonb_typeof(p_payload->key)<>'string' OR p_payload->>key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN RAISE EXCEPTION 'historical date field % is invalid',key USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH key IN ARRAY ARRAY['beneficiary_count','volunteer_count'] LOOP
  IF p_payload?key AND jsonb_typeof(p_payload->key)<>'null' AND (jsonb_typeof(p_payload->key)<>'number' OR p_payload->>key !~ '^[0-9]+$' OR (p_payload->>key)::numeric>2147483647) THEN RAISE EXCEPTION 'historical count field % is invalid',key USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH key IN ARRAY ARRAY['volunteer_hours','budget_total'] LOOP
  IF p_payload?key AND jsonb_typeof(p_payload->key)<>'null' THEN
   text_value:=p_payload->>key;
   IF jsonb_typeof(p_payload->key) NOT IN('string','number') OR text_value !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'historical decimal field % is invalid',key USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 FOREACH key IN ARRAY ARRAY['partner_ids','barangay_ids','need_ids'] LOOP
  IF p_payload?key THEN
   value:=p_payload->key;
   IF jsonb_typeof(value)<>'array' OR jsonb_array_length(value)>(CASE key WHEN 'need_ids' THEN 100 ELSE 50 END) THEN RAISE EXCEPTION 'historical link list % is invalid',key USING ERRCODE='22023'; END IF;
   IF (SELECT count(*) FROM jsonb_array_elements_text(value))<>(SELECT count(DISTINCT item) FROM jsonb_array_elements_text(value) item) THEN RAISE EXCEPTION 'historical link list % contains duplicates',key USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 IF p_payload?'sdgs' THEN
  IF jsonb_typeof(p_payload->'sdgs')<>'array' OR jsonb_array_length(p_payload->'sdgs')>17 THEN RAISE EXCEPTION 'historical SDGs are invalid' USING ERRCODE='22023'; END IF;
  FOR sdg IN SELECT item FROM jsonb_array_elements(p_payload->'sdgs') item LOOP
   IF jsonb_typeof(sdg)<>'object' OR NOT public.phase1_json_object_has_only(sdg,ARRAY['number','source'])
      OR jsonb_typeof(sdg->'number')<>'number' OR (sdg->>'number')::int NOT BETWEEN 1 AND 17
      OR jsonb_typeof(sdg->'source')<>'string' OR sdg->>'source' NOT IN('documented','retrospective')
   THEN RAISE EXCEPTION 'historical SDG entry is invalid' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(p_payload->'sdgs'))<>(SELECT count(DISTINCT (item->>'number')::int) FROM jsonb_array_elements(p_payload->'sdgs') item) THEN RAISE EXCEPTION 'historical SDGs contain duplicates' USING ERRCODE='22023'; END IF;
 END IF;
 combined_text:=concat_ws(' ',p_payload->>'summary',p_payload->>'resources',p_payload->>'historical_need_description',p_payload->>'outcomes',p_payload->>'follow_up',p_payload->>'source_notes');
 IF combined_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    OR combined_text ~* '\m(password|government[ _-]?id|national[ _-]?id|diagnosis|patient|resident[ _-]?name|beneficiary[ _-]?name|volunteer[ _-]?name)\M'
    OR combined_text ~* '\m[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\M'
 THEN RAISE EXCEPTION 'historical narrative contains prohibited personal-data markers' USING ERRCODE='22023'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_historical_snapshot(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT jsonb_build_object(
  'id',h.id,'code',h.code,'title',h.title,'summary',h.summary,'category',h.category,'date_precision',h.date_precision,
  'starts_on',h.starts_on,'ends_on',h.ends_on,'beneficiary_count',h.beneficiary_count,'volunteer_count',h.volunteer_count,
  'volunteer_hours',CASE WHEN h.volunteer_hours IS NULL THEN NULL ELSE h.volunteer_hours::text END,
  'budget_total',CASE WHEN h.budget_total IS NULL THEN NULL ELSE h.budget_total::text END,'currency',h.currency,
  'resources',h.resources,'historical_need_description',h.historical_need_description,'outcomes',h.outcomes,'follow_up',h.follow_up,
  'source_type',h.source_type,'source_notes',h.source_notes,'status',h.status,'quality',h.quality,'row_version',h.row_version,'data_mode',h.data_mode,
  'partner_ids',coalesce((SELECT jsonb_agg(l.partner_id ORDER BY l.partner_id) FROM public.historical_program_partner_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'barangay_ids',coalesce((SELECT jsonb_agg(l.barangay_id ORDER BY l.barangay_id) FROM public.historical_program_barangay_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'need_ids',coalesce((SELECT jsonb_agg(l.need_id ORDER BY l.need_id) FROM public.historical_program_need_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'sdgs',coalesce((SELECT jsonb_agg(jsonb_build_object('number',l.sdg_number,'source',l.classification_source) ORDER BY l.sdg_number) FROM public.historical_program_sdg_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'evidence',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'sha256',d.sha256,'mime_type',d.mime_type,'size_bytes',d.size_bytes,'scan_status',d.scan_status) ORDER BY d.id) FROM public.historical_program_documents d WHERE d.historical_program_id=h.id),'[]'::jsonb)
 ) FROM public.historical_programs h WHERE h.id=p_id;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_historical_allowed_quality(p_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE h public.historical_programs; verified_source boolean; complete_fields boolean;
BEGIN
 SELECT * INTO h FROM public.historical_programs WHERE id=p_id;
 IF h.id IS NULL THEN RAISE EXCEPTION 'historical program not found' USING ERRCODE='P0002'; END IF;
 verified_source:=EXISTS(SELECT 1 FROM public.historical_program_documents d WHERE d.historical_program_id=h.id AND d.scan_status IN('approved','risk_accepted'));
 complete_fields:=h.date_precision<>'unknown' AND h.starts_on IS NOT NULL AND h.summary IS NOT NULL AND h.beneficiary_count IS NOT NULL
  AND h.volunteer_count IS NOT NULL AND h.volunteer_hours IS NOT NULL AND h.budget_total IS NOT NULL AND h.outcomes IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.historical_program_partner_links l WHERE l.historical_program_id=h.id)
  AND EXISTS(SELECT 1 FROM public.historical_program_barangay_links l WHERE l.historical_program_id=h.id)
  AND EXISTS(SELECT 1 FROM public.historical_program_sdg_links l WHERE l.historical_program_id=h.id);
 RETURN CASE WHEN complete_fields AND verified_source THEN 'complete' WHEN verified_source THEN 'partial_verified' WHEN complete_fields THEN 'partial_unverified' ELSE 'unverified' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_create_historical_program(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE new_id uuid; impl date; years_back integer; actor_email text; active_mode text; item text; sdg jsonb; snapshot jsonb;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM public.phase2_validate_historical_payload(p_payload,false);
 SELECT implementation_date,retrospective_years INTO impl,years_back FROM public.phase2_component_runtime WHERE component='historical_programs';
 IF impl IS NULL THEN RAISE EXCEPTION 'implementation date is not configured' USING ERRCODE='22023'; END IF;
 IF (p_payload->>'date_precision'='unknown')<>(nullif(p_payload->>'starts_on','') IS NULL) THEN RAISE EXCEPTION 'date precision and start date conflict' USING ERRCODE='22023'; END IF;
 IF p_payload->>'date_precision'<>'unknown' AND (nullif(p_payload->>'starts_on','')::date<impl-make_interval(years=>years_back) OR nullif(p_payload->>'starts_on','')::date>=impl) THEN RAISE EXCEPTION 'program is outside the retrospective window' USING ERRCODE='22023'; END IF;
 IF nullif(p_payload->>'ends_on','') IS NOT NULL AND nullif(p_payload->>'ends_on','')::date<nullif(p_payload->>'starts_on','')::date THEN RAISE EXCEPTION 'historical end precedes start' USING ERRCODE='22023'; END IF;
 INSERT INTO public.historical_programs(title,summary,category,date_precision,starts_on,ends_on,beneficiary_count,volunteer_count,volunteer_hours,budget_total,currency,resources,historical_need_description,outcomes,follow_up,source_type,source_notes,created_by,data_mode)
 VALUES(btrim(p_payload->>'title'),nullif(btrim(p_payload->>'summary'),''),btrim(p_payload->>'category'),p_payload->>'date_precision',nullif(p_payload->>'starts_on','')::date,nullif(p_payload->>'ends_on','')::date,
  nullif(p_payload->>'beneficiary_count','')::int,nullif(p_payload->>'volunteer_count','')::int,nullif(p_payload->>'volunteer_hours','')::numeric,nullif(p_payload->>'budget_total','')::numeric,'PHP',
  nullif(btrim(p_payload->>'resources'),''),nullif(btrim(p_payload->>'historical_need_description'),''),nullif(btrim(p_payload->>'outcomes'),''),nullif(btrim(p_payload->>'follow_up'),''),p_payload->>'source_type',nullif(btrim(p_payload->>'source_notes'),''),auth.uid(),active_mode)
 RETURNING id INTO new_id;
 PERFORM public.phase2_register_created_synthetic_root('historical_programs',new_id);
 FOR item IN SELECT jsonb_array_elements_text(coalesce(p_payload->'partner_ids','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.partner_entities p WHERE p.id=item::uuid AND p.data_mode=active_mode AND p.lifecycle<>'merged') THEN RAISE EXCEPTION 'historical Partner is outside the active data mode' USING ERRCODE='42501'; END IF;
  INSERT INTO public.historical_program_partner_links VALUES(new_id,item::uuid);
 END LOOP;
 FOR item IN SELECT jsonb_array_elements_text(coalesce(p_payload->'barangay_ids','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=item::uuid AND b.is_synthetic_test=(active_mode='synthetic')) THEN RAISE EXCEPTION 'historical barangay is outside the active data mode' USING ERRCODE='42501'; END IF;
  INSERT INTO public.historical_program_barangay_links VALUES(new_id,item::uuid);
 END LOOP;
 FOR item IN SELECT jsonb_array_elements_text(coalesce(p_payload->'need_ids','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.community_needs n JOIN public.barangays b ON b.id=n.barangay_id WHERE n.id=item::uuid AND n.approval_status='approved' AND b.is_synthetic_test=(active_mode='synthetic') AND EXISTS(SELECT 1 FROM public.historical_program_barangay_links l WHERE l.historical_program_id=new_id AND l.barangay_id=n.barangay_id)) THEN RAISE EXCEPTION 'historical need is not approved for a linked barangay' USING ERRCODE='23514'; END IF;
  INSERT INTO public.historical_program_need_links VALUES(new_id,item::uuid);
 END LOOP;
 FOR sdg IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'sdgs','[]')) LOOP
  INSERT INTO public.historical_program_sdg_links(historical_program_id,sdg_number,classification_source) VALUES(new_id,(sdg->>'number')::smallint,sdg->>'source');
 END LOOP;
 INSERT INTO public.historical_program_events(historical_program_id,action,to_status,actor_id) VALUES(new_id,'created','draft',auth.uid());
 snapshot:=public.phase2_historical_snapshot(new_id);
 INSERT INTO public.historical_program_versions(historical_program_id,version_number,snapshot,canonical_hash,reason,created_by)
 VALUES(new_id,1,snapshot,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),'created',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_program.create','historical_program',new_id::text,jsonb_build_object('data_mode',active_mode));
 RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_update_historical_program_v2(p_id uuid,p_expected_version integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE prior public.historical_programs; current_item public.historical_programs; active_mode text; impl date; years_back integer; item text; sdg jsonb; snapshot jsonb; version_no integer; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs',p_id);
 IF NOT (public.phase2_current_has_capability('historical_program.create') OR public.phase2_current_has_capability('historical_program.review')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 PERFORM public.phase2_validate_historical_payload(p_payload,true);
 SELECT * INTO prior FROM public.historical_programs WHERE id=p_id FOR UPDATE;
 IF prior.id IS NULL THEN RAISE EXCEPTION 'historical program not found' USING ERRCODE='P0002'; END IF;
 IF prior.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale historical version' USING ERRCODE='40001'; END IF;
 IF prior.status NOT IN('draft','returned') THEN RAISE EXCEPTION 'only draft or returned history can be corrected' USING ERRCODE='42501'; END IF;
 SELECT mode,implementation_date,retrospective_years INTO active_mode,impl,years_back FROM public.phase2_component_runtime WHERE component='historical_programs';
 UPDATE public.historical_programs SET
  title=CASE WHEN p_payload?'title' THEN btrim(p_payload->>'title') ELSE title END,
  summary=CASE WHEN p_payload?'summary' THEN nullif(btrim(p_payload->>'summary'),'') ELSE summary END,
  category=CASE WHEN p_payload?'category' THEN btrim(p_payload->>'category') ELSE category END,
  date_precision=CASE WHEN p_payload?'date_precision' THEN p_payload->>'date_precision' ELSE date_precision END,
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
  source_type=CASE WHEN p_payload?'source_type' THEN p_payload->>'source_type' ELSE source_type END,
  source_notes=CASE WHEN p_payload?'source_notes' THEN nullif(btrim(p_payload->>'source_notes'),'') ELSE source_notes END,
  row_version=row_version+1,updated_at=now() WHERE id=p_id RETURNING * INTO current_item;
 IF (current_item.date_precision='unknown')<>(current_item.starts_on IS NULL) OR (current_item.ends_on IS NOT NULL AND current_item.starts_on IS NULL) THEN RAISE EXCEPTION 'historical dates conflict' USING ERRCODE='22023'; END IF;
 IF current_item.date_precision<>'unknown' AND (current_item.starts_on<impl-make_interval(years=>years_back) OR current_item.starts_on>=impl) THEN RAISE EXCEPTION 'historical date is outside the configured window' USING ERRCODE='22023'; END IF;
 IF current_item.ends_on IS NOT NULL AND current_item.ends_on<current_item.starts_on THEN RAISE EXCEPTION 'historical end precedes start' USING ERRCODE='22023'; END IF;
 IF p_payload?'partner_ids' THEN
  DELETE FROM public.historical_program_partner_links WHERE historical_program_id=p_id;
  FOR item IN SELECT jsonb_array_elements_text(p_payload->'partner_ids') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.partner_entities p WHERE p.id=item::uuid AND p.data_mode=active_mode AND p.lifecycle<>'merged') THEN RAISE EXCEPTION 'historical Partner is outside the active data mode' USING ERRCODE='42501'; END IF;
   INSERT INTO public.historical_program_partner_links VALUES(p_id,item::uuid);
  END LOOP;
 END IF;
 IF p_payload?'barangay_ids' THEN
  DELETE FROM public.historical_program_barangay_links WHERE historical_program_id=p_id;
  FOR item IN SELECT jsonb_array_elements_text(p_payload->'barangay_ids') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=item::uuid AND b.is_synthetic_test=(active_mode='synthetic')) THEN RAISE EXCEPTION 'historical barangay is outside the active data mode' USING ERRCODE='42501'; END IF;
   INSERT INTO public.historical_program_barangay_links VALUES(p_id,item::uuid);
  END LOOP;
 END IF;
 IF p_payload?'need_ids' THEN
  DELETE FROM public.historical_program_need_links WHERE historical_program_id=p_id;
  FOR item IN SELECT jsonb_array_elements_text(p_payload->'need_ids') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.community_needs n JOIN public.barangays b ON b.id=n.barangay_id WHERE n.id=item::uuid AND n.approval_status='approved' AND b.is_synthetic_test=(active_mode='synthetic') AND EXISTS(SELECT 1 FROM public.historical_program_barangay_links l WHERE l.historical_program_id=p_id AND l.barangay_id=n.barangay_id)) THEN RAISE EXCEPTION 'historical need is not approved for a linked barangay' USING ERRCODE='23514'; END IF;
   INSERT INTO public.historical_program_need_links VALUES(p_id,item::uuid);
  END LOOP;
 END IF;
 IF p_payload?'sdgs' THEN
  DELETE FROM public.historical_program_sdg_links WHERE historical_program_id=p_id;
  FOR sdg IN SELECT value FROM jsonb_array_elements(p_payload->'sdgs') LOOP
   INSERT INTO public.historical_program_sdg_links(historical_program_id,sdg_number,classification_source) VALUES(p_id,(sdg->>'number')::smallint,sdg->>'source');
  END LOOP;
 END IF;
 snapshot:=public.phase2_historical_snapshot(p_id);
 SELECT coalesce(max(version_number),0)+1 INTO version_no FROM public.historical_program_versions WHERE historical_program_id=p_id;
 INSERT INTO public.historical_program_versions(historical_program_id,version_number,snapshot,canonical_hash,reason,created_by)
 VALUES(p_id,version_no,snapshot,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),'correction',auth.uid());
 INSERT INTO public.historical_program_events(historical_program_id,action,from_status,to_status,remarks,actor_id) VALUES(p_id,'corrected',prior.status,prior.status,'Corrected complete draft graph',auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_program.correct','historical_program',p_id::text,jsonb_build_object('version',version_no));
 RETURN jsonb_build_object('id',p_id,'rowVersion',current_item.row_version,'versionNumber',version_no);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_transition_historical_program(p_id uuid,p_action text,p_expected_version integer,p_quality text DEFAULT NULL,p_remarks text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE item public.historical_programs; next_status text; allowed_quality text; snapshot jsonb; version_no integer; actor_email text; next_version integer;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs',p_id);
 SELECT * INTO item FROM public.historical_programs WHERE id=p_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'historical program not found' USING ERRCODE='P0002'; END IF;
 IF item.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale historical version' USING ERRCODE='40001'; END IF;
 IF p_action='submit' THEN
  IF NOT public.phase2_current_has_capability('historical_program.create') OR item.status NOT IN('draft','returned') OR item.date_precision='unknown' OR item.starts_on IS NULL THEN RAISE EXCEPTION 'invalid or ineligible submit transition' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.historical_program_partner_links WHERE historical_program_id=p_id) OR NOT EXISTS(SELECT 1 FROM public.historical_program_barangay_links WHERE historical_program_id=p_id) THEN RAISE EXCEPTION 'submission requires Partner and barangay attribution' USING ERRCODE='23514'; END IF;
  next_status:='pending_review';
 ELSIF p_action='return' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'pending_review' OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid return transition' USING ERRCODE='42501'; END IF; next_status:='returned';
 ELSIF p_action='accept' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'pending_review' OR item.date_precision='unknown' OR item.starts_on IS NULL OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid accept transition; eligible date evidence is required' USING ERRCODE='42501'; END IF;
  allowed_quality:=public.phase2_historical_allowed_quality(p_id);
  IF p_quality IS NULL OR p_quality NOT IN('complete','partial_verified','partial_unverified','unverified') THEN RAISE EXCEPTION 'quality is required for acceptance' USING ERRCODE='23514'; END IF;
  IF (CASE p_quality WHEN 'complete' THEN 4 WHEN 'partial_verified' THEN 3 WHEN 'partial_unverified' THEN 2 ELSE 1 END)>(CASE allowed_quality WHEN 'complete' THEN 4 WHEN 'partial_verified' THEN 3 WHEN 'partial_unverified' THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'quality exceeds the evidence-supported tier' USING ERRCODE='23514'; END IF;
  next_status:='accepted';
 ELSIF p_action='archive' THEN
  IF NOT public.phase2_current_has_capability('historical_program.review') OR item.status<>'accepted' OR length(btrim(coalesce(p_remarks,'')))<5 THEN RAISE EXCEPTION 'invalid archive transition' USING ERRCODE='42501'; END IF; next_status:='archived';
 ELSE RAISE EXCEPTION 'unknown historical action' USING ERRCODE='22023'; END IF;
 next_version:=item.row_version+1;
 UPDATE public.historical_programs SET status=next_status,quality=CASE WHEN p_action='accept' THEN p_quality ELSE quality END,row_version=next_version,
  reviewed_by=CASE WHEN p_action IN('return','accept','archive') THEN auth.uid() ELSE reviewed_by END,
  reviewed_at=CASE WHEN p_action IN('return','accept','archive') THEN now() ELSE reviewed_at END,updated_at=now() WHERE id=p_id;
 snapshot:=public.phase2_historical_snapshot(p_id);
 SELECT coalesce(max(version_number),0)+1 INTO version_no FROM public.historical_program_versions WHERE historical_program_id=p_id;
 INSERT INTO public.historical_program_versions(historical_program_id,version_number,snapshot,canonical_hash,reason,created_by)
 VALUES(p_id,version_no,snapshot,encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),p_action,auth.uid());
 INSERT INTO public.historical_program_events(historical_program_id,action,from_status,to_status,quality,remarks,actor_id) VALUES(p_id,p_action,item.status,next_status,CASE WHEN p_action='accept' THEN p_quality ELSE NULL END,p_remarks,auth.uid());
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_program.'||p_action,'historical_program',p_id::text,jsonb_build_object('from',item.status,'to',next_status,'version',version_no));
 RETURN jsonb_build_object('id',p_id,'action',p_action,'status',next_status,'quality',CASE WHEN p_action='accept' THEN p_quality ELSE item.quality END,'rowVersion',next_version,'versionNumber',version_no);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_list_historical_programs()
RETURNS TABLE(id uuid,code text,title text,summary text,category text,date_precision text,starts_on date,ends_on date,beneficiary_count integer,volunteer_count integer,volunteer_hours numeric,budget_total numeric,currency text,source_type text,status text,quality text,row_version integer,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.read') OR NOT (public.phase2_current_has_capability('historical_program.create') OR public.phase2_current_has_capability('historical_program.import') OR public.phase2_current_has_capability('historical_program.review')) THEN RAISE EXCEPTION 'aggregate-only historical access' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT h.id,h.code,h.title,h.summary,h.category,h.date_precision,h.starts_on,h.ends_on,h.beneficiary_count,h.volunteer_count,h.volunteer_hours,h.budget_total,h.currency,h.source_type,h.status,h.quality,h.row_version,h.created_at
 FROM public.historical_programs h WHERE h.data_mode=active_mode ORDER BY h.starts_on DESC NULLS LAST,h.created_at DESC;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,metadata) VALUES(auth.uid(),actor_email,'historical_program.list','historical_program',jsonb_build_object('data_mode',active_mode));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_historical_program(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; actor_email text;
BEGIN
 PERFORM public.phase2_assert_runtime('historical_programs',p_id);
 IF NOT public.phase2_current_has_capability('historical_program.read') OR NOT (public.phase2_current_has_capability('historical_program.create') OR public.phase2_current_has_capability('historical_program.import') OR public.phase2_current_has_capability('historical_program.review')) THEN RAISE EXCEPTION 'aggregate-only historical access' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',h.id,'code',h.code,'title',h.title,'summary',h.summary,'category',h.category,
  'datePrecision',h.date_precision,'startsOn',h.starts_on,'endsOn',h.ends_on,'beneficiaryCount',h.beneficiary_count,
  'volunteerCount',h.volunteer_count,'volunteerHours',CASE WHEN h.volunteer_hours IS NULL THEN NULL ELSE h.volunteer_hours::text END,
  'budgetTotal',CASE WHEN h.budget_total IS NULL THEN NULL ELSE h.budget_total::text END,'currency',h.currency,
  'resources',h.resources,'historicalNeedDescription',h.historical_need_description,'outcomes',h.outcomes,'followUp',h.follow_up,
  'sourceType',h.source_type,'sourceNotes',h.source_notes,'status',h.status,'quality',h.quality,'allowedQuality',public.phase2_historical_allowed_quality(h.id),'rowVersion',h.row_version,
  'partnerIds',coalesce((SELECT jsonb_agg(l.partner_id ORDER BY l.partner_id) FROM public.historical_program_partner_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'barangayIds',coalesce((SELECT jsonb_agg(l.barangay_id ORDER BY l.barangay_id) FROM public.historical_program_barangay_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'needIds',coalesce((SELECT jsonb_agg(l.need_id ORDER BY l.need_id) FROM public.historical_program_need_links l WHERE l.historical_program_id=h.id),'[]'::jsonb),
  'sdgs',coalesce((SELECT jsonb_agg(jsonb_build_object('number',s.sdg_number,'source',s.classification_source) ORDER BY s.sdg_number) FROM public.historical_program_sdg_links s WHERE s.historical_program_id=h.id),'[]'::jsonb),
  'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'originalName',d.original_name,'sha256',d.sha256,'mimeType',d.mime_type,'sizeBytes',d.size_bytes,'scanStatus',d.scan_status,'createdAt',d.created_at) ORDER BY d.created_at,d.id) FROM public.historical_program_documents d WHERE d.historical_program_id=h.id),'[]'::jsonb),
  'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'versionNumber',v.version_number,'canonicalHash',v.canonical_hash,'reason',v.reason,'createdAt',v.created_at,'snapshot',v.snapshot) ORDER BY v.version_number) FROM public.historical_program_versions v WHERE v.historical_program_id=h.id),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'fromStatus',e.from_status,'toStatus',e.to_status,'quality',e.quality,'remarks',e.remarks,'occurredAt',e.occurred_at) ORDER BY e.occurred_at,e.id) FROM public.historical_program_events e WHERE e.historical_program_id=h.id),'[]'::jsonb)
 ) INTO result FROM public.historical_programs h WHERE h.id=p_id;
 IF result IS NULL THEN RAISE EXCEPTION 'historical program not found' USING ERRCODE='P0002'; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'historical_program.read','historical_program',p_id::text);
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_historical_analytics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; actor public.users; impl date; years_back integer; full_scope boolean; result jsonb; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 full_scope:=public.phase2_current_has_capability('historical_program.create') OR public.phase2_current_has_capability('historical_program.import') OR public.phase2_current_has_capability('historical_program.review');
 IF NOT full_scope AND actor.barangay_id IS NULL THEN RAISE EXCEPTION 'barangay scope is required' USING ERRCODE='42501'; END IF;
 SELECT implementation_date,retrospective_years INTO impl,years_back FROM public.phase2_component_runtime WHERE component='historical_programs';
 IF impl IS NULL THEN RAISE EXCEPTION 'implementation date is not configured' USING ERRCODE='42501'; END IF;
 WITH scoped_history AS (
  SELECT h.* FROM public.historical_programs h WHERE h.data_mode=active_mode AND h.status='accepted' AND h.date_precision<>'unknown'
   AND h.starts_on>=impl-make_interval(years=>years_back) AND h.starts_on<impl
   AND (full_scope OR EXISTS(SELECT 1 FROM public.historical_program_barangay_links l WHERE l.historical_program_id=h.id AND l.barangay_id=actor.barangay_id))
 ), grouped AS (
  SELECT quality IN('complete','partial_verified') verified,count(*) records,coalesce(sum(beneficiary_count),0) beneficiaries,
   coalesce(sum(volunteer_count),0) volunteers,coalesce(sum(volunteer_hours),0) hours,coalesce(sum(budget_total),0) budget
  FROM scoped_history GROUP BY quality IN('complete','partial_verified')
 ), operational AS (
  SELECT count(*) records,coalesce(sum(p.budget_allocated),0) budget FROM public.programs p
  WHERE p.phase2_data_mode=active_mode AND (full_scope OR p.barangay_id=actor.barangay_id)
 )
 SELECT jsonb_build_object('schema','agape.historical-programs.aggregate.v2','scope',CASE WHEN full_scope THEN 'all' ELSE 'own_barangay' END,
  'barangayId',CASE WHEN full_scope THEN NULL ELSE actor.barangay_id END,'implementationDate',impl,'windowStart',(impl-make_interval(years=>years_back))::date,'asOfDate',current_date,
  'operational',jsonb_build_object('recordCount',o.records,'budgetTotal',o.budget::text),
  'verifiedHistorical',jsonb_build_object('recordCount',coalesce(v.records,0),'beneficiaryCount',coalesce(v.beneficiaries,0),'volunteerCount',coalesce(v.volunteers,0),'volunteerHours',coalesce(v.hours,0)::text,'budgetTotal',coalesce(v.budget,0)::text),
  'unverifiedHistorical',jsonb_build_object('recordCount',coalesce(u.records,0),'beneficiaryCount',coalesce(u.beneficiaries,0),'volunteerCount',coalesce(u.volunteers,0),'volunteerHours',coalesce(u.hours,0)::text,'budgetTotal',coalesce(u.budget,0)::text))
 INTO result FROM operational o LEFT JOIN grouped v ON v.verified LEFT JOIN grouped u ON NOT u.verified;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,metadata) VALUES(auth.uid(),actor_email,'historical_program.analytics','historical_program',jsonb_build_object('scope',CASE WHEN full_scope THEN 'all' ELSE 'own_barangay' END));
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_stage_historical_import(p_file_hash text,p_template_version text,p_rows jsonb,p_replaces_batch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE active_mode text; v_batch_id uuid; row_item jsonb; candidate record; errors jsonb; duplicate_rows integer:=0; v_error_count integer:=0; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.import') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_file_hash !~ '^[0-9a-f]{64}$' OR p_template_version<>'agape.historical-programs.v2.1' OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'invalid historical import envelope' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_batch_id FROM public.historical_program_import_batches WHERE file_hash=p_file_hash AND created_by=auth.uid() AND data_mode=active_mode AND status<>'purged';
 IF v_batch_id IS NOT NULL THEN RETURN public.phase2_get_historical_import_batch(v_batch_id)||jsonb_build_object('idempotent',true); END IF;
 INSERT INTO public.historical_program_import_batches(file_hash,template_version,status,row_count,replaced_batch_id,created_by,data_mode)
 VALUES(p_file_hash,p_template_version,'validating',jsonb_array_length(p_rows),p_replaces_batch_id,auth.uid(),active_mode) RETURNING id INTO v_batch_id;
 FOR row_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF NOT public.phase1_json_object_has_only(row_item,ARRAY['row_key','data','errors']) OR jsonb_typeof(row_item->'row_key')<>'string' OR length(row_item->>'row_key') NOT BETWEEN 1 AND 80 OR jsonb_typeof(row_item->'errors')<>'array' THEN RAISE EXCEPTION 'invalid staged row' USING ERRCODE='22023'; END IF;
  errors:=row_item->'errors'; v_error_count:=v_error_count+jsonb_array_length(errors);
  IF jsonb_array_length(errors)=0 THEN
   IF jsonb_typeof(row_item->'data')<>'object' OR NOT public.phase1_json_object_has_only(row_item->'data',ARRAY['title','summary','category','date_precision','starts_on','ends_on','beneficiary_count','volunteer_count','volunteer_hours','budget_total','currency','resources','historical_need_description','outcomes','follow_up','source_type','source_notes','partner_codes','barangay_codes','need_ids','sdgs']) THEN RAISE EXCEPTION 'invalid sanitized historical row' USING ERRCODE='22023'; END IF;
   PERFORM public.phase2_validate_historical_payload(((row_item->'data')-'partner_codes'::text-'barangay_codes'::text)||jsonb_build_object('partner_ids','[]'::jsonb,'barangay_ids','[]'::jsonb),false);
  END IF;
  INSERT INTO public.historical_program_import_rows(batch_id,row_key,sanitized_data,errors) VALUES(v_batch_id,row_item->>'row_key',CASE WHEN jsonb_array_length(errors)=0 THEN row_item->'data' ELSE NULL END,errors);
  IF jsonb_array_length(errors)=0 THEN
   FOR candidate IN SELECT h.id FROM public.historical_programs h WHERE h.data_mode=active_mode AND lower(regexp_replace(h.title,'\s+',' ','g'))=lower(regexp_replace(row_item->'data'->>'title','\s+',' ','g'))
      AND extract(year FROM h.starts_on)=extract(year FROM nullif(row_item->'data'->>'starts_on','')::date) LOOP
    INSERT INTO public.historical_program_duplicate_decisions(batch_id,row_key,candidate_program_id,decision_status) VALUES(v_batch_id,row_item->>'row_key',candidate.id,'pending') ON CONFLICT DO NOTHING;
   END LOOP;
   IF EXISTS(SELECT 1 FROM public.historical_program_duplicate_decisions d WHERE d.batch_id=v_batch_id AND d.row_key=row_item->>'row_key') THEN duplicate_rows:=duplicate_rows+1; END IF;
  END IF;
 END LOOP;
 UPDATE public.historical_program_import_batches SET error_count=v_error_count,status=CASE WHEN v_error_count>0 OR duplicate_rows>0 THEN 'needs_correction' ELSE 'ready' END WHERE id=v_batch_id;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_import.stage','historical_import_batch',v_batch_id::text,jsonb_build_object('rows',jsonb_array_length(p_rows),'errors',v_error_count,'duplicateRows',duplicate_rows));
 RETURN public.phase2_get_historical_import_batch(v_batch_id)||jsonb_build_object('idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_get_historical_import_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.historical_program_import_batches; active_mode text; result jsonb; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT (public.phase2_current_has_capability('historical_program.import') OR public.phase2_current_has_capability('historical_program.review')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO batch FROM public.historical_program_import_batches WHERE id=p_batch_id;
 IF batch.id IS NULL THEN RAISE EXCEPTION 'historical import batch not found' USING ERRCODE='P0002'; END IF;
 IF batch.data_mode<>active_mode OR (batch.created_by<>auth.uid() AND NOT public.phase2_current_has_capability('historical_program.review')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('batchId',batch.id,'templateVersion',batch.template_version,'status',batch.status,'rowCount',batch.row_count,'errorCount',batch.error_count,
  'createdCount',batch.created_count,'linkedCount',batch.linked_count,'excludedCount',batch.excluded_count,'replacedBatchId',batch.replaced_batch_id,'createdAt',batch.created_at,'committedAt',batch.committed_at,
  'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('rowId',r.id,'rowKey',r.row_key,'data',r.sanitized_data,'errors',r.errors,
    'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'code',h.code,'title',h.title,'startsOn',h.starts_on,'quality',h.quality) ORDER BY h.code) FROM public.historical_program_duplicate_decisions d JOIN public.historical_programs h ON h.id=d.candidate_program_id WHERE d.batch_id=r.batch_id AND d.row_key=r.row_key),'[]'::jsonb),
    'resolution',(SELECT jsonb_build_object('outcome',x.outcome,'candidateProgramId',x.candidate_program_id,'reason',x.reason,'decidedAt',x.decided_at) FROM public.historical_program_import_resolutions x WHERE x.import_row_id=r.id)) ORDER BY r.id) FROM public.historical_program_import_rows r WHERE r.batch_id=batch.id),'[]'::jsonb)) INTO result;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id) VALUES(auth.uid(),actor_email,'historical_import.read','historical_import_batch',batch.id::text);
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_resolve_historical_duplicate_v2(p_batch_id uuid,p_row_key text,p_candidate_id uuid,p_outcome text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.historical_program_import_batches; staged public.historical_program_import_rows; active_mode text; unresolved integer; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.import') OR p_outcome NOT IN('link_existing','distinct','exclude') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'invalid duplicate decision' USING ERRCODE='42501'; END IF;
 IF (p_outcome='link_existing')<>(p_candidate_id IS NOT NULL) THEN RAISE EXCEPTION 'duplicate candidate conflicts with outcome' USING ERRCODE='22023'; END IF;
 SELECT * INTO batch FROM public.historical_program_import_batches WHERE id=p_batch_id FOR UPDATE;
 IF batch.id IS NULL OR batch.data_mode<>active_mode OR batch.status<>'needs_correction' OR (batch.created_by<>auth.uid() AND NOT public.phase2_current_has_capability('historical_program.review')) THEN RAISE EXCEPTION 'batch cannot be resolved' USING ERRCODE='42501'; END IF;
 SELECT * INTO staged FROM public.historical_program_import_rows WHERE batch_id=p_batch_id AND row_key=p_row_key FOR UPDATE;
 IF staged.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.historical_program_duplicate_decisions d WHERE d.batch_id=p_batch_id AND d.row_key=p_row_key) THEN RAISE EXCEPTION 'duplicate row is stale or missing' USING ERRCODE='40001'; END IF;
 IF p_candidate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.historical_program_duplicate_decisions d JOIN public.historical_programs h ON h.id=d.candidate_program_id WHERE d.batch_id=p_batch_id AND d.row_key=p_row_key AND d.candidate_program_id=p_candidate_id AND h.data_mode=active_mode) THEN RAISE EXCEPTION 'duplicate candidate is stale or outside the active mode' USING ERRCODE='40001'; END IF;
 INSERT INTO public.historical_program_import_resolutions(batch_id,import_row_id,outcome,candidate_program_id,reason,decided_by)
 VALUES(p_batch_id,staged.id,p_outcome,p_candidate_id,btrim(p_reason),auth.uid());
 UPDATE public.historical_program_duplicate_decisions SET decision_status='decided',outcome=p_outcome,reason=btrim(p_reason),decided_by=auth.uid(),decided_at=now() WHERE batch_id=p_batch_id AND row_key=p_row_key;
 SELECT count(*) INTO unresolved FROM public.historical_program_import_rows r WHERE r.batch_id=p_batch_id
  AND EXISTS(SELECT 1 FROM public.historical_program_duplicate_decisions d WHERE d.batch_id=r.batch_id AND d.row_key=r.row_key)
  AND NOT EXISTS(SELECT 1 FROM public.historical_program_import_resolutions x WHERE x.import_row_id=r.id);
 IF unresolved=0 AND batch.error_count=0 THEN UPDATE public.historical_program_import_batches SET status='ready' WHERE id=p_batch_id; END IF;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_import.duplicate.resolve','historical_import_batch',p_batch_id::text,jsonb_build_object('outcome',p_outcome,'candidate_id',p_candidate_id));
 RETURN jsonb_build_object('batchId',p_batch_id,'status',CASE WHEN unresolved=0 AND batch.error_count=0 THEN 'ready' ELSE 'needs_correction' END,'outcome',p_outcome);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_commit_historical_import(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.historical_program_import_batches; staged record; payload jsonb; resolution public.historical_program_import_resolutions; v_created_count integer:=0; v_linked_count integer:=0; v_excluded_count integer:=0; active_mode text; actor_email text;
BEGIN
 active_mode:=public.phase2_assert_actor_runtime('historical_programs');
 IF NOT public.phase2_current_has_capability('historical_program.import') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO batch FROM public.historical_program_import_batches WHERE id=p_batch_id FOR UPDATE;
 IF batch.id IS NULL OR batch.data_mode<>active_mode OR (batch.created_by<>auth.uid() AND NOT public.phase2_current_has_capability('historical_program.review')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF batch.status='committed' THEN RETURN jsonb_build_object('batchId',batch.id,'idempotent',true,'created',batch.created_count,'linked',batch.linked_count,'excluded',batch.excluded_count); END IF;
 IF batch.status<>'ready' OR batch.error_count<>0 OR EXISTS(SELECT 1 FROM public.historical_program_import_rows r WHERE r.batch_id=batch.id AND EXISTS(SELECT 1 FROM public.historical_program_duplicate_decisions d WHERE d.batch_id=r.batch_id AND d.row_key=r.row_key) AND NOT EXISTS(SELECT 1 FROM public.historical_program_import_resolutions x WHERE x.import_row_id=r.id)) THEN RAISE EXCEPTION 'batch is not ready' USING ERRCODE='23514'; END IF;
 FOR staged IN SELECT * FROM public.historical_program_import_rows WHERE batch_id=batch.id ORDER BY id LOOP
  SELECT * INTO resolution FROM public.historical_program_import_resolutions WHERE import_row_id=staged.id;
  IF resolution.outcome='exclude' THEN v_excluded_count:=v_excluded_count+1; CONTINUE; ELSIF resolution.outcome='link_existing' THEN v_linked_count:=v_linked_count+1; CONTINUE; END IF;
  payload:=(staged.sanitized_data||jsonb_build_object(
   'partner_ids',coalesce((SELECT jsonb_agg(p.id ORDER BY p.id) FROM public.partner_entities p WHERE p.data_mode=active_mode AND p.code IN(SELECT jsonb_array_elements_text(staged.sanitized_data->'partner_codes'))),'[]'::jsonb),
   'barangay_ids',coalesce((SELECT jsonb_agg(p.barangay_id ORDER BY p.barangay_id) FROM public.partner_entities p WHERE p.data_mode=active_mode AND p.barangay_id IS NOT NULL AND p.code IN(SELECT jsonb_array_elements_text(staged.sanitized_data->'barangay_codes'))),'[]'::jsonb)
  ))-'partner_codes'::text-'barangay_codes'::text;
  PERFORM public.phase2_create_historical_program(payload); v_created_count:=v_created_count+1;
 END LOOP;
 UPDATE public.historical_program_import_batches SET status='committed',committed_at=now(),created_count=v_created_count,linked_count=v_linked_count,excluded_count=v_excluded_count WHERE id=batch.id;
 DELETE FROM public.historical_program_duplicate_decisions WHERE batch_id=batch.id;
 UPDATE public.historical_program_import_rows SET sanitized_data=NULL,row_key='purged-'||id::text,errors='[]' WHERE batch_id=batch.id;
 SELECT email INTO actor_email FROM public.users WHERE id=auth.uid();
 INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata) VALUES(auth.uid(),actor_email,'historical_import.commit','historical_import_batch',batch.id::text,jsonb_build_object('created',v_created_count,'linked',v_linked_count,'excluded',v_excluded_count));
 RETURN jsonb_build_object('batchId',batch.id,'idempotent',false,'created',v_created_count,'linked',v_linked_count,'excluded',v_excluded_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_purge_historical_imports()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE purged integer; active_mode text;
BEGIN
 SELECT mode INTO active_mode FROM public.phase2_component_runtime WHERE component='historical_programs';
 IF active_mode IS NULL OR active_mode='off' THEN RETURN 0; END IF;
 DELETE FROM public.historical_program_duplicate_decisions d USING public.historical_program_import_batches b WHERE b.id=d.batch_id AND b.data_mode=active_mode AND b.status IN('needs_correction','failed') AND b.purge_after<=now();
 UPDATE public.historical_program_import_rows r SET sanitized_data=NULL,row_key='purged-'||r.id::text,errors='[]'
 FROM public.historical_program_import_batches b WHERE b.id=r.batch_id AND b.data_mode=active_mode AND b.status IN('needs_correction','failed') AND b.purge_after<=now() AND (r.sanitized_data IS NOT NULL OR r.row_key NOT LIKE 'purged-%');
 GET DIAGNOSTICS purged=ROW_COUNT;
 UPDATE public.historical_program_import_batches SET status='purged' WHERE data_mode=active_mode AND status IN('needs_correction','failed') AND purge_after<=now();
 RETURN purged;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_register_created_synthetic_root(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_validate_historical_payload(jsonb,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_historical_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_historical_allowed_quality(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_update_historical_program(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_review_historical_program(uuid,text,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_resolve_historical_duplicate(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_create_historical_program(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_update_historical_program_v2(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_transition_historical_program(uuid,text,integer,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_list_historical_programs() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_historical_program(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_historical_analytics() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_stage_historical_import(text,text,jsonb,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_get_historical_import_batch(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_resolve_historical_duplicate_v2(uuid,text,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_commit_historical_import(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_purge_historical_imports() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_create_historical_program(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_update_historical_program_v2(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_transition_historical_program(uuid,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_list_historical_programs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_historical_program(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_historical_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_stage_historical_import(text,text,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_get_historical_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_resolve_historical_duplicate_v2(uuid,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_commit_historical_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_purge_historical_imports() TO service_role;

UPDATE public.phase2_component_runtime SET mode='off',synthetic_user_ids='{}',synthetic_entity_ids='{}',updated_at=now();
UPDATE public.phase2_cutover_state SET write_authority='v1',reconciliation_hash=NULL,reconciled_at=NULL WHERE component IN('partners','proposals');

COMMIT;
