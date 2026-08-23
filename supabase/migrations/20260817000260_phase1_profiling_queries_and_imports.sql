-- Phase 1B scoped read models and synchronous import staging/commit.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_cycles(p_barangay_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; effective_barangay uuid; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF actor.role IN ('barangay_captain','barangay_secretary','barangay_mother_leader') THEN effective_barangay:=actor.barangay_id;
  ELSIF public.phase1_current_has_capability('profiling.cycle.manage') OR public.phase1_current_has_capability('profiling.aggregate.read') THEN effective_barangay:=p_barangay_id;
  ELSE RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'barangay_id',c.barangay_id,'name',c.name,'status',c.status,'sample_method',c.sample_method,
    'target_households',c.target_households,'collection_starts_on',c.collection_starts_on,'collection_ends_on',c.collection_ends_on,
    'row_version',c.row_version,'captain_endorsed_at',c.captain_endorsed_at,'created_at',c.created_at,
    'approved_households',(SELECT count(*) FROM public.profiling_submissions s WHERE s.cycle_id=c.id AND s.status='approved')
  ) ORDER BY c.created_at DESC),'[]'::jsonb) INTO result
  FROM public.profiling_cycles c WHERE effective_barangay IS NULL OR c.barangay_id=effective_barangay;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_sitios(p_barangay_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF actor.role IN ('barangay_captain','barangay_secretary','barangay_mother_leader') AND actor.barangay_id IS DISTINCT FROM p_barangay_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT (public.phase1_current_has_capability('profiling.collect') OR public.phase1_current_has_capability('profiling.validate') OR public.phase1_current_has_capability('profiling.endorse') OR public.phase1_current_has_capability('profiling.cycle.manage')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'barangay_id',s.barangay_id,'name',s.name,'aliases',s.aliases,'is_active',s.is_active) ORDER BY s.name),'[]'::jsonb)
  INTO result FROM public.barangay_sitios s
  WHERE s.barangay_id=p_barangay_id AND (actor.role<>'barangay_mother_leader' OR EXISTS(
    SELECT 1 FROM public.mother_leader_sitio_assignments a WHERE a.sitio_id=s.id AND a.mother_leader_id=actor.id
      AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)));
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_submissions(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid(); SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  IF actor.role='barangay_mother_leader' THEN
    IF NOT public.phase1_current_has_capability('profiling.collect') OR actor.barangay_id IS DISTINCT FROM cycle.barangay_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSIF actor.role='barangay_secretary' THEN PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,NULL);
  ELSIF actor.role='barangay_captain' THEN PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,NULL);
  ELSE PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,NULL); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'household_id',s.household_id,'household_code',h.household_code,'sitio_id',s.sitio_id,'sitio_name',si.name,
    'status',s.status,'row_version',s.row_version,'submission_version',s.submission_version,'source_type',s.source_type,
    'resident_count',(SELECT count(*) FROM public.profiling_resident_versions rv WHERE rv.submission_id=s.id),
    'submitted_at',s.submitted_at,'updated_at',s.updated_at,'return_reason',s.return_reason
  ) ORDER BY s.updated_at DESC),'[]'::jsonb) INTO result
  FROM public.profiling_submissions s JOIN public.profiling_households h ON h.id=s.household_id JOIN public.barangay_sitios si ON si.id=s.sitio_id
  WHERE s.cycle_id=p_cycle_id
    AND (actor.role<>'barangay_mother_leader' OR (s.created_by=actor.id AND EXISTS(SELECT 1 FROM public.mother_leader_sitio_assignments a WHERE a.mother_leader_id=actor.id AND a.sitio_id=s.sitio_id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date))))
    AND (actor.role<>'barangay_captain' OR s.status='approved');
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_get_profiling_submission(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; residents jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid(); SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  IF actor.role='barangay_mother_leader' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,submission.sitio_id);
    IF submission.created_by<>actor.id OR submission.status NOT IN ('draft','pending','returned') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,submission.sitio_id);
    IF actor.role='barangay_captain' AND submission.status<>'approved' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('resident_id',rv.resident_id,'resident_code',r.resident_code,'lifecycle_status',r.lifecycle_status,'profile',rv.profile_data,'is_minor',rv.is_minor,'relationship_to_head',rv.relationship_to_head,'is_household_head',rv.is_household_head)),'[]'::jsonb)
  INTO residents FROM public.profiling_resident_versions rv JOIN public.profiling_residents r ON r.id=rv.resident_id WHERE rv.submission_id=p_submission_id;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  SELECT actor.id,actor.email,'Resident profile viewed','profiling_submissions',p_submission_id::text,'warning',jsonb_build_object('cycle_id',cycle.id,'purpose','authorized profiling detail');
  RETURN jsonb_build_object('id',submission.id,'cycle_id',submission.cycle_id,'household_id',submission.household_id,'sitio_id',submission.sitio_id,'status',submission.status,'row_version',submission.row_version,'household',submission.household_data,'anonymous_nonparticipant_count',submission.anonymous_nonparticipant_count,'residents',residents);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_stage_profiling_import(
  p_cycle_id uuid,p_sitio_id uuid,p_source_type text,p_file_hash text,p_template_version text,p_packages jsonb,p_errors jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; v_batch_id uuid; existing_status text; final_status text; package jsonb; error_item jsonb; package_count integer; resident_count integer; duplicate_count integer;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL OR cycle.status<>'collecting' THEN RAISE EXCEPTION 'cycle is not collecting' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  IF p_source_type NOT IN ('xlsx','csv') OR p_file_hash !~ '^[a-f0-9]{64}$' OR p_template_version<>'AGAPE-PROFILING-V1' THEN RAISE EXCEPTION 'invalid import metadata' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_packages)<>'array' OR jsonb_typeof(p_errors)<>'array' OR public.phase1_json_has_prohibited_key(p_packages) THEN RAISE EXCEPTION 'invalid import rows' USING ERRCODE='22023'; END IF;
  package_count:=jsonb_array_length(p_packages); SELECT coalesce(sum(jsonb_array_length(coalesce(value->'payload'->'residents','[]'::jsonb))),0) INTO resident_count FROM jsonb_array_elements(p_packages);
  IF package_count+resident_count>10000 THEN RAISE EXCEPTION 'import exceeds 10000 rows' USING ERRCODE='22023'; END IF;
  SELECT id,status INTO v_batch_id,existing_status FROM public.profiling_import_batches WHERE cycle_id=p_cycle_id AND created_by=auth.uid() AND file_hash=p_file_hash FOR UPDATE;
  IF existing_status IS NOT NULL THEN
    SELECT count(*) INTO duplicate_count FROM public.profiling_duplicate_candidates WHERE batch_id=v_batch_id AND status='unresolved';
    RETURN jsonb_build_object('batch_id',v_batch_id,'status',existing_status,'duplicate_count',duplicate_count);
  END IF;
  final_status:=CASE WHEN jsonb_array_length(p_errors)>0 THEN 'needs_correction' ELSE 'ready' END;
  IF v_batch_id IS NULL THEN
    INSERT INTO public.profiling_import_batches(cycle_id,sitio_id,status,source_type,file_hash,template_version,household_row_count,resident_row_count,fatal_error_count,created_by)
    VALUES(p_cycle_id,p_sitio_id,final_status,p_source_type,p_file_hash,p_template_version,package_count,resident_count,jsonb_array_length(p_errors),auth.uid()) RETURNING id INTO v_batch_id;
  ELSE
    UPDATE public.profiling_import_batches SET sitio_id=p_sitio_id,status=final_status,source_type=p_source_type,template_version=p_template_version,household_row_count=package_count,resident_row_count=resident_count,fatal_error_count=jsonb_array_length(p_errors),updated_at=now() WHERE id=v_batch_id;
  END IF;
  DELETE FROM public.profiling_import_rows WHERE batch_id=v_batch_id;
  DELETE FROM public.profiling_import_errors WHERE batch_id=v_batch_id;
  DELETE FROM public.profiling_duplicate_candidates WHERE batch_id=v_batch_id AND status='unresolved';
  FOR package IN SELECT value FROM jsonb_array_elements(p_packages) LOOP
    INSERT INTO public.profiling_import_rows(batch_id,sheet_name,row_number,row_key,sanitized_data)
    VALUES(v_batch_id,'Households',coalesce((package->>'row_number')::integer,2),package->>'row_key',package->'payload');
  END LOOP;
  FOR error_item IN SELECT value FROM jsonb_array_elements(p_errors) LOOP
    INSERT INTO public.profiling_import_errors(batch_id,sheet_name,row_number,field_name,message,is_fatal)
    VALUES(v_batch_id,error_item->>'sheet',nullif(error_item->>'row','')::integer,error_item->>'field',left(coalesce(error_item->>'message','Invalid row'),500),coalesce((error_item->>'fatal')::boolean,true));
  END LOOP;
  INSERT INTO public.profiling_duplicate_candidates(cycle_id,batch_id,candidate_type,left_reference,right_reference,confidence)
  SELECT p_cycle_id,v_batch_id,'household',a.row_key,b.row_key,1
  FROM public.profiling_import_rows a JOIN public.profiling_import_rows b ON a.batch_id=b.batch_id AND a.id<b.id
  WHERE a.batch_id=v_batch_id AND nullif(a.sanitized_data->'household'->>'contact_number','') IS NOT NULL
    AND a.sanitized_data->'household'->>'contact_number'=b.sanitized_data->'household'->>'contact_number';

  INSERT INTO public.profiling_duplicate_candidates(cycle_id,batch_id,candidate_type,left_reference,right_reference,confidence)
  SELECT DISTINCT p_cycle_id,v_batch_id,'household',r.row_key,h.household_code,1
  FROM public.profiling_import_rows r JOIN public.profiling_submissions s ON s.cycle_id=p_cycle_id AND s.status='approved'
  JOIN public.profiling_households h ON h.id=s.household_id
  WHERE r.batch_id=v_batch_id AND nullif(r.sanitized_data->'household'->>'contact_number','') IS NOT NULL
    AND r.sanitized_data->'household'->>'contact_number'=s.household_data->>'contact_number';

  WITH imported AS (
    SELECT r.row_key,(person->>'first_name') first_name,(person->>'last_name') last_name,person->>'birth_date' birth_date
    FROM public.profiling_import_rows r CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.sanitized_data->'residents','[]'::jsonb)) person WHERE r.batch_id=v_batch_id
  )
  INSERT INTO public.profiling_duplicate_candidates(cycle_id,batch_id,candidate_type,left_reference,right_reference,confidence)
  SELECT DISTINCT p_cycle_id,v_batch_id,'resident',i.row_key,pr.resident_code,1
  FROM imported i JOIN public.profiling_resident_versions rv ON lower(rv.profile_data->>'first_name')=lower(i.first_name) AND lower(rv.profile_data->>'last_name')=lower(i.last_name) AND nullif(rv.profile_data->>'birth_date','')=nullif(i.birth_date,'')
  JOIN public.profiling_submissions s ON s.id=rv.submission_id AND s.status='approved'
  JOIN public.profiling_cycles existing_cycle ON existing_cycle.id=s.cycle_id AND existing_cycle.barangay_id=cycle.barangay_id
  JOIN public.profiling_residents pr ON pr.id=rv.resident_id
  WHERE nullif(i.birth_date,'') IS NOT NULL;

  SELECT count(*) INTO duplicate_count FROM public.profiling_duplicate_candidates WHERE batch_id=v_batch_id AND status='unresolved';
  IF duplicate_count>0 THEN final_status:='needs_correction'; UPDATE public.profiling_import_batches SET status=final_status,updated_at=now() WHERE id=v_batch_id; END IF;
  RETURN jsonb_build_object('batch_id',v_batch_id,'status',final_status,'duplicate_count',duplicate_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_commit_profiling_import(p_batch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.profiling_import_batches%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; staged record; submission_id uuid; committed integer:=0;
BEGIN
  SELECT * INTO batch FROM public.profiling_import_batches WHERE id=p_batch_id FOR UPDATE; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=batch.cycle_id;
  IF batch.id IS NULL THEN RAISE EXCEPTION 'batch not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,batch.sitio_id);
  IF batch.status='committed' THEN RETURN (SELECT count(*)::integer FROM public.profiling_submissions WHERE import_batch_id=p_batch_id); END IF;
  IF batch.status<>'ready' OR EXISTS(SELECT 1 FROM public.profiling_import_errors WHERE batch_id=p_batch_id AND is_fatal AND resolved_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.profiling_duplicate_candidates WHERE batch_id=p_batch_id AND status='unresolved') THEN RAISE EXCEPTION 'batch is not ready' USING ERRCODE='23514'; END IF;
  FOR staged IN SELECT * FROM public.profiling_import_rows WHERE batch_id=p_batch_id AND sheet_name='Households' AND excluded=false ORDER BY row_number LOOP
    submission_id:=public.phase1_create_profiling_submission(batch.cycle_id,batch.sitio_id,staged.sanitized_data,batch.source_type,batch.id);
    PERFORM public.phase1_submit_profiling_package(submission_id,1); committed:=committed+1;
  END LOOP;
  UPDATE public.profiling_import_rows SET sanitized_data=NULL WHERE batch_id=p_batch_id;
  UPDATE public.profiling_import_batches SET status='committed',committed_at=now(),committed_by=auth.uid(),updated_at=now() WHERE id=p_batch_id;
  INSERT INTO public.profiling_events(cycle_id,event_type,metadata,actor_id) VALUES(batch.cycle_id,'import_committed',jsonb_build_object('batch_id',batch.id,'packages',committed),auth.uid());
  RETURN committed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_purge_expired_import_staging()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE affected bigint;
BEGIN
  UPDATE public.profiling_import_rows r SET sanitized_data=NULL FROM public.profiling_import_batches b
  WHERE b.id=r.batch_id AND r.sanitized_data IS NOT NULL AND (b.status='committed' OR b.staging_purge_after<=now());
  GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_cycles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_sitios(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_submissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_get_profiling_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_stage_profiling_import(uuid,uuid,text,text,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_commit_profiling_import(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.phase1_purge_expired_import_staging() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_purge_expired_import_staging() TO service_role;

COMMIT;
