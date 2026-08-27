-- Record a proposal validation event and its stakeholders as one governed
-- transaction. This correction is intentionally forward-only.
BEGIN;

CREATE OR REPLACE FUNCTION public.proposal_create_validation_event(
  p_proposal_id uuid,
  p_method text,
  p_date_conducted date,
  p_summary text,
  p_stakeholders jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor public.users%ROWTYPE;
  proposal public.project_proposals%ROWTYPE;
  validation_id uuid;
  prior_claim_role text;
  prior_claim_sub text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.phase1_current_has_capability('proposal.validation.record') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO actor
  FROM public.users
  WHERE id = auth.uid();

  SELECT * INTO proposal
  FROM public.project_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF proposal.id IS NULL THEN
    RAISE EXCEPTION 'proposal not found' USING ERRCODE = 'P0002';
  END IF;
  IF proposal.status NOT IN ('draft', 'submitted', 'revisions_requested') THEN
    RAISE EXCEPTION 'proposal is not editable' USING ERRCODE = '40001';
  END IF;
  IF actor.role LIKE 'barangay_%'
     AND (actor.barangay_id IS NULL OR actor.barangay_id IS DISTINCT FROM proposal.barangay_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('fgd', 'key_informant', 'town_hall', 'consultation', 'door_to_door', 'other') THEN
    RAISE EXCEPTION 'invalid validation method' USING ERRCODE = '22023';
  END IF;
  IF p_date_conducted IS NULL OR p_date_conducted > current_date THEN
    RAISE EXCEPTION 'invalid validation date' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_summary, ''))) NOT BETWEEN 20 AND 5000 THEN
    RAISE EXCEPTION 'invalid validation summary' USING ERRCODE = '22023';
  END IF;
  IF p_stakeholders IS NULL OR jsonb_typeof(p_stakeholders) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid validation stakeholders' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_stakeholders) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'invalid validation stakeholders' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_stakeholders) AS item(value)
    WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
       OR item.value - ARRAY['name', 'role', 'present']::text[] <> '{}'::jsonb
       OR jsonb_typeof(item.value -> 'name') IS DISTINCT FROM 'string'
       OR length(btrim(item.value ->> 'name')) NOT BETWEEN 2 AND 160
       OR (
         item.value ? 'role'
         AND jsonb_typeof(item.value -> 'role') NOT IN ('string', 'null')
       )
       OR length(btrim(coalesce(item.value ->> 'role', ''))) > 120
       OR jsonb_typeof(item.value -> 'present') IS DISTINCT FROM 'boolean'
  ) THEN
    RAISE EXCEPTION 'invalid validation stakeholder entry' USING ERRCODE = '22023';
  END IF;

  -- These inserts fire the legacy derived-validation trigger, which updates
  -- only the proposal's community-validation columns. Execute that internal
  -- graph write under a local service claim so the generic direct-write guard
  -- does not mistake it for a caller-authored proposal workflow mutation. The
  -- authenticated actor remains explicit on every governed row and audit.
  prior_claim_role := current_setting('request.jwt.claim.role', true);
  prior_claim_sub := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  INSERT INTO public.proposal_validations(
    proposal_id, method, date_conducted, summary, recorded_by
  ) VALUES (
    proposal.id, p_method, p_date_conducted, btrim(p_summary), actor.id
  )
  RETURNING id INTO validation_id;

  INSERT INTO public.proposal_validation_stakeholders(
    validation_id, stakeholder_name, role, present
  )
  SELECT
    validation_id,
    btrim(item.value ->> 'name'),
    nullif(btrim(item.value ->> 'role'), ''),
    (item.value ->> 'present')::boolean
  FROM jsonb_array_elements(p_stakeholders) AS item(value);

  PERFORM set_config('request.jwt.claim.role', coalesce(prior_claim_role, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(prior_claim_sub, ''), true);

  INSERT INTO public.audit_logs(
    user_id, user_email, action, resource_type, resource_id, level, metadata
  ) VALUES (
    actor.id,
    actor.email,
    'proposal.validation.recorded',
    'proposal_validation',
    validation_id::text,
    'info',
    jsonb_build_object(
      'proposal_id', proposal.id,
      'method', p_method,
      'date_conducted', p_date_conducted,
      'stakeholder_count', jsonb_array_length(p_stakeholders)
    )
  );

  RETURN jsonb_build_object('id', validation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.proposal_create_validation_event(uuid,text,date,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_create_validation_event(uuid,text,date,text,jsonb)
  TO authenticated;

COMMIT;
