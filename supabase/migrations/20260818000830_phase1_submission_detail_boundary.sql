-- Phase 1 submission-detail boundary and stable comparison DTO.
-- Forward-only: detailed PII reads remain unavailable while profiling is off.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_get_profiling_submission(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  actor public.users%ROWTYPE;
  submission public.profiling_submissions%ROWTYPE;
  cycle public.profiling_cycles%ROWTYPE;
  household_code text;
  sitio_name text;
  sample_reference text;
  residents jsonb;
  consents jsonb;
  previous jsonb;
  previous_submission public.profiling_submissions%ROWTYPE;
  previous_residents jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL OR cycle.id IS NULL THEN
    RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002';
  END IF;

  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF actor.role='barangay_mother_leader' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,submission.sitio_id);
    IF submission.created_by<>actor.id OR submission.status NOT IN('draft','pending','returned') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  ELSE
    PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,submission.sitio_id);
    IF actor.role='barangay_captain' AND submission.status<>'approved' THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;

  SELECT h.household_code,s.name,u.sample_reference
  INTO household_code,sitio_name,sample_reference
  FROM public.profiling_households h
  JOIN public.barangay_sitios s ON s.id=submission.sitio_id
  LEFT JOIN public.profiling_sample_units u ON u.id=submission.sample_unit_id
  WHERE h.id=submission.household_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'resident_id',rv.resident_id,
    'resident_code',r.resident_code,
    'lifecycle_status',r.lifecycle_status,
    'profile',rv.profile_data,
    'is_minor',rv.is_minor,
    'relationship_to_head',rv.relationship_to_head,
    'is_household_head',rv.is_household_head,
    'version',rv.version
  ) ORDER BY rv.is_household_head DESC,rv.created_at),'[]'::jsonb)
  INTO residents
  FROM public.profiling_resident_versions rv
  JOIN public.profiling_residents r ON r.id=rv.resident_id
  WHERE rv.submission_id=submission.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'subject_type',c.subject_type,
    'resident_id',c.resident_id,
    'status',c.status,
    'privacy_notice_version',n.version,
    'consented_by_name',CASE WHEN actor.role='barangay_captain' THEN NULL ELSE c.consented_by_name END,
    'guardian_relationship',c.guardian_relationship,
    'effective_from',c.effective_from,
    'effective_to',c.effective_to,
    'withdrawal_reason',c.withdrawal_reason
  ) ORDER BY c.subject_type,c.recorded_at),'[]'::jsonb)
  INTO consents
  FROM public.profiling_consents c
  JOIN public.profiling_privacy_notices n ON n.id=c.privacy_notice_id
  WHERE c.submission_id=submission.id;

  IF submission.supersedes_submission_id IS NOT NULL THEN
    SELECT * INTO previous_submission
    FROM public.profiling_submissions
    WHERE id=submission.supersedes_submission_id AND household_id=submission.household_id;
    IF previous_submission.id IS NOT NULL THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'resident_id',rv.resident_id,
        'resident_code',r.resident_code,
        'lifecycle_status',r.lifecycle_status,
        'profile',rv.profile_data,
        'is_minor',rv.is_minor,
        'relationship_to_head',rv.relationship_to_head,
        'is_household_head',rv.is_household_head,
        'version',rv.version
      ) ORDER BY rv.is_household_head DESC,rv.created_at),'[]'::jsonb)
      INTO previous_residents
      FROM public.profiling_resident_versions rv
      JOIN public.profiling_residents r ON r.id=rv.resident_id
      WHERE rv.submission_id=previous_submission.id;
      previous:=jsonb_build_object(
        'id',previous_submission.id,
        'status',previous_submission.status,
        'submission_version',previous_submission.submission_version,
        'household',previous_submission.household_data,
        'residents',previous_residents
      );
    END IF;
  END IF;

  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  VALUES(actor.id,actor.email,'Resident profile viewed','profiling_submissions',submission.id::text,'warning',
    jsonb_build_object('cycle_id',cycle.id,'purpose','authorized profiling detail comparison'));

  RETURN jsonb_build_object(
    'id',submission.id,
    'cycle_id',submission.cycle_id,
    'household_id',submission.household_id,
    'household_code',household_code,
    'sample_reference',sample_reference,
    'sitio_id',submission.sitio_id,
    'sitio_name',sitio_name,
    'status',submission.status,
    'row_version',submission.row_version,
    'submission_version',submission.submission_version,
    'household',submission.household_data,
    'anonymous_nonparticipant_count',submission.anonymous_nonparticipant_count,
    'residents',residents,
    'consents',consents,
    'previous',previous
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase1_get_profiling_submission(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase1_get_profiling_submission(uuid) TO authenticated;

COMMIT;
