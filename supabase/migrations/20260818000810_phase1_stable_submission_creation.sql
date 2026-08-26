-- Phase 1 release-gate correction: bind a sampled unit to its stable household
-- and make initial/reprofile package creation concurrency-safe.
BEGIN;

DO $open_package_preflight$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.profiling_submissions
    WHERE status IN('draft','pending','returned')
    GROUP BY sample_unit_id HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'multiple open packages for one sample unit must be reconciled'; END IF;
END;
$open_package_preflight$;
CREATE UNIQUE INDEX IF NOT EXISTS profiling_one_open_package_per_sample
  ON public.profiling_submissions(sample_unit_id)
  WHERE status IN('draft','pending','returned');

CREATE OR REPLACE FUNCTION public.phase1_create_profiling_submission(
  p_cycle_id uuid,p_sitio_id uuid,p_payload jsonb,
  p_source_type text DEFAULT 'manual',p_import_batch_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  cycle public.profiling_cycles%ROWTYPE;
  sample public.profiling_sample_units%ROWTYPE;
  household public.profiling_households%ROWTYPE;
  prior public.profiling_submissions%ROWTYPE;
  new_submission_id uuid;
  current_resident_id uuid;
  resident_item jsonb;
  minor boolean;
  submission_number integer;
  resident_version integer;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL OR cycle.status<>'collecting' THEN RAISE EXCEPTION 'cycle is not collecting' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  PERFORM public.phase1_assert_profiling_payload(p_payload,p_cycle_id,p_sitio_id,cycle.collection_starts_on);
  IF p_source_type NOT IN('manual','xlsx','csv') OR public.phase1_json_has_prohibited_key(p_payload) THEN RAISE EXCEPTION 'invalid or prohibited profiling payload' USING ERRCODE='22023'; END IF;
  IF p_payload->>'privacy_notice_version' IS DISTINCT FROM (SELECT version FROM public.profiling_privacy_notices WHERE id=cycle.privacy_notice_id AND retired_at IS NULL) THEN RAISE EXCEPTION 'active privacy notice version mismatch' USING ERRCODE='23514'; END IF;

  SELECT * INTO sample FROM public.profiling_sample_units
  WHERE cycle_id=p_cycle_id AND sitio_id=p_sitio_id AND sample_reference=p_payload->>'sample_reference'
  FOR UPDATE;
  IF sample.id IS NULL OR sample.contact_outcome IN('refused','ineligible') THEN RAISE EXCEPTION 'registered sample unit is unavailable' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiling_submissions s WHERE s.sample_unit_id=sample.id AND s.status<>'superseded') THEN
    RAISE EXCEPTION 'sample unit already has a package; use the revision workflow' USING ERRCODE='23505';
  END IF;

  IF sample.household_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'residents') item WHERE nullif(item->>'resident_id','') IS NOT NULL) THEN RAISE EXCEPTION 'an initial package cannot claim an existing resident identity' USING ERRCODE='23514'; END IF;
    INSERT INTO public.profiling_households(barangay_id,sitio_id,household_code)
    VALUES(cycle.barangay_id,p_sitio_id,public.phase1_next_profile_code(cycle.barangay_id,'household')) RETURNING * INTO household;
    UPDATE public.profiling_sample_units SET household_id=household.id,contact_outcome='participated',row_version=row_version+1,updated_at=now() WHERE id=sample.id;
  ELSE
    SELECT * INTO household FROM public.profiling_households WHERE id=sample.household_id FOR UPDATE;
    IF household.id IS NULL OR household.barangay_id<>cycle.barangay_id OR household.sitio_id<>p_sitio_id OR household.lifecycle_status<>'active' OR household.merged_into_id IS NOT NULL THEN RAISE EXCEPTION 'sample household is unavailable for reprofiling' USING ERRCODE='23514'; END IF;
    SELECT s.* INTO prior FROM public.profiling_submissions s
    JOIN public.profiling_cycles c ON c.id=s.cycle_id
    WHERE s.household_id=household.id AND s.status='approved' AND c.collection_starts_on<cycle.collection_starts_on
    ORDER BY c.collection_starts_on DESC,s.submission_version DESC LIMIT 1 FOR UPDATE OF s;
    IF prior.id IS NULL OR coalesce((p_payload->>'expected_version')::integer,-1)<>prior.row_version THEN RAISE EXCEPTION 'stale approved roster version' USING ERRCODE='40001'; END IF;
    IF EXISTS(
      SELECT 1 FROM public.profiling_household_memberships membership
      WHERE membership.household_id=household.id AND membership.activated_at IS NOT NULL
        AND membership.effective_from<=cycle.collection_starts_on
        AND (membership.effective_to IS NULL OR cycle.collection_starts_on<membership.effective_to)
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'residents') item WHERE item->>'resident_id'=membership.resident_id::text)
    ) THEN RAISE EXCEPTION 'reprofile package must preserve the complete active roster' USING ERRCODE='23514'; END IF;
    UPDATE public.profiling_sample_units SET contact_outcome='participated',row_version=row_version+1,updated_at=now() WHERE id=sample.id;
  END IF;

  SELECT coalesce(max(s.submission_version),0)+1 INTO submission_number FROM public.profiling_submissions s WHERE s.cycle_id=cycle.id AND s.household_id=household.id;
  INSERT INTO public.profiling_submissions(
    cycle_id,sample_unit_id,household_id,sitio_id,status,submission_version,source_type,
    import_batch_id,household_data,anonymous_nonparticipant_count,created_by
  ) VALUES(
    cycle.id,sample.id,household.id,p_sitio_id,'draft',submission_number,p_source_type,
    p_import_batch_id,p_payload->'household',(p_payload->'household'->>'anonymous_nonparticipant_count')::integer,auth.uid()
  ) RETURNING id INTO new_submission_id;
  INSERT INTO public.profiling_consents(
    submission_id,subject_type,status,privacy_notice_id,consented_by_name,effective_from,recorded_by
  ) VALUES(new_submission_id,'household','granted',cycle.privacy_notice_id,btrim(p_payload->>'household_consent_name'),cycle.collection_starts_on,auth.uid());

  FOR resident_item IN SELECT value FROM jsonb_array_elements(p_payload->'residents') LOOP
    minor:=public.phase1_assert_resident_payload(resident_item,cycle.collection_starts_on);
    current_resident_id:=nullif(resident_item->>'resident_id','')::uuid;
    IF current_resident_id IS NULL THEN
      INSERT INTO public.profiling_residents(barangay_id,resident_code)
      VALUES(cycle.barangay_id,public.phase1_next_profile_code(cycle.barangay_id,'resident')) RETURNING id INTO current_resident_id;
      INSERT INTO public.profiling_household_memberships(
        household_id,resident_id,effective_from,reason,created_by
      ) VALUES(household.id,current_resident_id,cycle.collection_starts_on,'pending sampled household roster',auth.uid());
    ELSIF NOT EXISTS(
      SELECT 1 FROM public.profiling_residents resident
      JOIN public.profiling_household_memberships membership ON membership.resident_id=resident.id
      WHERE resident.id=current_resident_id AND resident.barangay_id=cycle.barangay_id
        AND resident.lifecycle_status='active' AND resident.merged_into_id IS NULL
        AND membership.household_id=household.id AND membership.activated_at IS NOT NULL
        AND membership.effective_from<=cycle.collection_starts_on
        AND (membership.effective_to IS NULL OR cycle.collection_starts_on<membership.effective_to)
    ) THEN RAISE EXCEPTION 'resident identity is not linked to the selected household' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM public.profiling_resident_versions v WHERE v.submission_id=new_submission_id AND v.resident_id=current_resident_id) THEN RAISE EXCEPTION 'resident appears more than once in the roster' USING ERRCODE='23505'; END IF;
    SELECT coalesce(max(v.version),0)+1 INTO resident_version FROM public.profiling_resident_versions v WHERE v.resident_id=current_resident_id;
    INSERT INTO public.profiling_resident_versions(
      submission_id,resident_id,profile_data,is_minor,relationship_to_head,is_household_head,version
    ) VALUES(
      new_submission_id,current_resident_id,resident_item-ARRAY['resident_id','consent_status','guardian_name','guardian_relationship','household_row_key'],
      minor,resident_item->>'relationship_to_head',(resident_item->>'relationship_to_head')='household_head',resident_version
    );
    INSERT INTO public.profiling_consents(
      submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,
      guardian_relationship,effective_from,recorded_by
    ) VALUES(
      new_submission_id,CASE WHEN minor THEN 'guardian' ELSE 'adult' END,current_resident_id,'granted',cycle.privacy_notice_id,
      CASE WHEN minor THEN btrim(resident_item->>'guardian_name') ELSE concat_ws(' ',resident_item->>'first_name',resident_item->>'last_name') END,
      CASE WHEN minor THEN btrim(resident_item->>'guardian_relationship') END,cycle.collection_starts_on,auth.uid()
    );
  END LOOP;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,to_status,metadata,actor_id)
  VALUES(cycle.id,new_submission_id,household.id,'submission_created','draft',jsonb_build_object('sample_unit_id',sample.id,'stable_household_id',household.id),auth.uid());
  RETURN new_submission_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase1_create_profiling_submission(uuid,uuid,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase1_create_profiling_submission(uuid,uuid,jsonb,text,uuid) TO authenticated;

DO $preserve_revision_implementation$
BEGIN
  IF to_regprocedure('public.phase1_revise_returned_profiling_submission_internal_v2(uuid,integer,jsonb)') IS NULL THEN
    ALTER FUNCTION public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb)
      RENAME TO phase1_revise_returned_profiling_submission_internal_v2;
  END IF;
END;
$preserve_revision_implementation$;

CREATE OR REPLACE FUNCTION public.phase1_revise_returned_profiling_submission(
  p_submission_id uuid,p_expected_version integer,p_payload jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE previous public.profiling_submissions%ROWTYPE; replacement_id uuid;
BEGIN
  SELECT * INTO previous FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE;
  IF previous.id IS NULL OR previous.status<>'returned' OR previous.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'stale or invalid returned package' USING ERRCODE='40001';
  END IF;
  UPDATE public.profiling_consents
  SET effective_to=effective_from
  WHERE submission_id=previous.id AND effective_to IS NULL;
  replacement_id:=public.phase1_revise_returned_profiling_submission_internal_v2(p_submission_id,p_expected_version,p_payload);
  RETURN replacement_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase1_revise_returned_profiling_submission_internal_v2(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb) TO authenticated;

COMMIT;
