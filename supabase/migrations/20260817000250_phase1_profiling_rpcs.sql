-- Phase 1B trusted profiling functions. Each function independently checks
-- active account, deny-only capability overrides, scope, and expected version.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_json_has_prohibited_key(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $function$
DECLARE key text; child jsonb;
BEGIN
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR key, child IN SELECT * FROM jsonb_each(p_value) LOOP
      IF lower(regexp_replace(key, '[ -]+', '_', 'g')) IN (
        'government_id','government_id_number','national_id','passport','photo','photograph','biometric','fingerprint',
        'exact_gps','latitude','longitude','exact_income','monthly_income_amount','diagnosis','clinical_document',
        'medical_document','password'
      ) OR public.phase1_json_has_prohibited_key(child) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      IF public.phase1_json_has_prohibited_key(child) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_assert_profiling_scope(
  p_capability text, p_barangay_id uuid, p_sitio_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE actor public.users%ROWTYPE;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = auth.uid();
  IF actor.id IS NULL OR actor.status <> 'active' OR actor.is_active IS NOT TRUE
     OR NOT public.phase1_current_has_capability(p_capability) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF actor.role IN ('barangay_captain','barangay_secretary','barangay_mother_leader')
     AND actor.barangay_id IS DISTINCT FROM p_barangay_id THEN
    RAISE EXCEPTION 'cross-barangay access denied' USING ERRCODE = '42501';
  END IF;

  IF actor.role = 'barangay_mother_leader' THEN
    IF p_sitio_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.mother_leader_sitio_assignments a
      JOIN public.barangay_sitios s ON s.id = a.sitio_id
      WHERE a.mother_leader_id = actor.id AND a.sitio_id = p_sitio_id
        AND s.barangay_id = p_barangay_id AND s.is_active
        AND a.effective_from <= current_date
        AND (a.effective_to IS NULL OR a.effective_to >= current_date)
    ) THEN RAISE EXCEPTION 'Mother Leader is not assigned to this sitio' USING ERRCODE = '42501'; END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_next_profile_code(p_barangay_id uuid, p_entity_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE prefix text; sequence_value bigint;
BEGIN
  IF p_entity_type NOT IN ('household','resident') THEN RAISE EXCEPTION 'invalid entity type'; END IF;
  SELECT upper(profile_code_prefix) INTO prefix FROM public.barangays WHERE id = p_barangay_id FOR UPDATE;
  IF prefix IS NULL OR prefix !~ '^[A-Z0-9]{2,10}$' THEN RAISE EXCEPTION 'barangay profile code prefix is not configured'; END IF;
  INSERT INTO public.profiling_code_counters(barangay_id, entity_type, next_value)
  VALUES (p_barangay_id, p_entity_type, 2)
  ON CONFLICT (barangay_id, entity_type) DO UPDATE SET next_value = public.profiling_code_counters.next_value + 1
  RETURNING next_value - 1 INTO sequence_value;
  RETURN prefix || CASE WHEN p_entity_type = 'household' THEN '-HH-' ELSE '-RES-' END || lpad(sequence_value::text, 6, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_profiling_cycle(
  p_barangay_id uuid, p_name text, p_sample_method text, p_target_households integer,
  p_collection_starts_on date, p_collection_ends_on date, p_privacy_notice_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE new_id uuid;
BEGIN
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage', p_barangay_id, NULL);
  IF p_target_households <= 0 OR p_collection_ends_on < p_collection_starts_on THEN RAISE EXCEPTION 'invalid cycle parameters' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiling_privacy_notices WHERE id = p_privacy_notice_id AND retired_at IS NULL) THEN RAISE EXCEPTION 'active privacy notice required' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.profiling_cycles(barangay_id,name,sample_method,target_households,collection_starts_on,collection_ends_on,privacy_notice_id,created_by)
  VALUES (p_barangay_id,btrim(p_name),btrim(p_sample_method),p_target_households,p_collection_starts_on,p_collection_ends_on,p_privacy_notice_id,auth.uid()) RETURNING id INTO new_id;
  INSERT INTO public.profiling_events(cycle_id,event_type,to_status,actor_id) VALUES(new_id,'cycle_created','draft',auth.uid());
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_transition_profiling_cycle(
  p_cycle_id uuid, p_expected_version integer, p_to_status text, p_reason text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; allowed boolean; new_version integer;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage', cycle.barangay_id, NULL);
  IF cycle.row_version <> p_expected_version THEN RAISE EXCEPTION 'stale cycle version' USING ERRCODE = '40001'; END IF;
  allowed := (cycle.status='draft' AND p_to_status='collecting') OR (cycle.status='collecting' AND p_to_status='validating')
    OR (cycle.status='validating' AND p_to_status='completed') OR (cycle.status='completed' AND p_to_status='archived');
  IF NOT allowed THEN RAISE EXCEPTION 'invalid cycle transition' USING ERRCODE = '22023'; END IF;
  IF p_to_status='completed' AND EXISTS (SELECT 1 FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND status IN ('draft','pending','returned')) THEN
    RAISE EXCEPTION 'all profiling packages must be resolved before completion' USING ERRCODE = '23514';
  END IF;
  IF p_to_status='completed' AND EXISTS (SELECT 1 FROM public.profiling_duplicate_candidates WHERE cycle_id=p_cycle_id AND status='unresolved') THEN
    RAISE EXCEPTION 'all duplicate candidates must be resolved before completion' USING ERRCODE = '23514';
  END IF;
  UPDATE public.profiling_cycles SET status=p_to_status,row_version=row_version+1,updated_at=now(),
    completed_at=CASE WHEN p_to_status='completed' THEN now() ELSE completed_at END,
    completed_by=CASE WHEN p_to_status='completed' THEN auth.uid() ELSE completed_by END
  WHERE id=p_cycle_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,event_type,from_status,to_status,reason,actor_id)
  VALUES(p_cycle_id,'cycle_transition',cycle.status,p_to_status,nullif(btrim(p_reason),''),auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_endorse_profiling_cycle(p_cycle_id uuid, p_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; new_version integer;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.endorse',cycle.barangay_id,NULL);
  IF cycle.status NOT IN ('completed','archived') OR cycle.row_version<>p_expected_version OR cycle.captain_endorsed_at IS NOT NULL THEN RAISE EXCEPTION 'cycle cannot be endorsed' USING ERRCODE='40001'; END IF;
  UPDATE public.profiling_cycles SET captain_endorsed_at=now(),captain_endorsed_by=auth.uid(),row_version=row_version+1,updated_at=now() WHERE id=p_cycle_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,event_type,actor_id) VALUES(p_cycle_id,'captain_endorsed',auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_profiling_submission(
  p_cycle_id uuid, p_sitio_id uuid, p_payload jsonb, p_source_type text DEFAULT 'manual', p_import_batch_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; household_id uuid; submission_id uuid; resident_id uuid; sample_unit_id uuid; item jsonb; notice_version text; consent_name text;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL OR cycle.status <> 'collecting' THEN RAISE EXCEPTION 'cycle is not collecting' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  IF NOT EXISTS (SELECT 1 FROM public.barangay_sitios WHERE id=p_sitio_id AND barangay_id=cycle.barangay_id AND is_active) THEN RAISE EXCEPTION 'invalid sitio' USING ERRCODE='22023'; END IF;
  IF p_source_type NOT IN ('manual','xlsx','csv') OR public.phase1_json_has_prohibited_key(p_payload) THEN RAISE EXCEPTION 'invalid or prohibited profiling payload' USING ERRCODE='22023'; END IF;
  IF p_payload->>'participation_consent' <> 'granted' THEN RAISE EXCEPTION 'household participation consent is required' USING ERRCODE='23514'; END IF;
  consent_name := btrim(coalesce(p_payload->>'household_consent_name',''));
  IF length(consent_name)<1 THEN RAISE EXCEPTION 'household consent signer is required' USING ERRCODE='23514'; END IF;
  SELECT version INTO notice_version FROM public.profiling_privacy_notices WHERE id=cycle.privacy_notice_id AND retired_at IS NULL;
  IF notice_version IS NULL OR p_payload->>'privacy_notice_version' IS DISTINCT FROM notice_version THEN RAISE EXCEPTION 'active privacy notice version mismatch' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'residents','[]'::jsonb)) resident WHERE nullif(resident->>'resident_id','') IS NOT NULL) THEN RAISE EXCEPTION 'new packages cannot claim an existing resident identity' USING ERRCODE='22023'; END IF;
  IF nullif(p_payload->>'sample_reference','') IS NOT NULL THEN
    SELECT id INTO sample_unit_id FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND sitio_id=p_sitio_id AND sample_reference=p_payload->>'sample_reference' AND contact_outcome IN('not_contacted','unavailable','participated');
    IF sample_unit_id IS NULL THEN RAISE EXCEPTION 'sample reference is unavailable' USING ERRCODE='23514'; END IF;
    UPDATE public.profiling_sample_units SET contact_outcome='participated',updated_at=now() WHERE id=sample_unit_id;
  END IF;

  INSERT INTO public.profiling_households(barangay_id,sitio_id,household_code)
  VALUES(cycle.barangay_id,p_sitio_id,public.phase1_next_profile_code(cycle.barangay_id,'household')) RETURNING id INTO household_id;
  INSERT INTO public.profiling_submissions(cycle_id,sample_unit_id,household_id,sitio_id,source_type,import_batch_id,household_data,anonymous_nonparticipant_count,created_by)
  VALUES(p_cycle_id,sample_unit_id,household_id,p_sitio_id,p_source_type,p_import_batch_id,coalesce(p_payload->'household','{}'::jsonb),coalesce((p_payload->'household'->>'anonymous_nonparticipant_count')::integer,0),auth.uid()) RETURNING id INTO submission_id;
  INSERT INTO public.profiling_consents(submission_id,subject_type,status,privacy_notice_id,consented_by_name,recorded_by)
  VALUES(submission_id,'household','granted',cycle.privacy_notice_id,consent_name,auth.uid());

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'residents','[]'::jsonb)) LOOP
    IF item->>'consent_status' <> 'granted' THEN RAISE EXCEPTION 'identifiable resident requires granted consent' USING ERRCODE='23514'; END IF;
    IF coalesce((item->>'is_minor')::boolean,false) AND (nullif(btrim(item->>'guardian_name'),'') IS NULL OR nullif(btrim(item->>'guardian_relationship'),'') IS NULL) THEN
      RAISE EXCEPTION 'minor requires guardian authorization' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.profiling_residents(barangay_id,resident_code)
    VALUES(cycle.barangay_id,public.phase1_next_profile_code(cycle.barangay_id,'resident')) RETURNING id INTO resident_id;
    INSERT INTO public.profiling_resident_versions(submission_id,resident_id,profile_data,is_minor,relationship_to_head,is_household_head)
    VALUES(submission_id,resident_id,item - ARRAY['resident_id','consent_status','guardian_name','guardian_relationship'],coalesce((item->>'is_minor')::boolean,false),item->>'relationship_to_head',coalesce((item->>'is_household_head')::boolean,false));
    INSERT INTO public.profiling_household_memberships(household_id,resident_id,effective_from,created_by)
    VALUES(household_id,resident_id,current_date,auth.uid());
    INSERT INTO public.profiling_consents(submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,guardian_relationship,recorded_by)
    VALUES(submission_id,CASE WHEN coalesce((item->>'is_minor')::boolean,false) THEN 'guardian' ELSE 'adult' END,resident_id,'granted',cycle.privacy_notice_id,
      CASE WHEN coalesce((item->>'is_minor')::boolean,false) THEN item->>'guardian_name' ELSE concat_ws(' ',item->>'first_name',item->>'last_name') END,
      CASE WHEN coalesce((item->>'is_minor')::boolean,false) THEN item->>'guardian_relationship' ELSE NULL END,auth.uid());
  END LOOP;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,to_status,actor_id)
  VALUES(p_cycle_id,submission_id,household_id,'submission_created','draft',auth.uid());
  RETURN submission_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_submit_profiling_package(p_submission_id uuid,p_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; new_version integer;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,submission.sitio_id);
  IF submission.status NOT IN ('draft','returned') OR submission.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or invalid submission state' USING ERRCODE='40001'; END IF;
  UPDATE public.profiling_submissions SET status='pending',submitted_at=now(),return_reason=NULL,row_version=row_version+1,updated_at=now() WHERE id=p_submission_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,actor_id)
  VALUES(submission.cycle_id,p_submission_id,submission.household_id,'submission_submitted',submission.status,'pending',auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_decide_profiling_submission(
  p_submission_id uuid,p_expected_version integer,p_decision text,p_reason text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; next_status text; new_version integer;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,submission.sitio_id);
  IF submission.status<>'pending' OR submission.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or invalid submission state' USING ERRCODE='40001'; END IF;
  IF p_decision NOT IN ('approve','return') THEN RAISE EXCEPTION 'invalid decision' USING ERRCODE='22023'; END IF;
  IF p_decision='return' AND length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'return reason is required' USING ERRCODE='23514'; END IF;
  next_status := CASE WHEN p_decision='approve' THEN 'approved' ELSE 'returned' END;
  UPDATE public.profiling_submissions SET status=next_status,row_version=row_version+1,updated_at=now(),
    approved_at=CASE WHEN p_decision='approve' THEN now() ELSE NULL END,approved_by=CASE WHEN p_decision='approve' THEN auth.uid() ELSE NULL END,
    returned_at=CASE WHEN p_decision='return' THEN now() ELSE NULL END,returned_by=CASE WHEN p_decision='return' THEN auth.uid() ELSE NULL END,
    return_reason=CASE WHEN p_decision='return' THEN btrim(p_reason) ELSE NULL END
  WHERE id=p_submission_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,reason,actor_id)
  VALUES(submission.cycle_id,p_submission_id,submission.household_id,'submission_'||next_status,'pending',next_status,nullif(btrim(p_reason),''),auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_profile_lifecycle_action(
  p_entity_type text,p_entity_id uuid,p_expected_version integer,p_to_status text,p_reason text,p_merged_into_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE barangay uuid; old_status text; new_version integer; cycle_id uuid;
BEGIN
  IF length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'reason is required' USING ERRCODE='23514'; END IF;
  IF p_entity_type='household' THEN
    SELECT barangay_id,lifecycle_status INTO barangay,old_status FROM public.profiling_households WHERE id=p_entity_id FOR UPDATE;
    IF barangay IS NULL OR p_to_status NOT IN ('active','moved','dissolved','merged') THEN RAISE EXCEPTION 'invalid household lifecycle action' USING ERRCODE='22023'; END IF;
  ELSIF p_entity_type='resident' THEN
    SELECT barangay_id,lifecycle_status INTO barangay,old_status FROM public.profiling_residents WHERE id=p_entity_id FOR UPDATE;
    IF barangay IS NULL OR p_to_status NOT IN ('active','inactive','deceased','merged') THEN RAISE EXCEPTION 'invalid resident lifecycle action' USING ERRCODE='22023'; END IF;
  ELSE RAISE EXCEPTION 'invalid entity type' USING ERRCODE='22023'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',barangay,NULL);
  IF p_to_status='merged' AND p_merged_into_id IS NULL THEN RAISE EXCEPTION 'merge target required' USING ERRCODE='23514'; END IF;
  IF p_entity_type='household' THEN
    UPDATE public.profiling_households SET lifecycle_status=p_to_status,merged_into_id=p_merged_into_id,row_version=row_version+1,updated_at=now()
    WHERE id=p_entity_id AND row_version=p_expected_version RETURNING row_version INTO new_version;
  ELSE
    UPDATE public.profiling_residents SET lifecycle_status=p_to_status,merged_into_id=p_merged_into_id,row_version=row_version+1,updated_at=now()
    WHERE id=p_entity_id AND row_version=p_expected_version RETURNING row_version INTO new_version;
  END IF;
  IF new_version IS NULL THEN RAISE EXCEPTION 'stale entity version' USING ERRCODE='40001'; END IF;
  SELECT s.cycle_id INTO cycle_id FROM public.profiling_submissions s WHERE s.household_id=CASE WHEN p_entity_type='household' THEN p_entity_id ELSE NULL END ORDER BY s.created_at DESC LIMIT 1;
  IF cycle_id IS NULL AND p_entity_type='resident' THEN SELECT s.cycle_id INTO cycle_id FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id WHERE rv.resident_id=p_entity_id ORDER BY s.created_at DESC LIMIT 1; END IF;
  IF cycle_id IS NOT NULL THEN INSERT INTO public.profiling_events(cycle_id,household_id,resident_id,event_type,from_status,to_status,reason,actor_id)
    VALUES(cycle_id,CASE WHEN p_entity_type='household' THEN p_entity_id END,CASE WHEN p_entity_type='resident' THEN p_entity_id END,p_entity_type||'_lifecycle',old_status,p_to_status,btrim(p_reason),auth.uid()); END IF;
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_suppressed_count(p_value bigint,p_threshold integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
  SELECT CASE WHEN p_value BETWEEN 1 AND p_threshold-1
    THEN jsonb_build_object('suppressed',true,'value',NULL,'label','<'||p_threshold)
    ELSE jsonb_build_object('suppressed',false,'value',p_value,'label',p_value::text) END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_profiling_aggregate(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; threshold integer; households bigint; residents bigint; pending_count bigint; returned_count bigint; duplicate_count bigint; sex_cells jsonb; coverage numeric;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read',cycle.barangay_id,NULL);
  SELECT suppression_threshold INTO threshold FROM public.profiling_privacy_settings WHERE id=true;
  SELECT count(*) INTO households FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND status='approved';
  SELECT count(*) INTO residents FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id JOIN public.profiling_residents r ON r.id=rv.resident_id WHERE s.cycle_id=p_cycle_id AND s.status='approved' AND r.lifecycle_status='active';
  SELECT count(*) FILTER(WHERE status='pending'),count(*) FILTER(WHERE status='returned') INTO pending_count,returned_count FROM public.profiling_submissions WHERE cycle_id=p_cycle_id;
  SELECT count(*) INTO duplicate_count FROM public.profiling_duplicate_candidates WHERE cycle_id=p_cycle_id AND status='unresolved';
  coverage := CASE WHEN cycle.target_households>0 THEN round((households::numeric/cycle.target_households::numeric)*100,2) ELSE NULL END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('dimension','sex','key',sex,'count',public.phase1_suppressed_count(total,threshold)) ORDER BY sex),'[]'::jsonb)
  INTO sex_cells FROM (
    SELECT coalesce(rv.profile_data->>'sex','not_stated') sex,count(*) total
    FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id JOIN public.profiling_residents r ON r.id=rv.resident_id
    WHERE s.cycle_id=p_cycle_id AND s.status='approved' AND r.lifecycle_status='active' GROUP BY 1
  ) counts;
  RETURN jsonb_build_object(
    'schemaVersion','agape.profiling.aggregate.v1',
    'cycle',jsonb_build_object('id',cycle.id,'name',cycle.name,'status',cycle.status),
    'sample',jsonb_build_object('method',cycle.sample_method,'targetHouseholds',cycle.target_households,'approvedHouseholds',households,'approvedResidents',residents,'coveragePercent',coverage),
    'source',jsonb_build_object('kind','approved_sample','legacyExcluded',true),
    'asOf',now(),
    'privacy',jsonb_build_object('suppressionThreshold',threshold,'complementarySuppression',true),
    'dataQuality',jsonb_build_object('pendingPackages',pending_count,'returnedPackages',returned_count,'excludedPackages',0,'unresolvedDuplicates',duplicate_count),
    'cells',sex_cells
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase1_json_has_prohibited_key(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_assert_profiling_scope(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_next_profile_code(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_profiling_cycle(uuid,text,text,integer,date,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_transition_profiling_cycle(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_endorse_profiling_cycle(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_profiling_submission(uuid,uuid,jsonb,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_submit_profiling_package(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_decide_profiling_submission(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_profile_lifecycle_action(text,uuid,integer,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_profiling_aggregate(uuid) TO authenticated;

COMMIT;
