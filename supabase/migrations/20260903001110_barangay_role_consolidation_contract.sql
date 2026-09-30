-- Contract phase for the confirmed 2026-09-03 Barangay role consolidation.
-- Retired identities and historical attribution remain; all effective login
-- and workflow authority is reduced to the Barangay Secretary role.
BEGIN;

SET LOCAL search_path = public, extensions, pg_catalog;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Application-account cutover is deliberately fail-closed and non-destructive.
UPDATE public.users
SET status='suspended',is_active=false,updated_at=now()
WHERE role IN ('barangay_captain','barangay_mother_leader','barangay_official')
  AND (status<>'suspended' OR is_active IS TRUE);

UPDATE public.mother_leader_sitio_assignments
SET effective_to=greatest(effective_from,CURRENT_DATE)
WHERE effective_to IS NULL OR effective_to>CURRENT_DATE;

UPDATE public.profiling_submissions submission
SET current_editor_id=NULL,updated_at=now()
WHERE submission.status IN ('draft','returned')
  AND EXISTS (
    SELECT 1 FROM public.users editor
    WHERE editor.id=submission.current_editor_id
      AND (editor.status<>'active' OR editor.is_active IS NOT TRUE
        OR editor.role<>'barangay_secretary')
  );

-- A Researcher-authored pending package cannot be self-reviewed. If no other
-- active Researcher exists at cutover, return it to the Secretary handoff queue
-- through an explicitly system-attributed event; never rewrite its creator.
WITH stranded AS (
  SELECT submission.id
  FROM public.profiling_submissions submission
  JOIN public.users creator ON creator.id=submission.created_by
  WHERE submission.status='pending'
    AND creator.role='paraya_researcher'
    AND NOT EXISTS (
      SELECT 1 FROM public.users independent_reviewer
      WHERE independent_reviewer.role='paraya_researcher'
        AND independent_reviewer.status='active'
        AND independent_reviewer.is_active IS TRUE
        AND independent_reviewer.id<>submission.created_by
    )
  FOR UPDATE OF submission
), returned AS (
  UPDATE public.profiling_submissions submission
  SET status='returned',returned_at=now(),returned_by=NULL,
      return_reason='Returned during role consolidation because no independent Researcher was available.',
      current_editor_id=NULL,row_version=row_version+1,updated_at=now()
  FROM stranded
  WHERE submission.id=stranded.id
  RETURNING submission.id,submission.cycle_id,submission.household_id
)
INSERT INTO public.profiling_events(
  cycle_id,submission_id,household_id,event_type,from_status,to_status,reason,metadata,actor_id
)
SELECT cycle_id,id,household_id,'submission_returned','pending','returned',
  'No independent PARAYA Researcher was available at role cutover.',
  jsonb_build_object('system_attributed',true,'cutover','barangay-role-consolidation-2026-09-03'),NULL
FROM returned;

UPDATE public.community_needs
SET approval_status='pending_paraya_review',updated_at=now()
WHERE approval_status='pending_captain';

ALTER TABLE public.community_needs
  DROP CONSTRAINT IF EXISTS community_needs_approval_status_check;
ALTER TABLE public.community_needs
  ADD CONSTRAINT community_needs_approval_status_check
  CHECK (approval_status IN ('pending_paraya_review','approved','rejected','needs_revision'));

ALTER TABLE public.users VALIDATE CONSTRAINT users_retired_barangay_role_inactive_check;
ALTER TABLE public.users VALIDATE CONSTRAINT users_active_secretary_barangay_check;

CREATE OR REPLACE FUNCTION public.phase0_current_account_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users account
    WHERE account.id=auth.uid()
      AND account.status='active'
      AND account.is_active IS TRUE
      AND account.role NOT IN ('barangay_captain','barangay_mother_leader','barangay_official')
  );
$function$;

-- Minimal stale-session classifier used by login and middleware. It reveals
-- only the retirement condition, never an account, resident, or barangay row.
CREATE OR REPLACE FUNCTION public.phase0_current_account_has_retired_barangay_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users account
    WHERE account.id=auth.uid()
      AND account.role IN ('barangay_captain','barangay_mother_leader','barangay_official')
  );
$function$;

CREATE OR REPLACE FUNCTION public.phase0_current_invite_can_complete()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users identity
    JOIN public.users account ON account.id=identity.id
    WHERE identity.id=auth.uid()
      AND identity.invited_at IS NOT NULL
      AND identity.deleted_at IS NULL
      AND account.status='pending'
      AND account.is_active IS FALSE
      AND account.role IN (
        'paraya_director','paraya_associate','paraya_researcher',
        'finance_officer','barangay_secretary','volunteer','admin'
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.phase1_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
  SELECT CASE
    WHEN p_role='admin' THEN p_capability IN('admin.users.manage','admin.audit.read','admin.recovery.read')
    WHEN p_role IN('office','student_org','department') THEN p_capability='legacy_partner.history.read'
    WHEN p_role='finance_officer' THEN p_capability IN('proposal.read','proposal.finance')
    WHEN p_role='volunteer' THEN p_capability IN('program.read','volunteer.self','survey.read','survey.respond','attendance.self','activity_log.self','communication.read','communication.write','ai.assist')
    WHEN p_role='barangay_secretary' THEN p_capability IN(
      'partnership.read','proposal.validation.record','survey.read','survey.respond',
      'community_need.read','community_need.submit','observation.read',
      'skill_asset.read','skill_asset.manage','report.read','communication.read',
      'communication.write','ai.assist','profiling.collect','profiling.detail.read',
      'profiling.aggregate.read','profiling.acknowledge'
    )
    WHEN p_role='paraya_director' THEN p_capability IN('partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','proposal.validation.record','proposal.decide','program.read','program.manage','volunteer.directory.read','volunteer.manage','survey.read','survey.manage','survey.analyze','community_need.read','community_need.manage','observation.read','observation.manage','skill_asset.read','skill_asset.manage','attendance.manage','activity_log.manage','donation.read','donation.manage','impact.read','impact.manage','analytics.aggregate.read','report.read','report.manage','communication.read','communication.write','communication.manage','communication.moderate','ai.assist','profiling.aggregate.read','profiling.privacy.configure')
    WHEN p_role='paraya_associate' THEN p_capability IN('partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','proposal.validation.record','program.read','program.manage','volunteer.directory.read','volunteer.manage','survey.read','survey.manage','survey.analyze','community_need.read','community_need.manage','observation.read','observation.manage','skill_asset.read','skill_asset.manage','attendance.manage','activity_log.manage','donation.read','donation.manage','impact.read','impact.manage','analytics.aggregate.read','report.read','report.manage','communication.read','communication.write','communication.manage','communication.moderate','ai.assist','profiling.aggregate.read')
    WHEN p_role='paraya_researcher' THEN p_capability IN('partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','proposal.validation.record','program.read','program.manage','volunteer.directory.read','volunteer.manage','survey.read','survey.manage','survey.analyze','community_need.read','community_need.manage','community_need.validate','observation.read','observation.manage','skill_asset.read','skill_asset.manage','attendance.manage','activity_log.manage','donation.read','donation.manage','impact.read','impact.manage','analytics.aggregate.read','report.read','report.manage','communication.read','communication.write','communication.manage','communication.moderate','ai.assist','profiling.aggregate.read','profiling.cycle.manage','profiling.validate','profiling.detail.read')
    ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT public.phase1_role_has_capability(p_role,p_capability) OR CASE
  WHEN p_role='paraya_director' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.category.manage',
   'ai.recommendation.review','ai.recommendation.configure','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review',
   'integrity.finance.read','integrity.finance.request'])
  WHEN p_role='paraya_associate' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','proposal.submit','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='paraya_researcher' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'ai.recommendation.review','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='finance_officer' THEN p_capability=ANY(ARRAY['budget.read','budget.review','budget.liquidation.review','integrity.finance.read','integrity.finance.request'])
  WHEN p_role='barangay_secretary' THEN p_capability='historical_program.read'
  WHEN p_role='volunteer' THEN p_capability='volunteer.preferences.manage'
  WHEN p_role='admin' THEN p_capability=ANY(ARRAY['integrity.provider.manage','communication.provider.manage'])
  ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_assert_profiling_scope(
  p_capability text,p_barangay_id uuid,p_sitio_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE
     OR actor.role IN ('barangay_captain','barangay_mother_leader','barangay_official')
     OR NOT public.phase1_current_has_capability(p_capability) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF actor.role='barangay_secretary' AND actor.barangay_id IS DISTINCT FROM p_barangay_id THEN
    RAISE EXCEPTION 'cross-barangay access denied' USING ERRCODE='42501';
  END IF;
END;
$function$;

-- Preserve the validated staging implementation behind a scoped wrapper so
-- a Secretary can supersede correction-required staging left by a retired or
-- inactive collector without changing the historical batch creator.
DO $rename_import_staging_internal$
BEGIN
  IF to_regprocedure('public.phase1_stage_profiling_import_v2_role_consolidation_internal(uuid,uuid,text,text,text,jsonb,jsonb,uuid)') IS NULL THEN
    ALTER FUNCTION public.phase1_stage_profiling_import_v2(uuid,uuid,text,text,text,jsonb,jsonb,uuid)
      RENAME TO phase1_stage_profiling_import_v2_role_consolidation_internal;
  END IF;
END;
$rename_import_staging_internal$;

CREATE OR REPLACE FUNCTION public.phase1_stage_profiling_import_v2(
  p_cycle_id uuid,p_sitio_id uuid,p_source_type text,p_file_hash text,
  p_template_version text,p_packages jsonb,p_errors jsonb,
  p_replaces_batch_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  cycle public.profiling_cycles%ROWTYPE;
  replaced public.profiling_import_batches%ROWTYPE;
  owner public.users%ROWTYPE;
  result jsonb;
  new_batch_id uuid;
  legacy_handoff boolean:=false;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);

  IF p_replaces_batch_id IS NOT NULL THEN
    SELECT * INTO replaced FROM public.profiling_import_batches
    WHERE id=p_replaces_batch_id FOR UPDATE;
    IF replaced.id IS NULL OR replaced.cycle_id<>p_cycle_id
       OR replaced.status NOT IN('needs_correction','failed','purged') THEN
      RAISE EXCEPTION 'replaced batch is unavailable' USING ERRCODE='23514';
    END IF;
    IF replaced.created_by<>auth.uid() THEN
      SELECT * INTO owner FROM public.users WHERE id=replaced.created_by;
      IF owner.id IS NULL OR (owner.status='active' AND owner.is_active IS TRUE
         AND owner.role NOT IN('barangay_captain','barangay_mother_leader','barangay_official')) THEN
        RAISE EXCEPTION 'only retired or inactive owner staging may be handed off' USING ERRCODE='42501';
      END IF;
      legacy_handoff:=true;
    END IF;
  END IF;

  result:=public.phase1_stage_profiling_import_v2_role_consolidation_internal(
    p_cycle_id,p_sitio_id,p_source_type,p_file_hash,p_template_version,
    p_packages,p_errors,CASE WHEN legacy_handoff THEN NULL ELSE p_replaces_batch_id END
  );

  IF legacy_handoff THEN
    new_batch_id:=(result->>'batch_id')::uuid;
    IF EXISTS(
      SELECT 1 FROM public.profiling_import_batches
      WHERE replaces_batch_id=p_replaces_batch_id AND id<>new_batch_id
    ) OR EXISTS(
      SELECT 1 FROM public.profiling_import_batches
      WHERE id=new_batch_id AND replaces_batch_id IS NOT NULL
        AND replaces_batch_id<>p_replaces_batch_id
    ) THEN
      RAISE EXCEPTION 'replacement batch is stale' USING ERRCODE='40001';
    END IF;
    UPDATE public.profiling_import_batches
    SET replaces_batch_id=p_replaces_batch_id
    WHERE id=new_batch_id AND replaces_batch_id IS NULL;
    result:=result||jsonb_build_object('legacyHandoff',true);
  END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_set_profiling_runtime(
  p_mode text,
  p_synthetic_user_ids uuid[] DEFAULT '{}',
  p_synthetic_barangay_ids uuid[] DEFAULT '{}',
  p_privacy_approved boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF p_mode='synthetic' THEN
    IF EXISTS(
      SELECT 1 FROM unnest(p_synthetic_user_ids) id
      WHERE NOT EXISTS(
        SELECT 1 FROM public.users actor
        WHERE actor.id=id AND actor.is_synthetic_test
          AND actor.status='active' AND actor.is_active IS TRUE
          AND actor.role NOT IN('barangay_captain','barangay_mother_leader','barangay_official')
      )
    ) OR EXISTS(
      SELECT 1 FROM unnest(p_synthetic_barangay_ids) id
      WHERE NOT EXISTS(SELECT 1 FROM public.barangays barangay WHERE barangay.id=id AND barangay.is_synthetic_test)
    ) THEN
      RAISE EXCEPTION 'synthetic mode accepts only active non-retired test users and demo barangays' USING ERRCODE='23514';
    END IF;
  END IF;
  IF p_mode<>'off' AND EXISTS(
    SELECT 1
    FROM public.barangays barangay
    WHERE barangay.is_active IS TRUE
      AND (p_mode<>'synthetic' OR barangay.id=ANY(coalesce(p_synthetic_barangay_ids,'{}'::uuid[])))
      AND NOT EXISTS(
        SELECT 1 FROM public.users secretary
        WHERE secretary.role='barangay_secretary'
          AND secretary.status='active' AND secretary.is_active IS TRUE
          AND secretary.barangay_id=barangay.id
      )
  ) THEN
    RAISE EXCEPTION 'every participating barangay requires an active Barangay Secretary' USING ERRCODE='23514';
  END IF;
  RETURN public.phase1_set_profiling_runtime_internal(
    p_mode,p_synthetic_user_ids,p_synthetic_barangay_ids,p_privacy_approved
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_cycles(p_barangay_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; effective_barangay uuid; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE
     OR actor.role IN ('barangay_captain','barangay_mother_leader','barangay_official') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF actor.role='barangay_secretary' THEN
    effective_barangay:=actor.barangay_id;
  ELSIF public.phase1_current_has_capability('profiling.cycle.manage')
     OR public.phase1_current_has_capability('profiling.aggregate.read') THEN
    effective_barangay:=p_barangay_id;
  ELSE RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'barangay_id',c.barangay_id,'name',c.name,'status',c.status,
    'sample_method',c.sample_method,'target_households',c.target_households,
    'collection_starts_on',c.collection_starts_on,'collection_ends_on',c.collection_ends_on,
    'row_version',c.row_version,'captain_endorsed_at',c.captain_endorsed_at,
    'completed_at',c.completed_at,
    'barangay_acknowledged_at',c.barangay_acknowledged_at,
    'barangay_acknowledgment_note',c.barangay_acknowledgment_note,
    'created_at',c.created_at,'approved_households',(
      SELECT count(*) FROM public.profiling_submissions s WHERE s.cycle_id=c.id AND s.status='approved'
    )) ORDER BY c.created_at DESC),'[]'::jsonb) INTO result
  FROM public.profiling_cycles c
  WHERE effective_barangay IS NULL OR c.barangay_id=effective_barangay;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_sitios(p_barangay_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE
     OR actor.role IN ('barangay_captain','barangay_mother_leader','barangay_official') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF actor.role='barangay_secretary' AND actor.barangay_id IS DISTINCT FROM p_barangay_id THEN
    RAISE EXCEPTION 'cross-barangay access denied' USING ERRCODE='42501';
  END IF;
  IF NOT (public.phase1_current_has_capability('profiling.collect')
    OR public.phase1_current_has_capability('profiling.validate')
    OR public.phase1_current_has_capability('profiling.cycle.manage')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'barangay_id',s.barangay_id,'name',s.name,'aliases',s.aliases,'is_active',s.is_active
  ) ORDER BY s.name),'[]'::jsonb) INTO result
  FROM public.barangay_sitios s WHERE s.barangay_id=p_barangay_id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_submissions(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF actor.role='barangay_secretary' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,NULL);
  ELSIF actor.role='paraya_researcher' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,NULL);
  ELSE
    PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,NULL);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'household_id',s.household_id,'household_code',h.household_code,
    'sitio_id',s.sitio_id,'sitio_name',si.name,'status',s.status,
    'row_version',s.row_version,'submission_version',s.submission_version,
    'source_type',s.source_type,'created_by',s.created_by,'current_editor_id',s.current_editor_id,
    'resident_count',(SELECT count(*) FROM public.profiling_resident_versions rv WHERE rv.submission_id=s.id),
    'submitted_at',s.submitted_at,'updated_at',s.updated_at,'return_reason',s.return_reason
  ) ORDER BY s.updated_at DESC),'[]'::jsonb) INTO result
  FROM public.profiling_submissions s
  JOIN public.profiling_households h ON h.id=s.household_id
  JOIN public.barangay_sitios si ON si.id=s.sitio_id
  WHERE s.cycle_id=p_cycle_id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_get_profiling_submission(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
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
  IF actor.role='barangay_secretary' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,submission.sitio_id);
  ELSIF actor.role='paraya_researcher' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,submission.sitio_id);
  ELSE
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT household.household_code,sitio.name,sample.sample_reference
  INTO household_code,sitio_name,sample_reference
  FROM public.profiling_households household
  JOIN public.barangay_sitios sitio ON sitio.id=submission.sitio_id
  LEFT JOIN public.profiling_sample_units sample ON sample.id=submission.sample_unit_id
  WHERE household.id=submission.household_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'resident_id',version.resident_id,'resident_code',resident.resident_code,
    'lifecycle_status',resident.lifecycle_status,'profile',version.profile_data,
    'is_minor',version.is_minor,'relationship_to_head',version.relationship_to_head,
    'is_household_head',version.is_household_head,'version',version.version
  ) ORDER BY version.is_household_head DESC,version.created_at),'[]'::jsonb)
  INTO residents
  FROM public.profiling_resident_versions version
  JOIN public.profiling_residents resident ON resident.id=version.resident_id
  WHERE version.submission_id=submission.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',consent.id,'subject_type',consent.subject_type,
    'resident_id',consent.resident_id,'status',consent.status,
    'privacy_notice_version',notice.version,
    'consented_by_name',consent.consented_by_name,
    'guardian_relationship',consent.guardian_relationship,
    'effective_from',consent.effective_from,'effective_to',consent.effective_to,
    'withdrawal_reason',consent.withdrawal_reason
  ) ORDER BY consent.subject_type,consent.recorded_at),'[]'::jsonb)
  INTO consents
  FROM public.profiling_consents consent
  JOIN public.profiling_privacy_notices notice ON notice.id=consent.privacy_notice_id
  WHERE consent.submission_id=submission.id;

  IF submission.supersedes_submission_id IS NOT NULL THEN
    SELECT * INTO previous_submission FROM public.profiling_submissions
    WHERE id=submission.supersedes_submission_id AND household_id=submission.household_id;
    IF previous_submission.id IS NOT NULL THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'resident_id',version.resident_id,'resident_code',resident.resident_code,
        'lifecycle_status',resident.lifecycle_status,'profile',version.profile_data,
        'is_minor',version.is_minor,'relationship_to_head',version.relationship_to_head,
        'is_household_head',version.is_household_head,'version',version.version
      ) ORDER BY version.is_household_head DESC,version.created_at),'[]'::jsonb)
      INTO previous_residents
      FROM public.profiling_resident_versions version
      JOIN public.profiling_residents resident ON resident.id=version.resident_id
      WHERE version.submission_id=previous_submission.id;
      previous:=jsonb_build_object(
        'id',previous_submission.id,'status',previous_submission.status,
        'submission_version',previous_submission.submission_version,
        'household',previous_submission.household_data,'residents',previous_residents
      );
    END IF;
  END IF;

  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  VALUES(actor.id,actor.email,'Resident profile viewed','profiling_submissions',submission.id::text,'warning',
    jsonb_build_object('cycle_id',cycle.id,'purpose','authorized profiling detail comparison'));
  RETURN jsonb_build_object(
    'id',submission.id,'cycle_id',submission.cycle_id,'household_id',submission.household_id,
    'household_code',household_code,'sample_reference',sample_reference,
    'sitio_id',submission.sitio_id,'sitio_name',sitio_name,'status',submission.status,
    'row_version',submission.row_version,'submission_version',submission.submission_version,
    'created_by',submission.created_by,'current_editor_id',submission.current_editor_id,
    'household',submission.household_data,
    'anonymous_nonparticipant_count',submission.anonymous_nonparticipant_count,
    'residents',residents,'consents',consents,'previous',previous
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_sample_units(p_cycle_id uuid,p_sitio_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; actor public.users%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF actor.role='barangay_secretary' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  ELSIF public.phase1_current_has_capability('profiling.cycle.manage') THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',cycle.barangay_id,NULL);
  ELSIF public.phase1_current_has_capability('profiling.validate') THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,p_sitio_id);
  ELSE RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'sitioId',u.sitio_id,'sampleReference',u.sample_reference,
    'contactOutcome',u.contact_outcome,'anonymousHouseholdSize',u.anonymous_household_size,
    'householdId',u.household_id,'replacementOfId',u.replacement_of_id,
    'replacementReason',u.replacement_reason,'rowVersion',u.row_version
  ) ORDER BY u.sample_reference),'[]'::jsonb) INTO result
  FROM public.profiling_sample_units u
  WHERE u.cycle_id=p_cycle_id AND (p_sitio_id IS NULL OR u.sitio_id=p_sitio_id);
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_submit_profiling_package(p_submission_id uuid,p_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; new_version integer;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,submission.sitio_id);
  IF submission.current_editor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the current package editor may submit it' USING ERRCODE='42501';
  END IF;
  IF submission.status NOT IN('draft','returned') OR submission.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'stale or invalid submission state' USING ERRCODE='40001';
  END IF;
  UPDATE public.profiling_submissions
  SET status='pending',submitted_at=now(),return_reason=NULL,row_version=row_version+1,updated_at=now()
  WHERE id=p_submission_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,actor_id)
  VALUES(submission.cycle_id,p_submission_id,submission.household_id,'submission_submitted',submission.status,'pending',auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_decide_profiling_submission(
  p_submission_id uuid,p_expected_version integer,p_decision text,p_reason text DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; next_status text; new_version integer;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,submission.sitio_id);
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='paraya_researcher' AND status='active' AND is_active) THEN
    RAISE EXCEPTION 'only an active PARAYA Researcher may validate a package' USING ERRCODE='42501';
  END IF;
  IF submission.created_by=auth.uid() THEN
    RAISE EXCEPTION 'a submitter cannot validate their own profiling package' USING ERRCODE='42501';
  END IF;
  IF submission.status<>'pending' OR submission.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'stale or invalid submission state' USING ERRCODE='40001';
  END IF;
  IF p_decision NOT IN('approve','return')
     OR (p_decision='return' AND char_length(btrim(coalesce(p_reason,'')))<3) THEN
    RAISE EXCEPTION 'invalid decision' USING ERRCODE='22023';
  END IF;
  next_status:=CASE WHEN p_decision='approve' THEN 'approved' ELSE 'returned' END;
  IF p_decision='approve' AND submission.supersedes_submission_id IS NOT NULL THEN
    UPDATE public.profiling_submissions SET status='superseded',row_version=row_version+1,updated_at=now()
    WHERE id=submission.supersedes_submission_id AND cycle_id=submission.cycle_id
      AND household_id=submission.household_id AND status='approved';
  END IF;
  UPDATE public.profiling_submissions
  SET status=next_status,row_version=row_version+1,updated_at=now(),
      approved_at=CASE WHEN p_decision='approve' THEN now() END,
      approved_by=CASE WHEN p_decision='approve' THEN auth.uid() END,
      returned_at=CASE WHEN p_decision='return' THEN now() END,
      returned_by=CASE WHEN p_decision='return' THEN auth.uid() END,
      return_reason=CASE WHEN p_decision='return' THEN btrim(p_reason) END,
      current_editor_id=CASE WHEN p_decision='return' THEN current_editor_id ELSE NULL END
  WHERE id=p_submission_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,reason,actor_id)
  VALUES(submission.cycle_id,p_submission_id,submission.household_id,'submission_'||next_status,
    'pending',next_status,nullif(btrim(p_reason),''),auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_revise_returned_profiling_submission(
  p_submission_id uuid,p_expected_version integer,p_payload jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE previous public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; replacement_id uuid;
BEGIN
  SELECT * INTO previous FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE;
  IF previous.id IS NULL OR previous.status<>'returned' OR previous.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'stale or invalid returned package' USING ERRCODE='40001';
  END IF;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=previous.cycle_id;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,previous.sitio_id);
  IF NOT EXISTS(
    SELECT 1 FROM public.users
    WHERE id=auth.uid() AND role='barangay_secretary'
      AND status='active' AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'only an active Barangay Secretary may revise a returned package' USING ERRCODE='42501';
  END IF;
  IF previous.current_editor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'claim the returned package before revising it' USING ERRCODE='42501';
  END IF;
  UPDATE public.profiling_consents SET effective_to=effective_from
  WHERE submission_id=previous.id AND effective_to IS NULL;
  replacement_id:=public.phase1_revise_returned_profiling_submission_internal_v2(
    p_submission_id,p_expected_version,p_payload
  );
  RETURN replacement_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_authorize_document_read(p_kind text,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE bucket text; path text; parent uuid; status text; allowed boolean:=false; visibility text; linked_barangay uuid;
BEGIN
 IF p_kind='partnership' THEN
  SELECT 'phase2-partnership-documents',d.storage_path,d.partner_id,d.scan_status,d.visibility,e.barangay_id
  INTO bucket,path,parent,status,visibility,linked_barangay
  FROM public.partnership_documents d JOIN public.partner_entities e ON e.id=d.partner_id WHERE d.id=p_document_id;
  PERFORM public.phase2_assert_runtime('partners',parent);
  allowed:=public.phase2_current_has_capability('partner.document.read') OR (
    visibility='linked_barangay' AND EXISTS(
      SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.status='active' AND u.is_active
        AND u.role='barangay_secretary' AND u.barangay_id=linked_barangay
        AND coalesce((u.permissions->>'partnerships')::boolean,true) IS NOT FALSE));
 ELSIF p_kind='historical' THEN
  SELECT 'phase2-historical-evidence',d.storage_path,d.historical_program_id,d.scan_status
  INTO bucket,path,parent,status FROM public.historical_program_documents d WHERE d.id=p_document_id;
  PERFORM public.phase2_assert_runtime('historical_programs',parent); allowed:=public.phase2_current_has_capability('historical_program.read');
 ELSIF p_kind='proposal_budget' THEN
  SELECT 'phase2-proposal-budget-evidence',d.storage_path,r.proposal_id,d.scan_status
  INTO bucket,path,parent,status FROM public.proposal_budget_documents d JOIN public.proposal_budget_revisions r ON r.id=d.revision_id WHERE d.id=p_document_id;
  PERFORM public.phase2_assert_runtime('proposals',parent); allowed:=public.phase2_current_has_capability('budget.read');
 ELSIF p_kind='program_finance' THEN
  SELECT 'phase2-program-financial-evidence',d.storage_path,d.program_id,d.scan_status
  INTO bucket,path,parent,status FROM public.program_financial_documents d WHERE d.id=p_document_id;
  PERFORM public.phase2_assert_runtime('program_finance',parent); allowed:=public.phase2_current_has_capability('budget.read');
 ELSE RAISE EXCEPTION 'unknown document kind' USING ERRCODE='22023'; END IF;
 IF path IS NULL THEN RAISE EXCEPTION 'document not found' USING ERRCODE='P0002'; END IF;
 IF NOT allowed OR status NOT IN('approved','risk_accepted') THEN RAISE EXCEPTION 'document is unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.phase2_storage_read_events(bucket_id,object_path,parent_type,parent_id,actor_id)
 VALUES(bucket,path,p_kind,parent,auth.uid());
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'phase2.document.read',p_kind,p_document_id::text,jsonb_build_object('parent_id',parent));
 RETURN jsonb_build_object('bucket',bucket,'path',path);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase7_get_dashboard_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; cards jsonb:='[]'::jsonb; unread_count bigint;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE
    OR actor.role IN('office','student_org','department','paraya_officer','barangay_official','barangay_captain','barangay_mother_leader') THEN
  RAISE EXCEPTION 'inactive or historical actor' USING ERRCODE='42501';
 END IF;
 SELECT count(*) INTO unread_count FROM public.notifications WHERE user_id=actor.id AND is_read=false;
 IF actor.role='admin' THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','active_users','label','Active accounts','value',(SELECT count(*) FROM public.users WHERE status='active' AND is_active=true),'href','/admin/users','tone','neutral'),
   jsonb_build_object('key','pending_users','label','Pending accounts','value',(SELECT count(*) FROM public.users WHERE status='pending'),'href','/admin/users','tone','warning'),
   jsonb_build_object('key','security_events','label','Audit events (30 days)','value',(SELECT count(*) FROM public.audit_logs WHERE created_at>=now()-interval '30 days'),'href','/admin/audit-logs','tone','info'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/admin/notifications','tone','neutral'));
 ELSIF actor.role='finance_officer' THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','finance_queue','label','Proposals for Finance','value',(SELECT count(*) FROM public.project_proposals WHERE status='finance_review'),'href','/officer/finance','tone','warning'),
   jsonb_build_object('key','budget_queue','label','Submitted budgets','value',(SELECT count(*) FROM public.proposal_budget_revisions WHERE status='submitted'),'href','/officer/phase-2','tone','info'),
   jsonb_build_object('key','liquidation_queue','label','Submitted liquidations','value',(SELECT count(*) FROM public.liquidation_submissions WHERE status='submitted'),'href','/officer/phase-2','tone','warning'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/officer/notifications','tone','neutral'));
 ELSIF actor.role IN('paraya_director','paraya_associate') THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','programs','label','Operational programs','value',(SELECT count(*) FROM public.programs WHERE status<>'cancelled'),'href','/officer/programs','tone','info'),
   jsonb_build_object('key','proposal_queue','label','Open proposals','value',(SELECT count(*) FROM public.project_proposals WHERE status NOT IN('approved','rejected')),'href','/officer/proposals','tone','warning'),
   jsonb_build_object('key','active_partnerships','label','Active partnerships','value',(SELECT count(*) FROM public.partnership_terms WHERE status='active' AND (expires_on IS NULL OR expires_on>=CURRENT_DATE)),'href','/officer/partnerships','tone','success'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/officer/notifications','tone','neutral'));
 ELSIF actor.role='paraya_researcher' THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','profiling_reviews','label','Profiling packages awaiting review','value',(SELECT count(*) FROM public.profiling_submissions WHERE status='pending'),'href','/officer/profiling','tone','warning'),
   jsonb_build_object('key','needs_reviews','label','Community needs awaiting review','value',(SELECT count(*) FROM public.community_needs WHERE approval_status='pending_paraya_review'),'href','/officer/community-needs/review','tone','warning'),
   jsonb_build_object('key','programs','label','Operational programs','value',(SELECT count(*) FROM public.programs WHERE status<>'cancelled'),'href','/officer/programs','tone','info'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/officer/notifications','tone','neutral'));
 ELSIF actor.role='barangay_secretary' THEN
  IF actor.barangay_id IS NULL THEN RAISE EXCEPTION 'barangay scope missing' USING ERRCODE='42501'; END IF;
  cards:=jsonb_build_array(
   jsonb_build_object('key','partnership','label','Barangay partnership','value',1,'href','/barangay/partnership','tone','info'),
   jsonb_build_object('key','needs_review','label','Needs awaiting PARAYA review','value',(SELECT count(*) FROM public.community_needs WHERE barangay_id=actor.barangay_id AND approval_status='pending_paraya_review'),'href','/barangay/submit-needs','tone','warning'),
   jsonb_build_object('key','needs_revision','label','Needs requiring revision','value',(SELECT count(*) FROM public.community_needs WHERE barangay_id=actor.barangay_id AND approval_status='needs_revision'),'href','/barangay/submit-needs','tone','warning'),
   jsonb_build_object('key','approved_profiles','label','Approved sample packages','value',(SELECT count(*) FROM public.profiling_submissions s JOIN public.profiling_cycles c ON c.id=s.cycle_id WHERE c.barangay_id=actor.barangay_id AND s.status='approved'),'href','/barangay/profiling','tone','success'),
   jsonb_build_object('key','profiling_acknowledgments','label','Validated cycles awaiting acknowledgment','value',(SELECT count(*) FROM public.profiling_cycles c WHERE c.barangay_id=actor.barangay_id AND c.status IN('completed','archived') AND c.barangay_acknowledged_at IS NULL AND c.completed_at>='2026-09-03'::date),'href','/barangay/profiling','tone','neutral'),
   jsonb_build_object('key','skills_assets','label','Skills and assets','value',(SELECT count(*) FROM public.barangay_skills WHERE barangay_id=actor.barangay_id)+(SELECT count(*) FROM public.barangay_assets WHERE barangay_id=actor.barangay_id),'href','/barangay/skills-assets','tone','neutral'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/barangay/notifications','tone','neutral'));
 ELSIF actor.role='volunteer' THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','joined_programs','label','Programs joined','value',(SELECT count(*) FROM public.program_signups WHERE volunteer_id=actor.id AND status<>'withdrawn' AND approval_status='approved'),'href','/volunteer/programs','tone','info'),
   jsonb_build_object('key','approved_hours','label','Approved service hours','value',coalesce((SELECT round(sum(hours)::numeric,2) FROM public.activity_logs WHERE volunteer_id=actor.id AND status='approved'),0),'href','/volunteer/activity-log','tone','success'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/volunteer/notifications','tone','neutral'));
 ELSE RAISE EXCEPTION 'unsupported role' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('schema','agape.dashboard.summary.v2','role',actor.role,'asOf',now(),'cards',cards);
END;
$function$;

-- Retire obsolete workflow entry points while preserving their definitions as
-- historical migration evidence.
REVOKE ALL ON FUNCTION public.phase1_assign_mother_leader(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_close_mother_leader_assignment(uuid,date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_endorse_profiling_cycle(uuid,integer) FROM PUBLIC,anon,authenticated;

-- The baseline policy exposed public.users to anon/PUBLIC. Replace it with
-- capability-scoped authenticated reads plus self access.
DROP POLICY IF EXISTS users_read_all ON public.users;
DROP POLICY IF EXISTS users_role_scoped_read ON public.users;
CREATE POLICY users_role_scoped_read ON public.users
FOR SELECT TO authenticated
USING (
  id=auth.uid()
  OR public.phase1_current_has_capability('admin.users.manage')
  OR public.phase1_current_has_capability('volunteer.directory.read')
);

-- Replace legacy `barangay_official` community-needs policies. Mutations stay
-- behind the application service and transactional decision/resubmit RPCs;
-- authenticated direct access is read-only and scoped here.
DROP POLICY IF EXISTS needs_insert_authorized ON public.community_needs;
DROP POLICY IF EXISTS needs_own_barangay ON public.community_needs;
DROP POLICY IF EXISTS community_needs_scoped_read ON public.community_needs;
CREATE POLICY community_needs_scoped_read ON public.community_needs
FOR SELECT TO authenticated
USING (
  public.phase1_current_has_capability('community_need.manage')
  OR (
    public.phase1_current_has_capability('community_need.read')
    AND EXISTS (
      SELECT 1 FROM public.users actor
      WHERE actor.id=auth.uid()
        AND actor.role='barangay_secretary'
        AND actor.barangay_id=community_needs.barangay_id
    )
  )
);

DROP POLICY IF EXISTS fo_mother_leader_write ON public.field_observations;

-- Reinstall the restrictive active-account boundary on every current RLS
-- table, including tables introduced after the original Phase 0 migration.
DO $install_active_guards$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT namespace.nspname AS schema_name,relation.relname AS table_name
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relkind IN('r','p')
      AND relation.relrowsecurity IS TRUE AND relation.relname<>'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I','phase0_active_account_guard',target.schema_name,target.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.phase0_current_account_is_active())) WITH CHECK ((SELECT public.phase0_current_account_is_active()))',
      'phase0_active_account_guard',target.schema_name,target.table_name
    );
  END LOOP;
END;
$install_active_guards$;

-- Storage is outside public.*, so reinstall its restrictive stale-session
-- guard explicitly as part of the same cutover.
DO $install_storage_active_guard$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS phase0_active_account_guard ON storage.objects;
    CREATE POLICY phase0_active_account_guard ON storage.objects
      AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT public.phase0_current_account_is_active()))
      WITH CHECK ((SELECT public.phase0_current_account_is_active()));
  END IF;
END;
$install_storage_active_guard$;

REVOKE ALL ON FUNCTION public.phase0_current_account_is_active() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase0_current_account_has_retired_barangay_role() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase0_current_invite_can_complete() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_role_has_capability(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_role_has_capability(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_assert_profiling_scope(text,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_stage_profiling_import_v2_role_consolidation_internal(uuid,uuid,text,text,text,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_stage_profiling_import_v2(uuid,uuid,text,text,text,jsonb,jsonb,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_set_profiling_runtime(text,uuid[],uuid[],boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_list_profiling_cycles(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_list_profiling_sitios(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_list_profiling_submissions(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_get_profiling_submission(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_list_sample_units(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_submit_profiling_package(uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_decide_profiling_submission(uuid,integer,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase2_authorize_document_read(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase7_get_dashboard_summary() FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.phase0_current_account_is_active() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.phase0_current_account_has_retired_barangay_role() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.phase0_current_invite_can_complete() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.phase1_set_profiling_runtime(text,uuid[],uuid[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_stage_profiling_import_v2(uuid,uuid,text,text,text,jsonb,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_cycles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_sitios(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_submissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_get_profiling_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_sample_units(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_submit_profiling_package(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_decide_profiling_submission(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_authorize_document_read(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase7_get_dashboard_summary() TO authenticated;

COMMIT;
