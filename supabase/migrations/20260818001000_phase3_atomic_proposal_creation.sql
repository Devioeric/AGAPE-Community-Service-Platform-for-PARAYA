-- Create the V1-compatible proposal draft, SDG alignments, and optional
-- recommendation provenance as one governed transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.proposal_create_draft_graph(
  p_proposal jsonb,
  p_sdg_alignments jsonb DEFAULT '[]'::jsonb,
  p_recommendation_context jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor public.users%ROWTYPE;
  proposal_id uuid := gen_random_uuid();
  proposal_barangay_id uuid;
  informed_proposal_ids uuid[] := '{}'::uuid[];
  timeline_start_value date;
  timeline_end_value date;
  budget_value numeric;
  beneficiary_count_value integer;
  verified_snapshot_id uuid;
  provenance_link_count integer := 0;
  recommendation_fingerprint text;
  prior_claim_role text;
  prior_claim_sub text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.phase1_current_has_capability('proposal.create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO actor
  FROM public.users
  WHERE id = auth.uid();

  IF p_proposal IS NULL
     OR jsonb_typeof(p_proposal) IS DISTINCT FROM 'object'
     OR p_proposal - ARRAY[
       'title', 'rationale', 'objectives', 'target_beneficiaries',
       'expected_beneficiary_count', 'expected_output', 'timeline_start',
       'timeline_end', 'budget', 'barangay_id', 'is_income_generating',
       'informed_by_proposals'
     ]::text[] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'invalid proposal fields' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_proposal -> 'title') IS DISTINCT FROM 'string'
     OR length(btrim(p_proposal ->> 'title')) NOT BETWEEN 3 AND 300
     OR jsonb_typeof(p_proposal -> 'rationale') IS DISTINCT FROM 'string'
     OR length(btrim(p_proposal ->> 'rationale')) NOT BETWEEN 10 AND 20000 THEN
    RAISE EXCEPTION 'invalid required proposal text' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('objectives', 20000),
      ('target_beneficiaries', 5000),
      ('expected_output', 10000)
    ) AS text_field(field_name, maximum_length)
    WHERE p_proposal ? text_field.field_name
      AND (
        jsonb_typeof(p_proposal -> text_field.field_name) NOT IN ('string', 'null')
        OR length(btrim(coalesce(p_proposal ->> text_field.field_name, ''))) > text_field.maximum_length
      )
  ) THEN
    RAISE EXCEPTION 'invalid optional proposal text' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['timeline_start', 'timeline_end']) AS date_field(field_name)
    WHERE p_proposal ? date_field.field_name
      AND (
        jsonb_typeof(p_proposal -> date_field.field_name) NOT IN ('string', 'null')
        OR (
          jsonb_typeof(p_proposal -> date_field.field_name) = 'string'
          AND (p_proposal ->> date_field.field_name) !~ '^\d{4}-\d{2}-\d{2}$'
        )
      )
  ) THEN
    RAISE EXCEPTION 'invalid proposal date' USING ERRCODE = '22023';
  END IF;

  BEGIN
    timeline_start_value := CASE
      WHEN jsonb_typeof(p_proposal -> 'timeline_start') = 'string'
        THEN (p_proposal ->> 'timeline_start')::date
      ELSE NULL
    END;
    timeline_end_value := CASE
      WHEN jsonb_typeof(p_proposal -> 'timeline_end') = 'string'
        THEN (p_proposal ->> 'timeline_end')::date
      ELSE NULL
    END;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'invalid proposal date' USING ERRCODE = '22023';
  END;

  IF timeline_start_value IS NOT NULL
     AND timeline_end_value IS NOT NULL
     AND timeline_end_value < timeline_start_value THEN
    RAISE EXCEPTION 'proposal end date precedes start date' USING ERRCODE = '22023';
  END IF;

  IF p_proposal ? 'budget'
     AND jsonb_typeof(p_proposal -> 'budget') NOT IN ('number', 'null') THEN
    RAISE EXCEPTION 'invalid proposal budget' USING ERRCODE = '22023';
  END IF;
  budget_value := CASE
    WHEN jsonb_typeof(p_proposal -> 'budget') = 'number'
      THEN (p_proposal ->> 'budget')::numeric
    ELSE NULL
  END;
  IF budget_value IS NOT NULL AND (budget_value < 0 OR budget_value > 9999999999.99) THEN
    RAISE EXCEPTION 'invalid proposal budget' USING ERRCODE = '22023';
  END IF;

  IF p_proposal ? 'expected_beneficiary_count'
     AND jsonb_typeof(p_proposal -> 'expected_beneficiary_count') NOT IN ('number', 'null') THEN
    RAISE EXCEPTION 'invalid beneficiary count' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_proposal -> 'expected_beneficiary_count') = 'number' THEN
    IF (p_proposal ->> 'expected_beneficiary_count')::numeric < 0
       OR (p_proposal ->> 'expected_beneficiary_count')::numeric > 2147483647
       OR (p_proposal ->> 'expected_beneficiary_count')::numeric
          <> trunc((p_proposal ->> 'expected_beneficiary_count')::numeric) THEN
      RAISE EXCEPTION 'invalid beneficiary count' USING ERRCODE = '22023';
    END IF;
    beneficiary_count_value := (p_proposal ->> 'expected_beneficiary_count')::integer;
  END IF;

  IF p_proposal ? 'barangay_id'
     AND jsonb_typeof(p_proposal -> 'barangay_id') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'invalid barangay' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_proposal -> 'barangay_id') = 'string' THEN
    IF (p_proposal ->> 'barangay_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid barangay' USING ERRCODE = '22023';
    END IF;
    proposal_barangay_id := (p_proposal ->> 'barangay_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.barangays WHERE id = proposal_barangay_id) THEN
      RAISE EXCEPTION 'barangay not found' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_proposal ? 'is_income_generating'
     AND jsonb_typeof(p_proposal -> 'is_income_generating') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'invalid income-generating flag' USING ERRCODE = '22023';
  END IF;

  IF p_proposal ? 'informed_by_proposals' THEN
    IF jsonb_typeof(p_proposal -> 'informed_by_proposals') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_proposal -> 'informed_by_proposals') > 100
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_proposal -> 'informed_by_proposals') AS item(value)
         WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
            OR trim(both '"' from item.value::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       ) THEN
      RAISE EXCEPTION 'invalid informed proposal references' USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(array_agg(value::uuid ORDER BY value::uuid), '{}'::uuid[])
    INTO informed_proposal_ids
    FROM (
      SELECT item.value #>> '{}' AS value
      FROM jsonb_array_elements(p_proposal -> 'informed_by_proposals') AS item(value)
    ) AS proposal_reference;

    IF cardinality(informed_proposal_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(informed_proposal_ids))) THEN
      RAISE EXCEPTION 'duplicate informed proposal reference' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM public.project_proposals WHERE id = ANY(informed_proposal_ids))
       <> cardinality(informed_proposal_ids) THEN
      RAISE EXCEPTION 'informed proposal not found' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_sdg_alignments IS NULL
     OR jsonb_typeof(p_sdg_alignments) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_sdg_alignments) > 17
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_sdg_alignments) AS item(value)
       WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
          OR item.value - ARRAY['sdg_number', 'indicator']::text[] <> '{}'::jsonb
          OR jsonb_typeof(item.value -> 'sdg_number') IS DISTINCT FROM 'number'
          OR (item.value ->> 'sdg_number')::numeric <> trunc((item.value ->> 'sdg_number')::numeric)
          OR (item.value ->> 'sdg_number')::numeric NOT BETWEEN 1 AND 17
          OR (
            item.value ? 'indicator'
            AND jsonb_typeof(item.value -> 'indicator') NOT IN ('string', 'null')
          )
          OR length(btrim(coalesce(item.value ->> 'indicator', ''))) > 2000
     )
     OR (
       SELECT count(*) <> count(DISTINCT (item.value ->> 'sdg_number')::integer)
       FROM jsonb_array_elements(p_sdg_alignments) AS item(value)
     ) THEN
    RAISE EXCEPTION 'invalid SDG alignments' USING ERRCODE = '22023';
  END IF;

  IF p_recommendation_context IS NOT NULL THEN
    IF jsonb_typeof(p_recommendation_context) IS DISTINCT FROM 'object'
       OR p_recommendation_context - ARRAY[
         'need_id', 'evidence_snapshot_id', 'recommendation_fingerprint'
       ]::text[] <> '{}'::jsonb
       OR jsonb_typeof(p_recommendation_context -> 'need_id') IS DISTINCT FROM 'string'
       OR (p_recommendation_context ->> 'need_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR (
         p_recommendation_context ? 'evidence_snapshot_id'
         AND jsonb_typeof(p_recommendation_context -> 'evidence_snapshot_id') NOT IN ('string', 'null')
       )
       OR (
         jsonb_typeof(p_recommendation_context -> 'evidence_snapshot_id') = 'string'
         AND (p_recommendation_context ->> 'evidence_snapshot_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       )
       OR jsonb_typeof(p_recommendation_context -> 'recommendation_fingerprint') IS DISTINCT FROM 'string'
       OR (p_recommendation_context ->> 'recommendation_fingerprint') !~ '^[0-9a-f]{64}$'
       OR proposal_barangay_id IS NULL THEN
      RAISE EXCEPTION 'invalid recommendation context' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.community_needs need
      WHERE need.id = (p_recommendation_context ->> 'need_id')::uuid
        AND need.barangay_id = proposal_barangay_id
        AND need.approval_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'recommendation need is not approved for the proposal barangay' USING ERRCODE = '23503';
    END IF;

    IF jsonb_typeof(p_recommendation_context -> 'evidence_snapshot_id') = 'string' THEN
      SELECT snapshot.id
      INTO verified_snapshot_id
      FROM public.profiling_evidence_snapshots snapshot
      JOIN public.profiling_cycles cycle ON cycle.id = snapshot.cycle_id
      WHERE snapshot.id = (p_recommendation_context ->> 'evidence_snapshot_id')::uuid
        AND snapshot.aggregate_schema_version = 'agape.profiling.aggregate.v2'
        AND cycle.barangay_id = proposal_barangay_id
        AND cycle.status IN ('completed', 'archived');

      IF verified_snapshot_id IS NULL THEN
        RAISE EXCEPTION 'recommendation evidence is unavailable for the proposal barangay' USING ERRCODE = '23503';
      END IF;
    END IF;

    recommendation_fingerprint := p_recommendation_context ->> 'recommendation_fingerprint';
  END IF;

  -- The legacy workflow guard treats a non-null auth.uid() as a direct table
  -- mutation. Temporarily use a local trusted claim only after the actor and
  -- entire graph have been validated; governed rows still store actor.id.
  prior_claim_role := current_setting('request.jwt.claim.role', true);
  prior_claim_sub := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  INSERT INTO public.project_proposals(
    id, title, rationale, objectives, target_beneficiaries,
    expected_beneficiary_count, expected_output, timeline_start, timeline_end,
    budget, barangay_id, status, created_by, is_income_generating,
    informed_by_proposals
  ) VALUES (
    proposal_id,
    btrim(p_proposal ->> 'title'),
    btrim(p_proposal ->> 'rationale'),
    nullif(btrim(p_proposal ->> 'objectives'), ''),
    nullif(btrim(p_proposal ->> 'target_beneficiaries'), ''),
    beneficiary_count_value,
    nullif(btrim(p_proposal ->> 'expected_output'), ''),
    timeline_start_value,
    timeline_end_value,
    budget_value,
    proposal_barangay_id,
    'draft',
    actor.id,
    coalesce((p_proposal ->> 'is_income_generating')::boolean, false),
    informed_proposal_ids
  );

  INSERT INTO public.proposal_sdg_alignment(proposal_id, sdg_number, indicator)
  SELECT
    proposal_id,
    (item.value ->> 'sdg_number')::integer,
    nullif(btrim(item.value ->> 'indicator'), '')
  FROM jsonb_array_elements(p_sdg_alignments) AS item(value);

  IF p_recommendation_context IS NOT NULL THEN
    INSERT INTO public.proposal_validation_links(
      proposal_id, source_type, source_id, provenance_kind, rationale, linked_by
    ) VALUES (
      proposal_id,
      'community_need',
      (p_recommendation_context ->> 'need_id')::uuid,
      'advisory_planning',
      'Preserved from advisory recommendation ' || recommendation_fingerprint ||
        '; the officer explicitly created this draft.',
      actor.id
    );
    provenance_link_count := 1;

    IF verified_snapshot_id IS NOT NULL THEN
      INSERT INTO public.proposal_validation_links(
        proposal_id, source_type, source_id, provenance_kind, rationale, linked_by
      ) VALUES (
        proposal_id,
        'profiling_evidence_snapshot',
        verified_snapshot_id,
        'advisory_planning',
        'Preserved from advisory recommendation ' || recommendation_fingerprint ||
          '; the officer explicitly created this draft.',
        actor.id
      );
      provenance_link_count := 2;
    END IF;
  END IF;

  PERFORM set_config('request.jwt.claim.role', coalesce(prior_claim_role, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(prior_claim_sub, ''), true);

  INSERT INTO public.audit_logs(
    user_id, user_email, action, resource_type, resource_id, level, metadata
  ) VALUES (
    actor.id,
    actor.email,
    'proposal.draft.created',
    'project_proposal',
    proposal_id::text,
    'info',
    jsonb_build_object(
      'sdg_count', jsonb_array_length(p_sdg_alignments),
      'recommendation_provenance_count', provenance_link_count
    )
  );

  RETURN jsonb_build_object(
    'id', proposal_id,
    'status', 'draft',
    'recommendationProvenance', CASE
      WHEN p_recommendation_context IS NULL THEN NULL
      ELSE jsonb_build_object('linked', true, 'linkCount', provenance_link_count)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.proposal_create_draft_graph(jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_create_draft_graph(jsonb,jsonb,jsonb)
  TO authenticated;

COMMIT;
