BEGIN;

-- Expose only the metadata needed to choose an immutable, de-identified
-- profiling snapshot. Aggregate cells remain inside the database and are
-- evaluated solely by phase2_calculate_beneficiary_estimate.
CREATE OR REPLACE FUNCTION public.phase2_list_beneficiary_evidence_options(p_barangay_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  active_mode text;
  actor_email text;
  result jsonb;
BEGIN
  active_mode := public.phase2_assert_actor_runtime('proposals');
  IF NOT public.phase2_current_has_capability('proposal.create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.barangays b
    WHERE b.id = p_barangay_id
      AND b.is_synthetic_test = (active_mode = 'synthetic')
  ) THEN
    RAISE EXCEPTION 'target barangay is outside the active data mode' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', evidence.id,
    'cycleId', cycle.id,
    'cycleName', cycle.name,
    'barangayId', cycle.barangay_id,
    'generatedAt', evidence.generated_at,
    'asOfDate', coalesce(evidence.aggregate_data #>> '{cycle,reportingDate}', evidence.generated_at::date::text),
    'sampleMethod', coalesce(evidence.aggregate_data #>> '{sample,method}', 'not_stated'),
    'approvedHouseholds', coalesce((evidence.aggregate_data #>> '{sample,approvedHouseholds}')::integer, 0),
    'approvedResidents', coalesce((evidence.aggregate_data #>> '{sample,approvedResidents}')::integer, 0),
    'coveragePercent', (evidence.aggregate_data #>> '{sample,coveragePercent}')::numeric,
    'sourceKind', 'approved_sample'
  ) ORDER BY cycle.collection_ends_on DESC, evidence.generated_at DESC, evidence.id), '[]'::jsonb)
  INTO result
  FROM public.profiling_evidence_snapshots evidence
  JOIN public.profiling_cycles cycle ON cycle.id = evidence.cycle_id
  WHERE cycle.barangay_id = p_barangay_id
    AND cycle.status IN ('completed', 'archived')
    AND evidence.aggregate_schema_version = 'agape.profiling.aggregate.v2'
    AND evidence.aggregate_data #>> '{source,kind}' = 'approved_sample';

  SELECT email INTO actor_email FROM public.users WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_email, action, resource_type, resource_id, metadata)
  VALUES (
    auth.uid(), actor_email, 'proposal.v2.beneficiary_evidence.list',
    'profiling_evidence_snapshot', p_barangay_id::text,
    jsonb_build_object('data_mode', active_mode, 'option_count', jsonb_array_length(result))
  );
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_list_beneficiary_evidence_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase2_list_beneficiary_evidence_options(uuid) TO authenticated;

COMMIT;
