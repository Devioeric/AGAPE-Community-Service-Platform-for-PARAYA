-- Data-derived community-need indicators (read side).
--
-- This migration is deliberately separate from the frozen profiling aggregate.
-- It computes a second, aggregate-only document for completed profiling cycles
-- and stores it as an immutable evidence snapshot.  No resident or household
-- identifiers leave the database.
BEGIN;

SET LOCAL search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.cna_resident_age_as_of(p_profile jsonb, p_as_of date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' OR p_as_of IS NULL THEN NULL::integer
    WHEN p_profile->>'birth_date' ~ '^\d{4}-\d{2}-\d{2}$'
      AND (p_profile->>'birth_date')::date <= p_as_of
      THEN extract(year FROM age(p_as_of, (p_profile->>'birth_date')::date))::integer
    WHEN p_profile->>'estimated_age' ~ '^\d{1,3}$'
      THEN (p_profile->>'estimated_age')::integer
    ELSE NULL::integer
  END;
$function$;

CREATE OR REPLACE FUNCTION public.cna_need_indicator_pair(
  p_code text,
  p_unit text,
  p_yes bigint,
  p_no bigint,
  p_threshold integer
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  base_count jsonb;
  cells jsonb;
  yes_count jsonb;
  no_count jsonb;
  yes_value bigint := greatest(coalesce(p_yes, 0), 0);
  no_value bigint := greatest(coalesce(p_no, 0), 0);
BEGIN
  base_count := public.phase1_suppressed_count(yes_value + no_value, p_threshold);
  IF coalesce((base_count->>'suppressed')::boolean, false) THEN
    yes_count := jsonb_build_object('suppressed', true, 'value', NULL, 'label', 'suppressed');
    no_count := yes_count;
  ELSE
    cells := public.phase1_complementary_suppress(
      jsonb_build_array(
        jsonb_build_object('key', 'yes', 'count', public.phase1_suppressed_count(yes_value, p_threshold)),
        jsonb_build_object('key', 'no', 'count', public.phase1_suppressed_count(no_value, p_threshold))
      ),
      p_threshold
    );
    SELECT cell->'count' INTO yes_count
    FROM jsonb_array_elements(cells) AS item(cell)
    WHERE cell->>'key' = 'yes';
    SELECT cell->'count' INTO no_count
    FROM jsonb_array_elements(cells) AS item(cell)
    WHERE cell->>'key' = 'no';
  END IF;

  RETURN jsonb_build_object(
    'code', p_code,
    'unit', p_unit,
    'base', base_count,
    'yes', coalesce(yes_count, public.phase1_suppressed_count(yes_value, p_threshold)),
    'no', coalesce(no_count, public.phase1_suppressed_count(no_value, p_threshold))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cna_need_indicators_internal(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  cycle public.profiling_cycles%ROWTYPE;
  threshold integer;
  approved_households bigint;
  approved_residents bigint;
  water_yes bigint; water_no bigint;
  sanitation_yes bigint; sanitation_no bigint;
  electricity_yes bigint; electricity_no bigint;
  housing_yes bigint; housing_no bigint;
  flood_yes bigint; flood_no bigint;
  digital_yes bigint; digital_no bigint;
  income_yes bigint; income_no bigint;
  need_health_yes bigint; need_health_no bigint;
  need_education_yes bigint; need_education_no bigint;
  need_livelihood_yes bigint; need_livelihood_no bigint;
  need_housing_yes bigint; need_housing_no bigint;
  need_sanitation_yes bigint; need_sanitation_no bigint;
  need_disaster_yes bigint; need_disaster_no bigint;
  need_digital_yes bigint; need_digital_no bigint;
  school_yes bigint; school_no bigint;
  labor_yes bigint; labor_no bigint;
  disability_yes bigint; disability_no bigint;
  health_support_yes bigint; health_support_no bigint;
  indicators jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id = p_cycle_id;
  IF cycle.id IS NULL THEN
    RAISE EXCEPTION 'cycle not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(suppression_threshold, 5)
    INTO threshold
  FROM public.profiling_privacy_settings
  WHERE id = true;
  threshold := coalesce(threshold, 5);

  /* Household counts use the same approved/lifecycle filter as the latest
     profiling aggregate, with the highest approved submission version per
     household. */
  WITH approved AS (
    SELECT DISTINCT ON (submission.household_id)
      submission.household_id,
      coalesce(submission.household_data, '{}'::jsonb) AS household_data
    FROM public.profiling_submissions AS submission
    WHERE submission.cycle_id = p_cycle_id
      AND submission.status = 'approved'
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiling_lifecycle_events AS event
        WHERE event.entity_type = 'household'
          AND event.entity_id = submission.household_id
          AND event.action IN ('moved', 'dissolved', 'merged')
          AND event.effective_on <= cycle.collection_ends_on
      )
    ORDER BY submission.household_id, submission.submission_version DESC
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE household_data->>'water_source' IN ('delivered','communal','other'))::bigint,
    count(*) FILTER (WHERE household_data->>'water_source' IN ('piped','well'))::bigint,
    count(*) FILTER (WHERE household_data->>'sanitation' IN ('shared_flush','latrine','none'))::bigint,
    count(*) FILTER (WHERE household_data->>'sanitation' = 'private_flush')::bigint,
    count(*) FILTER (WHERE household_data->>'electricity' = 'none')::bigint,
    count(*) FILTER (WHERE household_data->>'electricity' IN ('connected','shared'))::bigint,
    count(*) FILTER (WHERE household_data->>'housing_condition' IN ('needs_major_repair','temporary'))::bigint,
    count(*) FILTER (WHERE household_data->>'housing_condition' IN ('adequate','needs_minor_repair'))::bigint,
    count(*) FILTER (WHERE jsonb_typeof(household_data->'hazards') = 'array' AND (household_data->'hazards') ? 'flood')::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_typeof(household_data->'hazards') = 'array' AND (household_data->'hazards') ? 'flood'))::bigint,
    count(*) FILTER (
      WHERE household_data->>'internet_access' = 'none'
        AND NOT coalesce((household_data->'devices') ?| ARRAY['smartphone','tablet','laptop','desktop'], false)
    )::bigint,
    count(*) FILTER (
      WHERE household_data->>'internet_access' IN ('fixed','mobile','shared')
         OR (
           household_data->>'internet_access' = 'none'
           AND coalesce((household_data->'devices') ?| ARRAY['smartphone','tablet','laptop','desktop'], false)
         )
    )::bigint,
    count(*) FILTER (WHERE household_data->>'income_bracket' IN ('below_5000','5000_9999'))::bigint,
    count(*) FILTER (WHERE household_data->>'income_bracket' IN ('10000_19999','20000_39999','40000_59999','60000_plus'))::bigint,
    count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'health')::bigint,
    count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'education')::bigint,
    count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'livelihood')::bigint,
    count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'housing')::bigint,
    count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'sanitation')::bigint,
    count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'disaster_readiness')::bigint,
    count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'digital_access')::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'health'))::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'education'))::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'livelihood'))::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'housing'))::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'sanitation'))::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'disaster_readiness'))::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_typeof(household_data->'needs') = 'array' AND (household_data->'needs') ? 'digital_access'))::bigint
  INTO
    approved_households,
    water_yes, water_no,
    sanitation_yes, sanitation_no,
    electricity_yes, electricity_no,
    housing_yes, housing_no,
    flood_yes, flood_no,
    digital_yes, digital_no,
    income_yes, income_no,
    need_health_yes, need_education_yes, need_livelihood_yes, need_housing_yes,
    need_sanitation_yes, need_disaster_yes, need_digital_yes,
    need_health_no, need_education_no, need_livelihood_no, need_housing_no,
    need_sanitation_no, need_disaster_no, need_digital_no
  FROM approved;

  /* Resident counts are sourced only from the consented effective-profile
     function; no resident identifier is selected into the output document. */
  WITH residents AS (
    SELECT
      profiles.profile_data,
      public.cna_resident_age_as_of(profiles.profile_data, cycle.collection_starts_on) AS age_years
    FROM public.phase1_effective_resident_profiles(p_cycle_id) AS profiles
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE age_years BETWEEN 6 AND 17 AND profile_data->'is_enrolled' = 'false'::jsonb)::bigint,
    count(*) FILTER (WHERE age_years BETWEEN 6 AND 17 AND profile_data->'is_enrolled' = 'true'::jsonb)::bigint,
    count(*) FILTER (WHERE age_years BETWEEN 18 AND 59 AND profile_data->>'employment_status' = 'unemployed_seeking')::bigint,
    count(*) FILTER (WHERE age_years BETWEEN 18 AND 59 AND profile_data->>'employment_status' IN ('employed','self_employed'))::bigint,
    count(*) FILTER (WHERE jsonb_array_length(CASE WHEN jsonb_typeof(profile_data->'disability_support') = 'array' THEN profile_data->'disability_support' ELSE '[]'::jsonb END) > 0)::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_array_length(CASE WHEN jsonb_typeof(profile_data->'disability_support') = 'array' THEN profile_data->'disability_support' ELSE '[]'::jsonb END) > 0))::bigint,
    count(*) FILTER (WHERE jsonb_array_length(CASE WHEN jsonb_typeof(profile_data->'health_support') = 'array' THEN profile_data->'health_support' ELSE '[]'::jsonb END) > 0)::bigint,
    (count(*) - count(*) FILTER (WHERE jsonb_array_length(CASE WHEN jsonb_typeof(profile_data->'health_support') = 'array' THEN profile_data->'health_support' ELSE '[]'::jsonb END) > 0))::bigint
  INTO
    approved_residents,
    school_yes, school_no,
    labor_yes, labor_no,
    disability_yes, disability_no,
    health_support_yes, health_support_no
  FROM residents;

  SELECT coalesce(jsonb_agg(pair ORDER BY code), '[]'::jsonb)
  INTO indicators
  FROM (VALUES
    ('hh_water_unimproved', public.cna_need_indicator_pair('hh_water_unimproved','household',water_yes,water_no,threshold)),
    ('hh_sanitation_limited', public.cna_need_indicator_pair('hh_sanitation_limited','household',sanitation_yes,sanitation_no,threshold)),
    ('hh_no_electricity', public.cna_need_indicator_pair('hh_no_electricity','household',electricity_yes,electricity_no,threshold)),
    ('hh_housing_inadequate', public.cna_need_indicator_pair('hh_housing_inadequate','household',housing_yes,housing_no,threshold)),
    ('hh_flood_exposed', public.cna_need_indicator_pair('hh_flood_exposed','household',flood_yes,flood_no,threshold)),
    ('hh_no_digital_access', public.cna_need_indicator_pair('hh_no_digital_access','household',digital_yes,digital_no,threshold)),
    ('hh_low_income', public.cna_need_indicator_pair('hh_low_income','household',income_yes,income_no,threshold)),
    ('hh_need_health', public.cna_need_indicator_pair('hh_need_health','household',need_health_yes,need_health_no,threshold)),
    ('hh_need_education', public.cna_need_indicator_pair('hh_need_education','household',need_education_yes,need_education_no,threshold)),
    ('hh_need_livelihood', public.cna_need_indicator_pair('hh_need_livelihood','household',need_livelihood_yes,need_livelihood_no,threshold)),
    ('hh_need_housing', public.cna_need_indicator_pair('hh_need_housing','household',need_housing_yes,need_housing_no,threshold)),
    ('hh_need_sanitation', public.cna_need_indicator_pair('hh_need_sanitation','household',need_sanitation_yes,need_sanitation_no,threshold)),
    ('hh_need_disaster_readiness', public.cna_need_indicator_pair('hh_need_disaster_readiness','household',need_disaster_yes,need_disaster_no,threshold)),
    ('hh_need_digital_access', public.cna_need_indicator_pair('hh_need_digital_access','household',need_digital_yes,need_digital_no,threshold)),
    ('res_school_age_not_enrolled', public.cna_need_indicator_pair('res_school_age_not_enrolled','resident',school_yes,school_no,threshold)),
    ('res_labor_force_unemployed', public.cna_need_indicator_pair('res_labor_force_unemployed','resident',labor_yes,labor_no,threshold)),
    ('res_disability_support', public.cna_need_indicator_pair('res_disability_support','resident',disability_yes,disability_no,threshold)),
    ('res_health_support', public.cna_need_indicator_pair('res_health_support','resident',health_support_yes,health_support_no,threshold))
  ) AS pairs(code, pair);

  RETURN jsonb_build_object(
    'schemaVersion', 'agape.profiling.need-indicators.v1',
    'cycle', jsonb_build_object(
      'id', cycle.id,
      'barangayId', cycle.barangay_id,
      'name', cycle.name,
      'status', cycle.status,
      'reportingDate', cycle.collection_ends_on
    ),
    'sample', jsonb_build_object(
      'approvedHouseholds', coalesce(approved_households, 0),
      'approvedResidents', coalesce(approved_residents, 0)
    ),
    'privacy', jsonb_build_object(
      'suppressionThreshold', threshold,
      'complementarySuppression', true
    ),
    'asOf', clock_timestamp(),
    'indicators', indicators
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cna_need_indicators(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  cycle public.profiling_cycles%ROWTYPE;
  snapshot_id uuid;
  snapshot_data jsonb;
  computed jsonb;
  digest_text text;
BEGIN
  -- Serialize snapshot creation per cycle. The evidence row is immutable, so
  -- concurrent callers must observe one stable cycle definition and one
  -- content hash rather than racing on a moving reporting date.
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL THEN
    RAISE EXCEPTION 'cycle not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read', cycle.barangay_id, NULL);
  IF cycle.status NOT IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'need indicators require a completed cycle' USING ERRCODE = '23514';
  END IF;

  SELECT evidence.id, evidence.aggregate_data
    INTO snapshot_id, snapshot_data
  FROM public.profiling_evidence_snapshots AS evidence
  WHERE evidence.cycle_id = p_cycle_id
    AND evidence.aggregate_schema_version = 'agape.profiling.need-indicators.v1'
  ORDER BY evidence.generated_at DESC
  LIMIT 1;
  IF snapshot_id IS NOT NULL THEN
    RETURN snapshot_data || jsonb_build_object('evidenceSnapshotId', snapshot_id);
  END IF;

  computed := public.cna_need_indicators_internal(p_cycle_id);
  digest_text := encode(digest(convert_to(computed::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.profiling_evidence_snapshots(
    cycle_id, generated_by, aggregate_schema_version, aggregate_data, content_hash
  ) VALUES (
    p_cycle_id, auth.uid(), 'agape.profiling.need-indicators.v1', computed, digest_text
  ) ON CONFLICT (cycle_id, content_hash) DO NOTHING;

  SELECT evidence.id INTO snapshot_id
  FROM public.profiling_evidence_snapshots AS evidence
  WHERE evidence.cycle_id = p_cycle_id
    AND evidence.aggregate_schema_version = 'agape.profiling.need-indicators.v1'
    AND evidence.content_hash = digest_text
  ORDER BY evidence.generated_at DESC
  LIMIT 1;
  RETURN computed || jsonb_build_object('evidenceSnapshotId', snapshot_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.cna_resident_age_as_of(jsonb, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cna_need_indicator_pair(text, text, bigint, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cna_need_indicators_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cna_need_indicators(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cna_need_indicators(uuid) TO authenticated;

COMMIT;
