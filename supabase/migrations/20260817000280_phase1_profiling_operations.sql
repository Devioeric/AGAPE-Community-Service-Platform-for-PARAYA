-- Phase 1B operational closures: code-prefix configuration, explicit duplicate
-- decisions, and complementary suppression enforced inside the database.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_set_barangay_profile_prefix(p_barangay_id uuid, p_prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE normalized text;
BEGIN
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',p_barangay_id,NULL);
  normalized:=upper(btrim(p_prefix));
  IF normalized !~ '^[A-Z0-9]{2,8}$' THEN RAISE EXCEPTION 'prefix must contain 2 to 8 letters or numbers' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiling_households WHERE barangay_id=p_barangay_id)
    OR EXISTS(SELECT 1 FROM public.profiling_residents WHERE barangay_id=p_barangay_id) THEN
    RAISE EXCEPTION 'prefix is immutable after profiling codes are issued' USING ERRCODE='23514';
  END IF;
  UPDATE public.barangays SET profile_code_prefix=normalized WHERE id=p_barangay_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'barangay not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.profiling_events(cycle_id,event_type,metadata,actor_id)
  SELECT c.id,'barangay_prefix_configured',jsonb_build_object('barangay_id',p_barangay_id,'prefix',normalized),auth.uid()
  FROM public.profiling_cycles c WHERE c.barangay_id=p_barangay_id ORDER BY c.created_at DESC LIMIT 1;
  RETURN normalized;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_duplicates(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  IF public.phase1_current_has_capability('profiling.validate') THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,NULL);
  ELSE
    PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',cycle.barangay_id,NULL);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'cycle_id',d.cycle_id,'batch_id',d.batch_id,'candidate_type',d.candidate_type,
    'left_reference',d.left_reference,'right_reference',d.right_reference,'confidence',d.confidence,
    'status',d.status,'resolution_reason',d.resolution_reason,'created_at',d.created_at
  ) ORDER BY d.created_at),'[]'::jsonb) INTO result
  FROM public.profiling_duplicate_candidates d WHERE d.cycle_id=p_cycle_id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_resolve_profiling_duplicate(
  p_candidate_id uuid,p_resolution text,p_reason text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE candidate public.profiling_duplicate_candidates%ROWTYPE; cycle public.profiling_cycles%ROWTYPE;
BEGIN
  SELECT * INTO candidate FROM public.profiling_duplicate_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF candidate.id IS NULL THEN RAISE EXCEPTION 'duplicate candidate not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=candidate.cycle_id;
  IF public.phase1_current_has_capability('profiling.validate') THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,NULL);
  ELSE
    PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',cycle.barangay_id,NULL);
  END IF;
  IF candidate.status<>'unresolved' THEN RAISE EXCEPTION 'duplicate candidate is already resolved' USING ERRCODE='40001'; END IF;
  IF p_resolution NOT IN ('distinct','exclude') OR length(btrim(coalesce(p_reason,'')))<3 THEN
    RAISE EXCEPTION 'a valid resolution and reason are required' USING ERRCODE='22023';
  END IF;
  UPDATE public.profiling_duplicate_candidates SET status=p_resolution,resolution_reason=btrim(p_reason),resolved_at=now(),resolved_by=auth.uid()
  WHERE id=p_candidate_id;
  IF p_resolution='exclude' AND candidate.batch_id IS NOT NULL THEN
    UPDATE public.profiling_import_rows SET excluded=true WHERE batch_id=candidate.batch_id AND row_key=candidate.left_reference;
  END IF;
  IF candidate.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiling_duplicate_candidates WHERE batch_id=candidate.batch_id AND status='unresolved')
    AND NOT EXISTS(SELECT 1 FROM public.profiling_import_errors WHERE batch_id=candidate.batch_id AND is_fatal AND resolved_at IS NULL) THEN
    UPDATE public.profiling_import_batches SET status='ready',updated_at=now() WHERE id=candidate.batch_id AND status='needs_correction';
  END IF;
  INSERT INTO public.profiling_events(cycle_id,event_type,reason,metadata,actor_id)
  VALUES(candidate.cycle_id,'duplicate_resolved',btrim(p_reason),jsonb_build_object('candidate_id',candidate.id,'resolution',p_resolution),auth.uid());
  RETURN p_resolution;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_record_sample_outcome(
  p_cycle_id uuid,p_sitio_id uuid,p_sample_reference text,p_contact_outcome text,p_anonymous_household_size integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; unit_id uuid; existing_sitio uuid;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL OR cycle.status<>'collecting' THEN RAISE EXCEPTION 'cycle is not collecting' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  IF p_sample_reference !~ '^[A-Za-z0-9._-]{2,80}$' OR p_contact_outcome NOT IN('not_contacted','unavailable','participated','refused','ineligible') THEN RAISE EXCEPTION 'invalid sample outcome' USING ERRCODE='22023'; END IF;
  IF p_anonymous_household_size IS NOT NULL AND p_anonymous_household_size NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'invalid anonymous household size' USING ERRCODE='22023'; END IF;
  SELECT sitio_id INTO existing_sitio FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND sample_reference=p_sample_reference FOR UPDATE;
  IF existing_sitio IS NOT NULL AND existing_sitio IS DISTINCT FROM p_sitio_id THEN RAISE EXCEPTION 'sample reference belongs to another sitio' USING ERRCODE='42501'; END IF;
  INSERT INTO public.profiling_sample_units(cycle_id,sitio_id,sample_reference,contact_outcome,anonymous_household_size,refusal_recorded_at,recorded_by)
  VALUES(p_cycle_id,p_sitio_id,p_sample_reference,p_contact_outcome,p_anonymous_household_size,CASE WHEN p_contact_outcome='refused' THEN now() END,auth.uid())
  ON CONFLICT(cycle_id,sample_reference) DO UPDATE SET contact_outcome=excluded.contact_outcome,anonymous_household_size=excluded.anonymous_household_size,
    refusal_recorded_at=CASE WHEN excluded.contact_outcome='refused' THEN now() ELSE NULL END,updated_at=now()
  RETURNING id INTO unit_id;
  INSERT INTO public.profiling_events(cycle_id,event_type,metadata,actor_id)
  VALUES(p_cycle_id,'sample_outcome_recorded',jsonb_build_object('sample_unit_id',unit_id,'outcome',p_contact_outcome,'identifiable',false),auth.uid());
  RETURN unit_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_revise_returned_profiling_submission(
  p_submission_id uuid,p_expected_version integer,p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE previous public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; new_submission_id uuid; v_resident_id uuid; item jsonb; notice_version text; consent_name text;
BEGIN
  SELECT * INTO previous FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE;
  IF previous.id IS NULL OR previous.status<>'returned' OR previous.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or invalid returned package' USING ERRCODE='40001'; END IF;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=previous.cycle_id FOR UPDATE;
  IF cycle.status NOT IN('collecting','validating') THEN RAISE EXCEPTION 'cycle does not accept corrections' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,previous.sitio_id);
  IF previous.created_by<>auth.uid() OR public.phase1_json_has_prohibited_key(p_payload) OR p_payload->>'participation_consent'<>'granted' THEN RAISE EXCEPTION 'forbidden or invalid correction' USING ERRCODE='42501'; END IF;
  consent_name:=btrim(coalesce(p_payload->>'household_consent_name',''));
  SELECT version INTO notice_version FROM public.profiling_privacy_notices WHERE id=cycle.privacy_notice_id AND retired_at IS NULL;
  IF length(consent_name)<1 OR notice_version IS NULL OR p_payload->>'privacy_notice_version' IS DISTINCT FROM notice_version THEN RAISE EXCEPTION 'consent or notice mismatch' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiling_resident_versions old_version WHERE old_version.submission_id=previous.id AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'residents','[]'::jsonb)) supplied WHERE nullif(supplied->>'resident_id','')::uuid=old_version.resident_id
  )) THEN RAISE EXCEPTION 'existing residents cannot be omitted; use a lifecycle action' USING ERRCODE='23514'; END IF;

  UPDATE public.profiling_submissions SET status='superseded',row_version=row_version+1,updated_at=now() WHERE id=previous.id;
  INSERT INTO public.profiling_submissions(cycle_id,sample_unit_id,household_id,sitio_id,status,submission_version,source_type,household_data,anonymous_nonparticipant_count,created_by)
  VALUES(previous.cycle_id,previous.sample_unit_id,previous.household_id,previous.sitio_id,'draft',previous.submission_version+1,'manual',coalesce(p_payload->'household','{}'::jsonb),coalesce((p_payload->'household'->>'anonymous_nonparticipant_count')::integer,0),auth.uid())
  RETURNING id INTO new_submission_id;
  INSERT INTO public.profiling_consents(submission_id,subject_type,status,privacy_notice_id,consented_by_name,recorded_by)
  VALUES(new_submission_id,'household','granted',cycle.privacy_notice_id,consent_name,auth.uid());
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'residents','[]'::jsonb)) LOOP
    IF item->>'consent_status'<>'granted' THEN RAISE EXCEPTION 'identifiable resident requires consent' USING ERRCODE='23514'; END IF;
    v_resident_id:=nullif(item->>'resident_id','')::uuid;
    IF v_resident_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiling_resident_versions rv WHERE rv.submission_id=previous.id AND rv.resident_id=v_resident_id) THEN RAISE EXCEPTION 'resident does not belong to previous package' USING ERRCODE='23514'; END IF;
    IF v_resident_id IS NULL THEN
      INSERT INTO public.profiling_residents(barangay_id,resident_code) VALUES(cycle.barangay_id,public.phase1_next_profile_code(cycle.barangay_id,'resident')) RETURNING id INTO v_resident_id;
      INSERT INTO public.profiling_household_memberships(household_id,resident_id,effective_from,created_by) VALUES(previous.household_id,v_resident_id,current_date,auth.uid());
    END IF;
    IF coalesce((item->>'is_minor')::boolean,false) AND (nullif(btrim(item->>'guardian_name'),'') IS NULL OR nullif(btrim(item->>'guardian_relationship'),'') IS NULL) THEN RAISE EXCEPTION 'minor requires guardian authorization' USING ERRCODE='23514'; END IF;
    INSERT INTO public.profiling_resident_versions(submission_id,resident_id,profile_data,is_minor,relationship_to_head,is_household_head)
    VALUES(new_submission_id,v_resident_id,item-ARRAY['resident_id','consent_status','guardian_name','guardian_relationship'],coalesce((item->>'is_minor')::boolean,false),item->>'relationship_to_head',coalesce((item->>'is_household_head')::boolean,false));
    INSERT INTO public.profiling_consents(submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,guardian_relationship,recorded_by)
    VALUES(new_submission_id,CASE WHEN coalesce((item->>'is_minor')::boolean,false) THEN 'guardian' ELSE 'adult' END,v_resident_id,'granted',cycle.privacy_notice_id,
      CASE WHEN coalesce((item->>'is_minor')::boolean,false) THEN item->>'guardian_name' ELSE concat_ws(' ',item->>'first_name',item->>'last_name') END,
      CASE WHEN coalesce((item->>'is_minor')::boolean,false) THEN item->>'guardian_relationship' END,auth.uid());
  END LOOP;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,metadata,actor_id)
  VALUES(previous.cycle_id,new_submission_id,previous.household_id,'submission_revised','returned','draft',jsonb_build_object('supersedes',previous.id),auth.uid());
  RETURN new_submission_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_complementary_suppress(p_cells jsonb,p_threshold integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $function$
DECLARE hidden integer; peer_key text;
BEGIN
  SELECT count(*) INTO hidden FROM jsonb_array_elements(coalesce(p_cells,'[]'::jsonb)) cell WHERE (cell->'count'->>'suppressed')::boolean;
  IF hidden<>1 THEN RETURN coalesce(p_cells,'[]'::jsonb); END IF;
  SELECT cell->>'key' INTO peer_key FROM jsonb_array_elements(p_cells) cell
  WHERE NOT (cell->'count'->>'suppressed')::boolean
  ORDER BY (cell->'count'->>'value')::bigint ASC LIMIT 1;
  IF peer_key IS NULL THEN RETURN p_cells; END IF;
  RETURN (SELECT jsonb_agg(CASE WHEN cell->>'key'=peer_key
    THEN jsonb_set(cell,'{count}',jsonb_build_object('suppressed',true,'value',NULL,'label','suppressed')) ELSE cell END)
    FROM jsonb_array_elements(p_cells) cell);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_profiling_aggregate(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; official public.official_population_snapshots%ROWTYPE; threshold integer; households bigint; residents bigint; pending_count bigint; returned_count bigint; duplicate_count bigint; sex_cells jsonb; coverage numeric;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read',cycle.barangay_id,NULL);
  SELECT * INTO official FROM public.official_population_snapshots WHERE barangay_id=cycle.barangay_id ORDER BY as_of_date DESC,created_at DESC LIMIT 1;
  SELECT suppression_threshold INTO threshold FROM public.profiling_privacy_settings WHERE id=true;
  SELECT count(*) INTO households FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND status='approved';
  SELECT count(*) INTO residents FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id JOIN public.profiling_residents r ON r.id=rv.resident_id WHERE s.cycle_id=p_cycle_id AND s.status='approved' AND r.lifecycle_status='active';
  SELECT count(*) FILTER(WHERE status='pending'),count(*) FILTER(WHERE status='returned') INTO pending_count,returned_count FROM public.profiling_submissions WHERE cycle_id=p_cycle_id;
  SELECT count(*) INTO duplicate_count FROM public.profiling_duplicate_candidates WHERE cycle_id=p_cycle_id AND status='unresolved';
  coverage:=CASE WHEN cycle.target_households>0 THEN round((households::numeric/cycle.target_households::numeric)*100,2) ELSE NULL END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('dimension','sex','key',sex,'count',public.phase1_suppressed_count(total,threshold)) ORDER BY sex),'[]'::jsonb)
  INTO sex_cells FROM (SELECT coalesce(rv.profile_data->>'sex','not_stated') sex,count(*) total
    FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id JOIN public.profiling_residents r ON r.id=rv.resident_id
    WHERE s.cycle_id=p_cycle_id AND s.status='approved' AND r.lifecycle_status='active' GROUP BY 1) counts;
  sex_cells:=public.phase1_complementary_suppress(sex_cells,threshold);
  RETURN jsonb_build_object('schemaVersion','agape.profiling.aggregate.v1','cycle',jsonb_build_object('id',cycle.id,'name',cycle.name,'status',cycle.status),
    'sample',jsonb_build_object('method',cycle.sample_method,'targetHouseholds',cycle.target_households,'approvedHouseholds',households,'approvedResidents',residents,'coveragePercent',coverage),
    'source',jsonb_build_object('kind','approved_sample','legacyExcluded',true),
    'official',jsonb_build_object('totalPopulation',official.total_population,'totalHouseholds',official.total_households,'sourceName',official.source_name,'asOfDate',official.as_of_date),
    'asOf',now(),
    'privacy',jsonb_build_object('suppressionThreshold',threshold,'complementarySuppression',true),
    'dataQuality',jsonb_build_object('pendingPackages',pending_count,'returnedPackages',returned_count,'excludedPackages',0,'unresolvedDuplicates',duplicate_count),'cells',sex_cells);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phase1_set_barangay_profile_prefix(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_duplicates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_resolve_profiling_duplicate(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_record_sample_outcome(uuid,uuid,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.phase1_complementary_suppress(jsonb,integer) FROM PUBLIC,anon,authenticated;

COMMIT;
