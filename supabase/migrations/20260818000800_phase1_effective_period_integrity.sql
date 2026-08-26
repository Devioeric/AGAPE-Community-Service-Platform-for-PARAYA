-- Phase 1 effective-period, consent, roster, and aggregate integrity closure.
-- This correction is deliberately timestamped after the Phase 2 dark-launch
-- chain and is included explicitly in both Phase 1 and Phase 2 replay scopes.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Foundational definer functions are retained for compatibility but must not
-- inherit caller-controlled object resolution.
ALTER FUNCTION public.get_user_role() SET search_path=pg_catalog,public;
ALTER FUNCTION public.handle_new_user() SET search_path=pg_catalog,public;
ALTER FUNCTION public.get_user_barangay() SET search_path=pg_catalog,public;

-- Survey templates use append-only lifecycle actions. The authoritative
-- legacy policy granted Admin a direct operational hard-delete path.
DROP POLICY IF EXISTS "officers can delete survey_templates" ON public.survey_templates;

-- Convert the original inclusive end dates to exclusive bounds. The governed
-- tables did not exist in the authoritative pre-Phase-0 schema, so this is a
-- one-time forward conversion for synthetic/dark-launch rows only.
DROP TRIGGER IF EXISTS profiling_consents_period_guard ON public.profiling_consents;

UPDATE public.profiling_household_memberships
SET effective_to = effective_to + 1
WHERE effective_to IS NOT NULL AND effective_to < date '9999-12-31';

UPDATE public.profiling_consents
SET effective_to = effective_to + 1
WHERE effective_to IS NOT NULL AND effective_to < date '9999-12-31';

ALTER TABLE public.profiling_household_memberships
  DROP CONSTRAINT IF EXISTS profiling_household_memberships_check,
  DROP CONSTRAINT IF EXISTS profiling_membership_half_open_check;
ALTER TABLE public.profiling_household_memberships
  ADD CONSTRAINT profiling_membership_half_open_check
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE public.profiling_consents
  DROP CONSTRAINT IF EXISTS profiling_consent_half_open_check;
ALTER TABLE public.profiling_consents
  ADD CONSTRAINT profiling_consent_half_open_check
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

DROP INDEX IF EXISTS public.profiling_active_membership_key;
CREATE UNIQUE INDEX profiling_active_membership_key
  ON public.profiling_household_memberships(resident_id)
  WHERE effective_to IS NULL AND activated_at IS NOT NULL;

DO $period_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiling_household_memberships left_period
    JOIN public.profiling_household_memberships right_period
      ON right_period.resident_id=left_period.resident_id
     AND right_period.id>left_period.id
     AND right_period.activated_at IS NOT NULL
     AND left_period.activated_at IS NOT NULL
     AND daterange(left_period.effective_from,left_period.effective_to,'[)')
         && daterange(right_period.effective_from,right_period.effective_to,'[)')
  ) THEN
    RAISE EXCEPTION 'activated household membership periods overlap; reconciliation is required' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.profiling_consents left_period
    JOIN public.profiling_consents right_period
      ON right_period.resident_id=left_period.resident_id
     AND right_period.id>left_period.id
     AND left_period.resident_id IS NOT NULL
     AND daterange(left_period.effective_from,left_period.effective_to,'[)')
         && daterange(right_period.effective_from,right_period.effective_to,'[)')
  ) THEN
    RAISE EXCEPTION 'resident consent periods overlap; reconciliation is required' USING ERRCODE='23514';
  END IF;
END;
$period_preflight$;

ALTER TABLE public.profiling_household_memberships
  DROP CONSTRAINT IF EXISTS profiling_activated_membership_no_overlap;
ALTER TABLE public.profiling_household_memberships
  ADD CONSTRAINT profiling_activated_membership_no_overlap
  EXCLUDE USING gist (
    resident_id WITH =,
    daterange(effective_from,effective_to,'[)') WITH &&
  ) WHERE (activated_at IS NOT NULL);

ALTER TABLE public.profiling_consents
  DROP CONSTRAINT IF EXISTS profiling_resident_consent_no_overlap;
ALTER TABLE public.profiling_consents
  ADD CONSTRAINT profiling_resident_consent_no_overlap
  EXCLUDE USING gist (
    resident_id WITH =,
    daterange(effective_from,effective_to,'[)') WITH &&
  ) WHERE (resident_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.phase1_guard_consent_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'profiling_consents is append-only' USING ERRCODE='55000';
  END IF;
  IF OLD.effective_to IS NULL
    AND NEW.effective_to IS NOT NULL
    AND NEW.effective_to>=OLD.effective_from
    AND (to_jsonb(NEW)-'effective_to')=(to_jsonb(OLD)-'effective_to') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'only trusted consent-period closure is allowed' USING ERRCODE='55000';
END;
$function$;
CREATE TRIGGER profiling_consents_period_guard
BEFORE UPDATE OR DELETE ON public.profiling_consents
FOR EACH ROW EXECUTE FUNCTION public.phase1_guard_consent_update();

-- Pending memberships reserve identity linkage but become effective only when
-- the corresponding Secretary-approved submission is committed.
CREATE OR REPLACE FUNCTION public.phase1_activate_approved_memberships()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.profiling_household_memberships membership
       SET activated_at=coalesce(membership.activated_at,now()),
           activated_by=coalesce(membership.activated_by,NEW.approved_by)
     WHERE membership.household_id=NEW.household_id
       AND membership.activated_at IS NULL
       AND EXISTS (
         SELECT 1 FROM public.profiling_resident_versions version
         WHERE version.submission_id=NEW.id
           AND version.resident_id=membership.resident_id
       );
  END IF;
  RETURN NEW;
END;
$function$;

-- Determine minor/adult consent from the latest validated profile as of the
-- lifecycle effective date. Estimated age advances from its cycle date.
CREATE OR REPLACE FUNCTION public.phase1_resident_is_minor_as_of(p_resident_id uuid,p_effective_on date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE profile jsonb; base_date date; birth_date date; base_age integer; age_years integer;
BEGIN
  SELECT version.profile_data,cycle.collection_starts_on
    INTO profile,base_date
  FROM public.profiling_resident_versions version
  JOIN public.profiling_submissions submission ON submission.id=version.submission_id
  JOIN public.profiling_cycles cycle ON cycle.id=submission.cycle_id
  WHERE version.resident_id=p_resident_id
    AND submission.status IN('approved','superseded')
    AND cycle.collection_starts_on<=p_effective_on
  ORDER BY cycle.collection_starts_on DESC,version.version DESC
  LIMIT 1;
  IF profile IS NULL THEN RAISE EXCEPTION 'validated resident profile is unavailable' USING ERRCODE='P0002'; END IF;
  birth_date:=nullif(profile->>'birth_date','')::date;
  IF birth_date IS NOT NULL THEN
    IF birth_date>p_effective_on THEN RAISE EXCEPTION 'birth date is after the effective date' USING ERRCODE='23514'; END IF;
    age_years:=date_part('year',age(p_effective_on,birth_date))::integer;
  ELSE
    IF coalesce(profile->>'estimated_age','')!~'^[0-9]{1,3}$' THEN RAISE EXCEPTION 'age basis is unavailable' USING ERRCODE='23514'; END IF;
    base_age:=(profile->>'estimated_age')::integer;
    age_years:=base_age+greatest(date_part('year',age(p_effective_on,base_date))::integer,0);
  END IF;
  RETURN age_years<18;
END;
$function$;

-- Trusted lifecycle corrections use exclusive end dates and activate any new
-- membership atomically. Historical aggregates read the event/period state as
-- of their reporting date rather than rewriting completed evidence.
CREATE OR REPLACE FUNCTION public.phase1_apply_profile_lifecycle_action(
  p_action text,p_entity_id uuid,p_expected_version integer,p_effective_on date,
  p_reason text,p_target_entity_id uuid DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  resident public.profiling_residents%ROWTYPE;
  household public.profiling_households%ROWTYPE;
  target_household public.profiling_households%ROWTYPE;
  target_resident public.profiling_residents%ROWTYPE;
  membership public.profiling_household_memberships%ROWTYPE;
  consent public.profiling_consents%ROWTYPE;
  new_version integer;
BEGIN
  IF p_effective_on IS NULL OR p_effective_on>current_date OR length(btrim(coalesce(p_reason,'')))<3 THEN
    RAISE EXCEPTION 'effective date and reason are required' USING ERRCODE='22023';
  END IF;
  IF p_action IN('resident_inactive','resident_deceased','resident_transfer','resident_merge','consent_withdrawal') THEN
    SELECT * INTO resident FROM public.profiling_residents WHERE id=p_entity_id FOR UPDATE;
    IF resident.id IS NULL OR resident.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale resident version' USING ERRCODE='40001'; END IF;
    PERFORM public.phase1_assert_profiling_runtime(resident.barangay_id);
    PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',resident.barangay_id,NULL);
    IF resident.lifecycle_status<>'active' OR NOT EXISTS(
      SELECT 1 FROM public.profiling_resident_versions version
      JOIN public.profiling_submissions submission ON submission.id=version.submission_id
      WHERE version.resident_id=resident.id AND submission.status IN('approved','superseded')
    ) THEN RAISE EXCEPTION 'resident lifecycle transition is invalid' USING ERRCODE='23514'; END IF;

    IF p_action='consent_withdrawal' THEN
      SELECT * INTO consent FROM public.profiling_consents
      WHERE resident_id=resident.id AND status='granted'
        AND effective_from<=p_effective_on
        AND (effective_to IS NULL OR p_effective_on<effective_to)
      ORDER BY effective_from DESC,recorded_at DESC LIMIT 1 FOR UPDATE;
      IF consent.id IS NULL OR p_effective_on<=consent.effective_from THEN RAISE EXCEPTION 'active consent cannot be withdrawn on this date' USING ERRCODE='23514'; END IF;
      UPDATE public.profiling_consents SET effective_to=p_effective_on WHERE id=consent.id;
      INSERT INTO public.profiling_consents(
        submission_id,subject_type,resident_id,status,privacy_notice_id,
        consented_by_name,guardian_relationship,effective_from,withdrawal_reason,recorded_by
      ) VALUES(
        consent.submission_id,consent.subject_type,resident.id,'withdrawn',consent.privacy_notice_id,
        'WITHDRAWN',consent.guardian_relationship,p_effective_on,btrim(p_reason),auth.uid()
      );
      UPDATE public.profiling_residents SET row_version=row_version+1,updated_at=now()
      WHERE id=resident.id RETURNING row_version INTO new_version;
      INSERT INTO public.profiling_lifecycle_events(entity_type,entity_id,action,effective_on,from_status,to_status,reason,actor_id)
      VALUES('consent',resident.id,'withdrawn',p_effective_on,'granted','withdrawn',btrim(p_reason),auth.uid());
      RETURN new_version;
    END IF;

    SELECT * INTO membership FROM public.profiling_household_memberships
    WHERE resident_id=resident.id AND activated_at IS NOT NULL
      AND effective_from<=p_effective_on AND (effective_to IS NULL OR p_effective_on<effective_to)
    ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
    IF membership.id IS NULL OR p_effective_on<=membership.effective_from THEN RAISE EXCEPTION 'active membership and a later effective date are required' USING ERRCODE='23514'; END IF;

    IF p_action='resident_transfer' THEN
      SELECT * INTO target_household FROM public.profiling_households WHERE id=p_target_entity_id FOR UPDATE;
      IF target_household.id IS NULL OR target_household.id=membership.household_id
        OR target_household.barangay_id<>resident.barangay_id OR target_household.lifecycle_status<>'active'
        OR target_household.merged_into_id IS NOT NULL
        OR NOT EXISTS(SELECT 1 FROM public.profiling_submissions s WHERE s.household_id=target_household.id AND s.status IN('approved','superseded')) THEN
        RAISE EXCEPTION 'transfer target is invalid' USING ERRCODE='23514';
      END IF;
      UPDATE public.profiling_household_memberships SET effective_to=p_effective_on,reason=btrim(p_reason) WHERE id=membership.id;
      INSERT INTO public.profiling_household_memberships(
        household_id,resident_id,effective_from,reason,created_by,activated_at,activated_by
      ) VALUES(target_household.id,resident.id,p_effective_on,btrim(p_reason),auth.uid(),now(),auth.uid());
      UPDATE public.profiling_residents SET row_version=row_version+1,updated_at=now()
      WHERE id=resident.id RETURNING row_version INTO new_version;
    ELSIF p_action='resident_merge' THEN
      SELECT * INTO target_resident FROM public.profiling_residents WHERE id=p_target_entity_id FOR UPDATE;
      IF target_resident.id IS NULL OR target_resident.id=resident.id
        OR target_resident.barangay_id<>resident.barangay_id
        OR target_resident.lifecycle_status<>'active' OR target_resident.merged_into_id IS NOT NULL THEN
        RAISE EXCEPTION 'resident merge target is invalid' USING ERRCODE='23514';
      END IF;
      UPDATE public.profiling_household_memberships SET effective_to=p_effective_on,reason=btrim(p_reason) WHERE id=membership.id;
      UPDATE public.profiling_residents SET lifecycle_status='merged',merged_into_id=target_resident.id,row_version=row_version+1,updated_at=now()
      WHERE id=resident.id RETURNING row_version INTO new_version;
    ELSE
      UPDATE public.profiling_household_memberships SET effective_to=p_effective_on,reason=btrim(p_reason) WHERE id=membership.id;
      UPDATE public.profiling_residents
      SET lifecycle_status=CASE WHEN p_action='resident_deceased' THEN 'deceased' ELSE 'inactive' END,
          row_version=row_version+1,updated_at=now()
      WHERE id=resident.id RETURNING row_version INTO new_version;
    END IF;
    INSERT INTO public.profiling_lifecycle_events(
      entity_type,entity_id,action,effective_on,from_status,to_status,target_entity_id,reason,actor_id
    ) VALUES(
      'resident',resident.id,
      CASE p_action WHEN 'resident_inactive' THEN 'inactive' WHEN 'resident_deceased' THEN 'deceased' WHEN 'resident_transfer' THEN 'transfer' ELSE 'merged' END,
      p_effective_on,resident.lifecycle_status,
      CASE p_action WHEN 'resident_inactive' THEN 'inactive' WHEN 'resident_deceased' THEN 'deceased' WHEN 'resident_merge' THEN 'merged' ELSE resident.lifecycle_status END,
      p_target_entity_id,btrim(p_reason),auth.uid()
    );
  ELSIF p_action IN('household_moved','household_dissolved','household_merge') THEN
    SELECT * INTO household FROM public.profiling_households WHERE id=p_entity_id FOR UPDATE;
    IF household.id IS NULL OR household.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale household version' USING ERRCODE='40001'; END IF;
    PERFORM public.phase1_assert_profiling_runtime(household.barangay_id);
    PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',household.barangay_id,NULL);
    IF household.lifecycle_status<>'active' OR household.merged_into_id IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM public.profiling_submissions s WHERE s.household_id=household.id AND s.status IN('approved','superseded')) THEN
      RAISE EXCEPTION 'household lifecycle transition is invalid' USING ERRCODE='23514';
    END IF;
    IF p_action='household_merge' THEN
      SELECT * INTO target_household FROM public.profiling_households WHERE id=p_target_entity_id FOR UPDATE;
      IF target_household.id IS NULL OR target_household.id=household.id
        OR target_household.barangay_id<>household.barangay_id
        OR target_household.lifecycle_status<>'active' OR target_household.merged_into_id IS NOT NULL THEN
        RAISE EXCEPTION 'household merge target is invalid' USING ERRCODE='23514';
      END IF;
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.profiling_household_memberships m
      WHERE m.household_id=household.id AND m.activated_at IS NOT NULL
        AND m.effective_from>=p_effective_on AND (m.effective_to IS NULL OR p_effective_on<m.effective_to)
    ) THEN RAISE EXCEPTION 'household action must follow all active membership starts' USING ERRCODE='23514'; END IF;
    FOR membership IN
      SELECT * FROM public.profiling_household_memberships
      WHERE household_id=household.id AND activated_at IS NOT NULL
        AND effective_from<=p_effective_on AND (effective_to IS NULL OR p_effective_on<effective_to)
      FOR UPDATE
    LOOP
      UPDATE public.profiling_household_memberships SET effective_to=p_effective_on,reason=btrim(p_reason) WHERE id=membership.id;
      IF p_action='household_merge' AND NOT EXISTS(
        SELECT 1 FROM public.profiling_household_memberships m
        WHERE m.resident_id=membership.resident_id AND m.activated_at IS NOT NULL
          AND m.effective_from<=p_effective_on AND (m.effective_to IS NULL OR p_effective_on<m.effective_to)
      ) THEN
        INSERT INTO public.profiling_household_memberships(
          household_id,resident_id,effective_from,reason,created_by,activated_at,activated_by
        ) VALUES(target_household.id,membership.resident_id,p_effective_on,btrim(p_reason),auth.uid(),now(),auth.uid());
      END IF;
    END LOOP;
    UPDATE public.profiling_households
    SET lifecycle_status=CASE p_action WHEN 'household_moved' THEN 'moved' WHEN 'household_dissolved' THEN 'dissolved' ELSE 'merged' END,
        merged_into_id=CASE WHEN p_action='household_merge' THEN target_household.id END,
        row_version=row_version+1,updated_at=now()
    WHERE id=household.id RETURNING row_version INTO new_version;
    INSERT INTO public.profiling_lifecycle_events(
      entity_type,entity_id,action,effective_on,from_status,to_status,target_entity_id,reason,actor_id
    ) VALUES(
      'household',household.id,
      CASE p_action WHEN 'household_moved' THEN 'moved' WHEN 'household_dissolved' THEN 'dissolved' ELSE 'merged' END,
      p_effective_on,household.lifecycle_status,
      CASE p_action WHEN 'household_moved' THEN 'moved' WHEN 'household_dissolved' THEN 'dissolved' ELSE 'merged' END,
      p_target_entity_id,btrim(p_reason),auth.uid()
    );
  ELSE
    RAISE EXCEPTION 'invalid lifecycle action' USING ERRCODE='22023';
  END IF;
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_record_resident_reconsent(
  p_resident_id uuid,p_expected_version integer,p_effective_on date,
  p_consented_by_name text,p_guardian_relationship text DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE resident public.profiling_residents%ROWTYPE; prior public.profiling_consents%ROWTYPE; new_version integer; minor boolean; subject text;
BEGIN
  SELECT * INTO resident FROM public.profiling_residents WHERE id=p_resident_id FOR UPDATE;
  IF resident.id IS NULL OR resident.row_version<>p_expected_version OR resident.lifecycle_status<>'active' THEN RAISE EXCEPTION 'stale or inactive resident' USING ERRCODE='40001'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(resident.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',resident.barangay_id,NULL);
  SELECT * INTO prior FROM public.profiling_consents
  WHERE resident_id=resident.id AND effective_from<=p_effective_on
    AND (effective_to IS NULL OR p_effective_on<effective_to)
  ORDER BY effective_from DESC,recorded_at DESC LIMIT 1 FOR UPDATE;
  IF prior.id IS NULL OR prior.status<>'withdrawn' OR p_effective_on<=prior.effective_from
    OR p_effective_on>current_date OR length(btrim(coalesce(p_consented_by_name,'')))<1 THEN
    RAISE EXCEPTION 're-consent is invalid' USING ERRCODE='23514';
  END IF;
  minor:=public.phase1_resident_is_minor_as_of(resident.id,p_effective_on);
  subject:=CASE WHEN minor THEN 'guardian' ELSE 'adult' END;
  IF minor AND length(btrim(coalesce(p_guardian_relationship,'')))<1 THEN RAISE EXCEPTION 'guardian relationship is required' USING ERRCODE='23514'; END IF;
  IF NOT minor AND nullif(btrim(coalesce(p_guardian_relationship,'')),'') IS NOT NULL THEN RAISE EXCEPTION 'adult consent cannot use guardian authorization' USING ERRCODE='23514'; END IF;
  UPDATE public.profiling_consents SET effective_to=p_effective_on WHERE id=prior.id;
  INSERT INTO public.profiling_consents(
    submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,
    guardian_relationship,effective_from,recorded_by
  ) VALUES(
    prior.submission_id,subject,resident.id,'granted',prior.privacy_notice_id,btrim(p_consented_by_name),
    CASE WHEN minor THEN btrim(p_guardian_relationship) END,p_effective_on,auth.uid()
  );
  UPDATE public.profiling_residents SET row_version=row_version+1,updated_at=now()
  WHERE id=resident.id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_lifecycle_events(entity_type,entity_id,action,effective_on,from_status,to_status,reason,actor_id)
  VALUES('consent',resident.id,'reactivated',p_effective_on,'withdrawn','granted','recorded re-consent',auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_effective_resident_profiles(p_cycle_id uuid)
RETURNS TABLE(resident_id uuid,profile_data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
  WITH cycle_context AS (
    SELECT * FROM public.profiling_cycles WHERE id=p_cycle_id
  ), ranked AS (
    SELECT version.resident_id,version.profile_data,version.version,
           row_number() OVER(PARTITION BY version.resident_id ORDER BY version.version DESC) AS rank
    FROM public.profiling_resident_versions version
    JOIN public.profiling_submissions submission ON submission.id=version.submission_id
    JOIN cycle_context cycle ON cycle.id=submission.cycle_id
    WHERE submission.status='approved'
      AND EXISTS(
        SELECT 1 FROM public.profiling_household_memberships membership
        WHERE membership.resident_id=version.resident_id
          AND membership.household_id=submission.household_id
          AND membership.activated_at IS NOT NULL
          AND membership.effective_from<=cycle.collection_ends_on
          AND (membership.effective_to IS NULL OR cycle.collection_ends_on<membership.effective_to)
      )
      AND NOT EXISTS(
        SELECT 1 FROM public.profiling_lifecycle_events event
        WHERE event.entity_type='household' AND event.entity_id=submission.household_id
          AND event.action IN('moved','dissolved','merged') AND event.effective_on<=cycle.collection_ends_on
      )
      AND NOT EXISTS(
        SELECT 1 FROM public.profiling_lifecycle_events event
        WHERE event.entity_type='resident' AND event.entity_id=version.resident_id
          AND event.action IN('inactive','deceased','merged') AND event.effective_on<=cycle.collection_ends_on
      )
      AND EXISTS(
        SELECT 1 FROM public.profiling_consents consent
        WHERE consent.resident_id=version.resident_id AND consent.status='granted'
          AND consent.effective_from<=cycle.collection_ends_on
          AND (consent.effective_to IS NULL OR cycle.collection_ends_on<consent.effective_to)
      )
  )
  SELECT ranked.resident_id,ranked.profile_data FROM ranked WHERE rank=1;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_profiling_aggregate_internal(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  cycle public.profiling_cycles%ROWTYPE; official public.official_population_snapshots%ROWTYPE;
  threshold integer; households bigint; residents bigint; pending_count bigint; returned_count bigint;
  excluded_count bigint; duplicate_count bigint; registered_count bigint; participating_count bigint;
  coverage numeric; response_rate numeric; sex_cells jsonb; evidence_id uuid;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  SELECT suppression_threshold INTO threshold FROM public.profiling_privacy_settings WHERE id=true;
  SELECT count(*),count(*) FILTER(WHERE contact_outcome='participated'),count(*) FILTER(WHERE contact_outcome IN('refused','unavailable','ineligible'))
  INTO registered_count,participating_count,excluded_count FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id;
  SELECT count(DISTINCT submission.household_id) INTO households
  FROM public.profiling_submissions submission
  WHERE submission.cycle_id=p_cycle_id AND submission.status='approved'
    AND NOT EXISTS(
      SELECT 1 FROM public.profiling_lifecycle_events event
      WHERE event.entity_type='household' AND event.entity_id=submission.household_id
        AND event.action IN('moved','dissolved','merged') AND event.effective_on<=cycle.collection_ends_on
    );
  SELECT count(*) INTO residents FROM public.phase1_effective_resident_profiles(p_cycle_id);
  SELECT count(*) FILTER(WHERE status='pending'),count(*) FILTER(WHERE status='returned')
  INTO pending_count,returned_count FROM public.profiling_submissions WHERE cycle_id=p_cycle_id;
  SELECT count(*) INTO duplicate_count FROM public.profiling_duplicate_candidates WHERE cycle_id=p_cycle_id AND status='unresolved';
  coverage:=CASE WHEN cycle.target_households>0 THEN round(households::numeric/cycle.target_households*100,2) END;
  response_rate:=CASE WHEN registered_count>0 THEN round(participating_count::numeric/registered_count*100,2) END;
  SELECT * INTO official FROM public.official_population_snapshots
  WHERE barangay_id=cycle.barangay_id AND verified_at IS NOT NULL AND as_of_date<=cycle.collection_ends_on
  ORDER BY as_of_date DESC,verified_at DESC LIMIT 1;
  SELECT id INTO evidence_id FROM public.profiling_evidence_snapshots
  WHERE cycle_id=p_cycle_id AND aggregate_schema_version='agape.profiling.aggregate.v2'
  ORDER BY generated_at DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'dimension','sex','key',key,'count',public.phase1_suppressed_count(total,threshold)
  ) ORDER BY key),'[]'::jsonb) INTO sex_cells
  FROM (
    SELECT coalesce(profile_data->>'sex','not_stated') key,count(*) total
    FROM public.phase1_effective_resident_profiles(p_cycle_id) GROUP BY 1
  ) counts;
  sex_cells:=public.phase1_complementary_suppress(sex_cells,threshold);
  RETURN jsonb_build_object(
    'schemaVersion','agape.profiling.aggregate.v2',
    'cycle',jsonb_build_object('id',cycle.id,'name',cycle.name,'status',cycle.status,'reportingDate',cycle.collection_ends_on),
    'sample',jsonb_build_object('method',cycle.sample_method,'targetHouseholds',cycle.target_households,'registeredHouseholds',registered_count,'participatingHouseholds',participating_count,'approvedHouseholds',households,'approvedResidents',residents,'coveragePercent',coverage,'responseRatePercent',response_rate),
    'source',jsonb_build_object('kind','approved_sample','legacyExcluded',true,'evidenceSnapshotId',evidence_id),
    'official',jsonb_build_object('totalPopulation',official.total_population,'totalHouseholds',official.total_households,'sourceName',official.source_name,'asOfDate',official.as_of_date,'verified',official.id IS NOT NULL),
    'asOf',clock_timestamp(),
    'privacy',jsonb_build_object('suppressionThreshold',threshold,'complementarySuppression',true),
    'dataQuality',jsonb_build_object('pendingPackages',pending_count,'returnedPackages',returned_count,'excludedPackages',excluded_count,'unresolvedDuplicates',duplicate_count),
    'cells',sex_cells
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_begin_profiling_revision(p_cycle_id uuid,p_sample_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE seed jsonb; cycle public.profiling_cycles%ROWTYPE; filtered jsonb; seed_household_id uuid;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  seed:=public.phase1_begin_profiling_revision_internal(p_cycle_id,p_sample_reference);
  SELECT household_id INTO seed_household_id FROM public.profiling_sample_units
  WHERE cycle_id=p_cycle_id AND sample_reference=p_sample_reference;
  SELECT coalesce(jsonb_agg(item),'[]'::jsonb) INTO filtered
  FROM jsonb_array_elements(seed->'residents') item
  WHERE EXISTS(
    SELECT 1 FROM public.profiling_household_memberships membership
    WHERE membership.resident_id=(item->>'resident_id')::uuid
      AND membership.household_id=seed_household_id
      AND membership.activated_at IS NOT NULL
      AND membership.effective_from<=cycle.collection_starts_on
      AND (membership.effective_to IS NULL OR cycle.collection_starts_on<membership.effective_to)
  )
    AND EXISTS(
      SELECT 1 FROM public.profiling_consents consent
      WHERE consent.resident_id=(item->>'resident_id')::uuid AND consent.status='granted'
        AND consent.effective_from<=cycle.collection_starts_on
        AND (consent.effective_to IS NULL OR cycle.collection_starts_on<consent.effective_to)
    );
  RETURN jsonb_set(seed,'{residents}',filtered,true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_begin_same_cycle_correction(p_submission_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; residents jsonb; actor public.users%ROWTYPE;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id FOR SHARE;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF submission.id IS NULL OR submission.status<>'approved' OR submission.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale approved package' USING ERRCODE='40001'; END IF;
  IF cycle.status NOT IN('collecting','validating') THEN RAISE EXCEPTION 'cycle does not accept corrections' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,submission.sitio_id);
  SELECT coalesce(jsonb_agg(
    version.profile_data||jsonb_build_object('resident_id',version.resident_id,'consent_status','granted')
    ORDER BY version.is_household_head DESC,version.created_at
  ),'[]'::jsonb) INTO residents
  FROM public.profiling_resident_versions version WHERE version.submission_id=submission.id;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  VALUES(actor.id,actor.email,'Resident correction seed viewed','profiling_submissions',submission.id::text,'warning',jsonb_build_object('cycle_id',cycle.id));
  RETURN jsonb_build_object(
    'cycle_id',cycle.id,'sample_reference',(SELECT sample_reference FROM public.profiling_sample_units WHERE id=submission.sample_unit_id),
    'household_id',submission.household_id,'household_row_key',(SELECT sample_reference FROM public.profiling_sample_units WHERE id=submission.sample_unit_id),
    'household',submission.household_data,'residents',residents,'previous_submission_id',submission.id,'expected_version',submission.row_version
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_get_profiling_cycle_context(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; actor public.users%ROWTYPE;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE OR actor.role='admin' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF public.phase1_current_has_capability('profiling.cycle.manage') THEN
    NULL;
  ELSIF public.phase1_current_has_capability('profiling.aggregate.read') THEN
    IF actor.barangay_id IS NOT NULL AND actor.barangay_id IS DISTINCT FROM cycle.barangay_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSIF public.phase1_current_has_capability('profiling.collect') THEN
    IF actor.barangay_id IS DISTINCT FROM cycle.barangay_id OR NOT EXISTS(
      SELECT 1 FROM public.mother_leader_sitio_assignments assignment
      WHERE assignment.mother_leader_id=actor.id AND assignment.effective_from<=current_date
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=current_date)
    ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSIF public.phase1_current_has_capability('profiling.validate') OR public.phase1_current_has_capability('profiling.detail.read') OR public.phase1_current_has_capability('profiling.endorse') THEN
    IF actor.barangay_id IS DISTINCT FROM cycle.barangay_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'id',cycle.id,'barangay_id',cycle.barangay_id,'status',cycle.status,
    'collection_starts_on',cycle.collection_starts_on,'collection_ends_on',cycle.collection_ends_on,
    'row_version',cycle.row_version
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_get_profiling_submission_mutation(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; actor public.users%ROWTYPE;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF actor.role='barangay_mother_leader' THEN
    IF submission.created_by<>actor.id OR actor.barangay_id IS DISTINCT FROM cycle.barangay_id
      OR NOT public.phase1_current_has_capability('profiling.collect')
      OR NOT EXISTS(
        SELECT 1 FROM public.mother_leader_sitio_assignments assignment
        WHERE assignment.mother_leader_id=actor.id AND assignment.sitio_id=submission.sitio_id
          AND assignment.effective_from<=current_date
          AND (assignment.effective_to IS NULL OR assignment.effective_to>=current_date)
      ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSIF public.phase1_current_has_capability('profiling.validate') OR public.phase1_current_has_capability('profiling.detail.read') OR public.phase1_current_has_capability('profiling.cycle.manage') THEN
    IF actor.barangay_id IS NOT NULL AND actor.barangay_id IS DISTINCT FROM cycle.barangay_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('id',submission.id,'row_version',submission.row_version,'cycle_id',submission.cycle_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.phase1_resident_is_minor_as_of(uuid,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_effective_resident_profiles(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_profiling_aggregate_internal(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_apply_profile_lifecycle_action(text,uuid,integer,date,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_record_resident_reconsent(uuid,integer,date,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_begin_profiling_revision(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_begin_same_cycle_correction(uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_get_profiling_cycle_context(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_get_profiling_submission_mutation(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.phase1_apply_profile_lifecycle_action(text,uuid,integer,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_record_resident_reconsent(uuid,integer,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_begin_profiling_revision(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_begin_same_cycle_correction(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_get_profiling_cycle_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_get_profiling_submission_mutation(uuid) TO authenticated;

COMMIT;
