-- Proposal workflow review events were already emitted by the V1 API, but the
-- original review decision constraint only allowed final review outcomes. This
-- forward migration makes the persisted event contract match the application
-- without rewriting historical rows or introducing a second event table.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.proposal_reviews') IS NULL THEN
    RAISE EXCEPTION 'proposal_reviews is required for the workflow repair';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.proposal_reviews'::regclass
       AND conname = 'proposal_reviews_decision_check'
  ) THEN
    RAISE EXCEPTION 'proposal_reviews_decision_check is missing; refusing an unsafe repair';
  END IF;

  ALTER TABLE public.proposal_reviews
    DROP CONSTRAINT proposal_reviews_decision_check;

  ALTER TABLE public.proposal_reviews
    ADD CONSTRAINT proposal_reviews_decision_check
    CHECK (decision = ANY (ARRAY[
      'approved'::text,
      'rejected'::text,
      'needs_revision'::text,
      'submitted'::text,
      'prescreening_failed'::text,
      'finance_cleared'::text,
      'revisions_requested'::text,
      'resubmitted'::text
    ]));
END
$$;

CREATE OR REPLACE FUNCTION public.phase0_apply_proposal_workflow_change(
  p_proposal_id uuid,
  p_expected_status text,
  p_expected_finance_clearance boolean,
  p_patch jsonb,
  p_reviewer_id uuid DEFAULT NULL,
  p_review_stage text DEFAULT NULL,
  p_review_decision text DEFAULT NULL,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  claim_role text;
  disallowed_keys text[];
  changed_rows integer;
  resulting_status text;
  allowed_decisions CONSTANT text[] := ARRAY[
    'approved', 'rejected', 'needs_revision', 'submitted',
    'prescreening_failed', 'finance_cleared', 'revisions_requested',
    'resubmitted'
  ];
BEGIN
  claim_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.role()
  );

  IF claim_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION
      'Proposal workflow changes require the trusted service role'
      USING ERRCODE = '42501';
  END IF;

  IF p_proposal_id IS NULL
     OR p_expected_status IS NULL
     OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION
      'Proposal id, expected status, and an object patch are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(patch_key ORDER BY patch_key)
    INTO disallowed_keys
    FROM jsonb_object_keys(p_patch) AS patch(patch_key)
   WHERE patch_key <> ALL (ARRAY[
     'status',
     'revision_count',
     'revision_requested_from',
     'finance_clearance',
     'finance_cleared_at',
     'finance_cleared_by',
     'finance_notes',
     'prescreening_passed',
     'prescreening_checks',
     'prescreening_ran_at'
   ]::text[]);

  IF COALESCE(cardinality(disallowed_keys), 0) > 0 THEN
    RAISE EXCEPTION
      'Unsupported proposal workflow patch field'
      USING
        ERRCODE = '22023',
        DETAIL = array_to_string(disallowed_keys, ', ');
  END IF;

  IF (p_review_decision IS NULL) <> (p_reviewer_id IS NULL)
     OR (p_review_decision IS NOT NULL AND p_review_stage IS NULL)
  THEN
    RAISE EXCEPTION
      'Review decision, reviewer, and stage must be supplied together'
      USING ERRCODE = '22023';
  END IF;

  IF p_review_decision IS NOT NULL
     AND NOT (p_review_decision = ANY (allowed_decisions))
  THEN
    RAISE EXCEPTION
      'Unsupported proposal review decision'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.project_proposals
     SET status = CASE
           WHEN p_patch ? 'status' THEN p_patch ->> 'status'
           ELSE status
         END,
         revision_count = CASE
           WHEN p_patch ? 'revision_count'
             THEN (p_patch ->> 'revision_count')::integer
           ELSE revision_count
         END,
         revision_requested_from = CASE
           WHEN p_patch ? 'revision_requested_from'
             THEN p_patch ->> 'revision_requested_from'
           ELSE revision_requested_from
         END,
         finance_clearance = CASE
           WHEN p_patch ? 'finance_clearance'
             THEN (p_patch ->> 'finance_clearance')::boolean
           ELSE finance_clearance
         END,
         finance_cleared_at = CASE
           WHEN p_patch ? 'finance_cleared_at'
             THEN (p_patch ->> 'finance_cleared_at')::timestamptz
           ELSE finance_cleared_at
         END,
         finance_cleared_by = CASE
           WHEN p_patch ? 'finance_cleared_by'
             THEN (p_patch ->> 'finance_cleared_by')::uuid
           ELSE finance_cleared_by
         END,
         finance_notes = CASE
           WHEN p_patch ? 'finance_notes' THEN p_patch ->> 'finance_notes'
           ELSE finance_notes
         END,
         prescreening_passed = CASE
           WHEN p_patch ? 'prescreening_passed'
             THEN (p_patch ->> 'prescreening_passed')::boolean
           ELSE prescreening_passed
         END,
         prescreening_checks = CASE
           WHEN p_patch ? 'prescreening_checks'
             THEN NULLIF(p_patch -> 'prescreening_checks', 'null'::jsonb)
           ELSE prescreening_checks
         END,
         prescreening_ran_at = CASE
           WHEN p_patch ? 'prescreening_ran_at'
             THEN (p_patch ->> 'prescreening_ran_at')::timestamptz
           ELSE prescreening_ran_at
         END,
         updated_at = now()
   WHERE id = p_proposal_id
     AND status = p_expected_status
     AND finance_clearance IS NOT DISTINCT FROM p_expected_finance_clearance
   RETURNING status INTO resulting_status;

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN
    RAISE EXCEPTION
      'Proposal workflow state changed before this action could be applied'
      USING
        ERRCODE = '40001',
        HINT = 'Reload the proposal and retry the human decision.';
  END IF;

  IF p_review_decision IS NOT NULL THEN
    INSERT INTO public.proposal_reviews (
      proposal_id,
      reviewer_id,
      stage,
      decision,
      notes
    ) VALUES (
      p_proposal_id,
      p_reviewer_id,
      p_review_stage,
      p_review_decision,
      p_review_notes
    );
  END IF;

  RETURN jsonb_build_object('status', resulting_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.phase0_apply_proposal_workflow_change(
  uuid, text, boolean, jsonb, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phase0_apply_proposal_workflow_change(
  uuid, text, boolean, jsonb, uuid, text, text, text
) TO service_role;

COMMIT;
