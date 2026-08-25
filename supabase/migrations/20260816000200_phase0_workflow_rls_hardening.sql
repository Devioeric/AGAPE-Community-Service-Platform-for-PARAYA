-- Phase 0: enforce proposal/program write boundaries below the API layer.
--
-- Dedicated Next.js workflow routes use the service role after explicit human
-- authorization. Direct authenticated PostgREST clients may edit ordinary
-- draft content only; they cannot change ownership, approvals, finance state,
-- review state, or other workflow-controlled columns.

BEGIN;

-- The reconciled pre-Phase-0 schema predates workflow confirmation tracking.
-- The authoritative migration ledger for the sole AGAPE backend contains no
-- timestamped migrations, so this unapplied migration owns the additive
-- introduction of the column that its guards and policies require below.
ALTER TABLE public.program_signups
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

DO $migration_check$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'public.users',
    'public.project_proposals',
    'public.proposal_sdg_alignment',
    'public.proposal_reviews',
    'public.programs',
    'public.program_activities',
    'public.program_budgets',
    'public.program_signups'
  ]
  LOOP
    IF to_regclass(required_table) IS NULL THEN
      RAISE EXCEPTION
        'Phase 0 workflow hardening requires %; reconcile/apply the live base schema first',
        required_table;
    END IF;
  END LOOP;
END;
$migration_check$;

DO $program_signup_column_check$
DECLARE
  required_column text;
BEGIN
  FOREACH required_column IN ARRAY ARRAY[
    'id',
    'program_id',
    'volunteer_id',
    'status',
    'approval_status',
    'signed_up_at',
    'confirmed_at',
    'approved_by',
    'approved_at',
    'approval_notes',
    'added_by'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = 'public.program_signups'::regclass
         AND attribute.attname = required_column
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
    ) THEN
      RAISE EXCEPTION
        'Phase 0 signup hardening requires public.program_signups.%; reconcile/apply the signup schema first',
        required_column;
    END IF;
  END LOOP;
END;
$program_signup_column_check$;

CREATE OR REPLACE FUNCTION public.phase0_current_account_is_paraya()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.users AS account
     WHERE account.id = auth.uid()
       AND account.status = 'active'
       AND account.is_active IS TRUE
       AND account.role IN (
         'paraya_director',
         'paraya_associate',
         'paraya_researcher',
         'paraya_officer'
       )
  );
$function$;

REVOKE ALL ON FUNCTION public.phase0_current_account_is_paraya() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase0_current_account_is_paraya() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.phase0_current_account_is_active_volunteer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.users AS account
     WHERE account.id = auth.uid()
       AND account.status = 'active'
       AND account.is_active IS TRUE
       AND account.role = 'volunteer'
  );
$function$;

REVOKE ALL ON FUNCTION public.phase0_current_account_is_active_volunteer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase0_current_account_is_active_volunteer() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_phase0_workflow_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  claim_role text;
  actor_id uuid;
  payload jsonb;
  previous_payload jsonb;
  allowed_columns text[];
  changed_columns text[];
BEGIN
  claim_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.role()
  );
  actor_id := auth.uid();

  -- Database-owner and service-role workflows are authorized in trusted server
  -- code. The trigger constrains direct anon/authenticated PostgREST requests.
  IF NOT (
    current_user::text IN ('anon', 'authenticated')
    OR claim_role IN ('anon', 'authenticated')
    OR actor_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF actor_id IS NULL OR NOT public.phase0_current_account_is_paraya() THEN
    RAISE EXCEPTION
      'Only an active PARAYA officer may mutate this record directly'
      USING ERRCODE = '42501';
  END IF;

  payload := to_jsonb(NEW);

  IF TG_OP = 'INSERT' THEN
    IF payload ->> 'created_by' IS DISTINCT FROM actor_id::text THEN
      RAISE EXCEPTION
        'created_by must match the authenticated PARAYA officer'
        USING ERRCODE = '42501';
    END IF;

    IF TG_TABLE_NAME = 'project_proposals' THEN
      IF payload ->> 'status' IS DISTINCT FROM 'draft'
         OR COALESCE((payload ->> 'finance_clearance')::boolean, false)
         OR payload ->> 'finance_cleared_at' IS NOT NULL
         OR payload ->> 'finance_cleared_by' IS NOT NULL
         OR payload ->> 'finance_notes' IS NOT NULL
         OR payload ->> 'prescreening_passed' IS NOT NULL
         OR payload ->> 'prescreening_checks' IS NOT NULL
         OR payload ->> 'prescreening_ran_at' IS NOT NULL
         OR COALESCE((payload ->> 'community_validated')::boolean, false)
         OR payload ->> 'community_validation_notes' IS NOT NULL
         OR payload ->> 'community_validated_at' IS NOT NULL
         OR payload ->> 'community_validated_by' IS NOT NULL
         OR payload ->> 'reviewed_by' IS NOT NULL
         OR payload ->> 'reviewed_at' IS NOT NULL
         OR payload ->> 'approved_by' IS NOT NULL
         OR payload ->> 'approved_at' IS NOT NULL
         OR payload ->> 'rejected_by' IS NOT NULL
         OR payload ->> 'rejected_at' IS NOT NULL
         OR COALESCE((payload ->> 'revision_count')::integer, 0) <> 0
         OR payload ->> 'revision_requested_from' IS NOT NULL
      THEN
        RAISE EXCEPTION
          'New proposals must start as unreviewed drafts without finance or approval state'
          USING ERRCODE = '42501';
      END IF;
    ELSIF TG_TABLE_NAME = 'programs' AND payload ->> 'status' IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION
        'Direct program inserts must start as drafts'
        USING ERRCODE = '42501';
    ELSIF TG_TABLE_NAME = 'program_activities' THEN
      IF payload ->> 'status' NOT IN ('planned', 'ongoing', 'completed', 'cancelled')
         OR payload ->> 'approval_status' IS DISTINCT FROM 'approved'
         OR payload ->> 'approved_by' IS NOT NULL
         OR payload ->> 'approved_at' IS NOT NULL
         OR payload ->> 'approval_notes' IS NOT NULL
         OR payload ->> 'attendance_otp' IS NOT NULL
         OR payload ->> 'attendance_otp_expires_at' IS NOT NULL
         OR payload ->> 'attendance_otp_issued_at' IS NOT NULL
         OR payload ->> 'attendance_otp_issued_by' IS NOT NULL
         OR COALESCE((payload ->> 'volunteer_count')::integer, 0) <> 0
         OR COALESCE((payload ->> 'beneficiary_count')::integer, 0) <> 0
         OR payload ->> 'report_1' IS NOT NULL
         OR payload ->> 'report_2' IS NOT NULL
      THEN
        RAISE EXCEPTION
          'New activities cannot set approval, attendance, count, report, or audit state'
          USING ERRCODE = '42501';
      END IF;
    ELSIF TG_TABLE_NAME = 'program_budgets' THEN
      IF payload ->> 'approval_status' IS DISTINCT FROM 'approved'
         OR payload ->> 'approved_by' IS NOT NULL
         OR payload ->> 'approved_at' IS NOT NULL
         OR payload ->> 'approval_notes' IS NOT NULL
      THEN
        RAISE EXCEPTION
          'New budget lines cannot set approval or audit state'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  previous_payload := to_jsonb(OLD);
  CASE TG_TABLE_NAME
    WHEN 'project_proposals' THEN
      allowed_columns := ARRAY[
        'title',
        'rationale',
        'objectives',
        'target_beneficiaries',
        'expected_beneficiary_count',
        'expected_output',
        'timeline_start',
        'timeline_end',
        'budget',
        'barangay_id',
        'is_income_generating',
        'informed_by_proposals',
        'updated_at'
      ];

      IF previous_payload ->> 'status' NOT IN ('draft', 'revisions_requested') THEN
        RAISE EXCEPTION
          'Proposal content can be edited directly only while draft or revisions are requested'
          USING ERRCODE = '42501';
      END IF;
    WHEN 'programs' THEN
      allowed_columns := ARRAY[
        'title',
        'description',
        'barangay_id',
        'start_date',
        'end_date',
        'status',
        'max_volunteers',
        'updated_at'
      ];
    WHEN 'program_activities' THEN
      allowed_columns := ARRAY[
        'title',
        'description',
        'date',
        'location',
        'status',
        'report_1',
        'report_2',
        'updated_at'
      ];
    WHEN 'program_budgets' THEN
      allowed_columns := ARRAY[
        'category',
        'allocated',
        'spent',
        'notes',
        'updated_at'
      ];
    ELSE
      RAISE EXCEPTION 'Unsupported Phase 0 workflow table' USING ERRCODE = '42501';
  END CASE;

  SELECT array_agg(column_name ORDER BY column_name)
    INTO changed_columns
    FROM jsonb_object_keys(payload) AS columns(column_name)
   WHERE NOT (column_name = ANY (allowed_columns))
     AND (previous_payload -> column_name)
         IS DISTINCT FROM
         (payload -> column_name);

  IF COALESCE(cardinality(changed_columns), 0) > 0 THEN
    RAISE EXCEPTION
      'Workflow-controlled columns cannot be changed through a generic update'
      USING
        ERRCODE = '42501',
        DETAIL = format(
          'Protected columns in this update: %s',
          array_to_string(changed_columns, ', ')
        ),
        HINT = 'Use the dedicated human workflow action.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_phase0_workflow_columns() FROM PUBLIC, anon, authenticated, service_role;

-- Volunteers may create only their own safe pending signup and may later make
-- the one-way lifecycle change to withdrawn. PARAYA assignment, confirmation,
-- reactivation, and removal use explicitly authorized service-role routes.
-- This trigger keeps ownership, approval, confirmation, and audit fields out
-- of direct authenticated updates even when an older permissive policy exists.
CREATE OR REPLACE FUNCTION public.guard_phase0_program_signup_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  claim_role text;
  actor_id uuid;
  payload jsonb;
  previous_payload jsonb;
  changed_columns text[];
BEGIN
  claim_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.role()
  );
  actor_id := auth.uid();

  -- Trusted service/database workflows have already authorized their human
  -- caller and intentionally bypass the direct authenticated contract.
  IF NOT (
    current_user::text IN ('anon', 'authenticated')
    OR claim_role IN ('anon', 'authenticated')
    OR actor_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF actor_id IS NULL
     OR NOT public.phase0_current_account_is_active_volunteer()
  THEN
    RAISE EXCEPTION
      'Only an active Volunteer may mutate a signup directly'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.volunteer_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION
        'A Volunteer may create only their own signup'
        USING ERRCODE = '42501';
    END IF;

    -- Normalize every direct self-signup to server-owned initial state. The
    -- program is the only caller-selected relationship.
    NEW.status := 'pending';
    NEW.approval_status := 'approved';
    NEW.added_by := NULL;
    NEW.confirmed_at := NULL;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.approval_notes := NULL;
    NEW.signed_up_at := now();
    RETURN NEW;
  END IF;

  IF OLD.volunteer_id IS DISTINCT FROM actor_id
     OR NEW.volunteer_id IS DISTINCT FROM actor_id
     OR OLD.status NOT IN ('pending', 'confirmed')
     OR NEW.status IS DISTINCT FROM 'withdrawn'
  THEN
    RAISE EXCEPTION
      'A Volunteer may only withdraw their own active signup'
      USING ERRCODE = '42501';
  END IF;

  payload := to_jsonb(NEW);
  previous_payload := to_jsonb(OLD);
  SELECT array_agg(column_name ORDER BY column_name)
    INTO changed_columns
    FROM jsonb_object_keys(payload) AS columns(column_name)
   WHERE column_name <> 'status'
     AND (previous_payload -> column_name)
         IS DISTINCT FROM
         (payload -> column_name);

  IF COALESCE(cardinality(changed_columns), 0) > 0 THEN
    RAISE EXCEPTION
      'Signup ownership, approval, confirmation, and audit fields are immutable'
      USING
        ERRCODE = '42501',
        DETAIL = format(
          'Protected columns in this update: %s',
          array_to_string(changed_columns, ', ')
        );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_phase0_program_signup_write() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_proposal_review_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION
    'proposal_reviews is append-only; update and delete are not allowed'
    USING
      ERRCODE = '42501',
      HINT = 'Record a new review or compensating decision event.';

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_proposal_review_mutation() FROM PUBLIC, anon, authenticated, service_role;

-- Keep each workflow state change and its immutable review event in one
-- transaction. The application authorizes the human action first, then calls
-- this service-role-only function with an expected current status. The
-- expected-status predicate prevents two reviewers from acting on stale state.
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

-- Draft content and its SDG children must move together. This prevents a
-- submit/review action from racing a content edit and prevents a failed SDG
-- replacement from leaving a partially updated proposal.
CREATE OR REPLACE FUNCTION public.phase0_update_proposal_content(
  p_proposal_id uuid,
  p_expected_status text,
  p_patch jsonb,
  p_sdg_alignments jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  claim_role text;
  current_row public.project_proposals%ROWTYPE;
  patched_row public.project_proposals%ROWTYPE;
  updated_row public.project_proposals%ROWTYPE;
  disallowed_keys text[];
BEGIN
  claim_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.role()
  );
  IF claim_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION
      'Proposal content changes require the trusted service role'
      USING ERRCODE = '42501';
  END IF;

  IF p_proposal_id IS NULL
     OR p_expected_status IS NULL
     OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR (
       p_sdg_alignments IS NOT NULL
       AND jsonb_typeof(p_sdg_alignments) IS DISTINCT FROM 'array'
     )
  THEN
    RAISE EXCEPTION
      'Proposal id, expected status, object patch, and optional SDG array are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(patch_key ORDER BY patch_key)
    INTO disallowed_keys
    FROM jsonb_object_keys(p_patch) AS patch(patch_key)
   WHERE patch_key <> ALL (ARRAY[
     'title',
     'rationale',
     'objectives',
     'target_beneficiaries',
     'expected_beneficiary_count',
     'expected_output',
     'timeline_start',
     'timeline_end',
     'budget',
     'barangay_id',
     'is_income_generating',
     'informed_by_proposals'
   ]::text[]);

  IF COALESCE(cardinality(disallowed_keys), 0) > 0 THEN
    RAISE EXCEPTION
      'Unsupported proposal content patch field'
      USING
        ERRCODE = '22023',
        DETAIL = array_to_string(disallowed_keys, ', ');
  END IF;

  SELECT *
    INTO current_row
    FROM public.project_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND
     OR current_row.status IS DISTINCT FROM p_expected_status
     OR current_row.status NOT IN ('draft', 'revisions_requested')
  THEN
    RAISE EXCEPTION
      'Proposal is no longer editable in the expected state'
      USING
        ERRCODE = '40001',
        HINT = 'Reload the proposal before editing it again.';
  END IF;

  SELECT populated.*
    INTO patched_row
    FROM jsonb_populate_record(current_row, p_patch) AS populated;

  UPDATE public.project_proposals
     SET title = patched_row.title,
         rationale = patched_row.rationale,
         objectives = patched_row.objectives,
         target_beneficiaries = patched_row.target_beneficiaries,
         expected_beneficiary_count = patched_row.expected_beneficiary_count,
         expected_output = patched_row.expected_output,
         timeline_start = patched_row.timeline_start,
         timeline_end = patched_row.timeline_end,
         budget = patched_row.budget,
         barangay_id = patched_row.barangay_id,
         is_income_generating = patched_row.is_income_generating,
         informed_by_proposals = patched_row.informed_by_proposals,
         updated_at = now()
   WHERE id = p_proposal_id
   RETURNING * INTO updated_row;

  IF p_sdg_alignments IS NOT NULL THEN
    IF jsonb_array_length(p_sdg_alignments) > 17 THEN
      RAISE EXCEPTION 'At most 17 SDG alignments are allowed' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.proposal_sdg_alignment
     WHERE proposal_id = p_proposal_id;

    INSERT INTO public.proposal_sdg_alignment (
      proposal_id,
      sdg_number,
      indicator
    )
    SELECT p_proposal_id,
           (alignment ->> 'sdg_number')::integer,
           NULLIF(alignment ->> 'indicator', '')
      FROM jsonb_array_elements(p_sdg_alignments) AS alignments(alignment);
  END IF;

  RETURN to_jsonb(updated_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.phase0_update_proposal_content(
  uuid, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phase0_update_proposal_content(
  uuid, text, jsonb, jsonb
) TO service_role;

DROP TRIGGER IF EXISTS phase0_proposal_workflow_guard ON public.project_proposals;
CREATE TRIGGER phase0_proposal_workflow_guard
  BEFORE INSERT OR UPDATE ON public.project_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_phase0_workflow_columns();

DROP TRIGGER IF EXISTS phase0_program_workflow_guard ON public.programs;
CREATE TRIGGER phase0_program_workflow_guard
  BEFORE INSERT OR UPDATE ON public.programs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_phase0_workflow_columns();

DROP TRIGGER IF EXISTS phase0_program_activity_workflow_guard ON public.program_activities;
CREATE TRIGGER phase0_program_activity_workflow_guard
  BEFORE INSERT OR UPDATE ON public.program_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_phase0_workflow_columns();

DROP TRIGGER IF EXISTS phase0_program_budget_workflow_guard ON public.program_budgets;
CREATE TRIGGER phase0_program_budget_workflow_guard
  BEFORE INSERT OR UPDATE ON public.program_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_phase0_workflow_columns();

DROP TRIGGER IF EXISTS phase0_program_signup_write_guard ON public.program_signups;
CREATE TRIGGER phase0_program_signup_write_guard
  BEFORE INSERT OR UPDATE ON public.program_signups
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_phase0_program_signup_write();

DROP TRIGGER IF EXISTS proposal_reviews_append_only ON public.proposal_reviews;
CREATE TRIGGER proposal_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.proposal_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_proposal_review_mutation();

ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_sdg_alignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phase0_project_proposals_insert_guard" ON public.project_proposals;
CREATE POLICY "phase0_project_proposals_insert_guard"
  ON public.project_proposals
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.phase0_current_account_is_paraya())
    AND created_by = (SELECT auth.uid())
    AND status = 'draft'
  );

DROP POLICY IF EXISTS "phase0_project_proposals_update_guard" ON public.project_proposals;
CREATE POLICY "phase0_project_proposals_update_guard"
  ON public.project_proposals
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.phase0_current_account_is_paraya())
    AND status IN ('draft', 'revisions_requested')
  )
  WITH CHECK (
    (SELECT public.phase0_current_account_is_paraya())
    AND status IN ('draft', 'revisions_requested')
  );

DROP POLICY IF EXISTS "phase0_project_proposals_delete_guard" ON public.project_proposals;
CREATE POLICY "phase0_project_proposals_delete_guard"
  ON public.project_proposals
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "phase0_proposal_sdg_insert_guard" ON public.proposal_sdg_alignment;
CREATE POLICY "phase0_proposal_sdg_insert_guard"
  ON public.proposal_sdg_alignment
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.phase0_current_account_is_paraya())
    AND EXISTS (
      SELECT 1
        FROM public.project_proposals AS proposal
       WHERE proposal.id = proposal_sdg_alignment.proposal_id
         AND proposal.status IN ('draft', 'revisions_requested')
    )
  );

DROP POLICY IF EXISTS "phase0_proposal_sdg_update_guard" ON public.proposal_sdg_alignment;
CREATE POLICY "phase0_proposal_sdg_update_guard"
  ON public.proposal_sdg_alignment
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.phase0_current_account_is_paraya())
    AND EXISTS (
      SELECT 1
        FROM public.project_proposals AS proposal
       WHERE proposal.id = proposal_sdg_alignment.proposal_id
         AND proposal.status IN ('draft', 'revisions_requested')
    )
  )
  WITH CHECK (
    (SELECT public.phase0_current_account_is_paraya())
    AND EXISTS (
      SELECT 1
        FROM public.project_proposals AS proposal
       WHERE proposal.id = proposal_sdg_alignment.proposal_id
         AND proposal.status IN ('draft', 'revisions_requested')
    )
  );

DROP POLICY IF EXISTS "phase0_proposal_sdg_delete_guard" ON public.proposal_sdg_alignment;
CREATE POLICY "phase0_proposal_sdg_delete_guard"
  ON public.proposal_sdg_alignment
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.phase0_current_account_is_paraya())
    AND EXISTS (
      SELECT 1
        FROM public.project_proposals AS proposal
       WHERE proposal.id = proposal_sdg_alignment.proposal_id
         AND proposal.status IN ('draft', 'revisions_requested')
    )
  );

DROP POLICY IF EXISTS "phase0_proposal_reviews_insert_guard" ON public.proposal_reviews;
CREATE POLICY "phase0_proposal_reviews_insert_guard"
  ON public.proposal_reviews
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "phase0_proposal_reviews_update_guard" ON public.proposal_reviews;
CREATE POLICY "phase0_proposal_reviews_update_guard"
  ON public.proposal_reviews
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "phase0_proposal_reviews_delete_guard" ON public.proposal_reviews;
CREATE POLICY "phase0_proposal_reviews_delete_guard"
  ON public.proposal_reviews
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.proposal_reviews FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.proposal_reviews FROM service_role;
GRANT SELECT, INSERT ON public.proposal_reviews TO service_role;

DROP POLICY IF EXISTS "phase0_programs_write_guard" ON public.programs;
DROP POLICY IF EXISTS "phase0_programs_insert_guard" ON public.programs;
CREATE POLICY "phase0_programs_insert_guard"
  ON public.programs
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.phase0_current_account_is_paraya()));

DROP POLICY IF EXISTS "phase0_programs_update_guard" ON public.programs;
CREATE POLICY "phase0_programs_update_guard"
  ON public.programs
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.phase0_current_account_is_paraya()))
  WITH CHECK ((SELECT public.phase0_current_account_is_paraya()));

DROP POLICY IF EXISTS "phase0_programs_delete_guard" ON public.programs;
CREATE POLICY "phase0_programs_delete_guard"
  ON public.programs
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE DELETE, TRUNCATE ON public.programs FROM authenticated;

DROP POLICY IF EXISTS "phase0_program_activities_insert_guard" ON public.program_activities;
CREATE POLICY "phase0_program_activities_insert_guard"
  ON public.program_activities
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.phase0_current_account_is_paraya())
    AND created_by = (SELECT auth.uid())
    AND approval_status = 'approved'
  );

DROP POLICY IF EXISTS "phase0_program_activities_update_guard" ON public.program_activities;
CREATE POLICY "phase0_program_activities_update_guard"
  ON public.program_activities
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.phase0_current_account_is_paraya()))
  WITH CHECK ((SELECT public.phase0_current_account_is_paraya()));

DROP POLICY IF EXISTS "phase0_program_activities_delete_guard" ON public.program_activities;
CREATE POLICY "phase0_program_activities_delete_guard"
  ON public.program_activities
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "phase0_program_budgets_write_guard" ON public.program_budgets;
DROP POLICY IF EXISTS "phase0_program_budgets_insert_guard" ON public.program_budgets;
CREATE POLICY "phase0_program_budgets_insert_guard"
  ON public.program_budgets
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.phase0_current_account_is_paraya()));

DROP POLICY IF EXISTS "phase0_program_budgets_update_guard" ON public.program_budgets;
CREATE POLICY "phase0_program_budgets_update_guard"
  ON public.program_budgets
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.phase0_current_account_is_paraya()))
  WITH CHECK ((SELECT public.phase0_current_account_is_paraya()));

DROP POLICY IF EXISTS "phase0_program_budgets_delete_guard" ON public.program_budgets;
CREATE POLICY "phase0_program_budgets_delete_guard"
  ON public.program_budgets
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE DELETE, TRUNCATE ON public.program_budgets FROM authenticated;

-- Existing broad policies remain for read compatibility, so these restrictive
-- policies form the effective Phase 0 boundary. Admin and former institutional
-- identities satisfy none of these predicates and therefore have no direct
-- access. PARAYA reads are allowed, while all PARAYA mutations use trusted
-- service APIs that bypass authenticated RLS only after application checks.
DROP POLICY IF EXISTS "phase0_program_signups_select_guard" ON public.program_signups;
CREATE POLICY "phase0_program_signups_select_guard"
  ON public.program_signups
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.phase0_current_account_is_paraya())
    OR (
      (SELECT public.phase0_current_account_is_active_volunteer())
      AND volunteer_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "phase0_program_signups_insert_guard" ON public.program_signups;
CREATE POLICY "phase0_program_signups_insert_guard"
  ON public.program_signups
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.phase0_current_account_is_active_volunteer())
    AND volunteer_id = (SELECT auth.uid())
    AND status = 'pending'
    AND approval_status = 'approved'
    AND added_by IS NULL
    AND confirmed_at IS NULL
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND approval_notes IS NULL
  );

DROP POLICY IF EXISTS "phase0_program_signups_update_guard" ON public.program_signups;
CREATE POLICY "phase0_program_signups_update_guard"
  ON public.program_signups
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.phase0_current_account_is_active_volunteer())
    AND volunteer_id = (SELECT auth.uid())
    AND status IN ('pending', 'confirmed')
  )
  WITH CHECK (
    (SELECT public.phase0_current_account_is_active_volunteer())
    AND volunteer_id = (SELECT auth.uid())
    AND status = 'withdrawn'
  );

DROP POLICY IF EXISTS "phase0_program_signups_delete_guard" ON public.program_signups;
CREATE POLICY "phase0_program_signups_delete_guard"
  ON public.program_signups
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE DELETE, TRUNCATE ON public.program_signups FROM authenticated;

-- Community-validation evidence is written only through dedicated APIs after
-- human authorization. Deny direct authenticated mutations so former partner
-- identities cannot alter or delete evidence and so the derived proposal flag
-- is recomputed only inside the trusted service transaction.
DO $validation_write_guards$
DECLARE
  evidence_table text;
BEGIN
  FOREACH evidence_table IN ARRAY ARRAY[
    'proposal_validations',
    'proposal_validation_stakeholders',
    'proposal_validation_evidence',
    'proposal_validation_links'
  ]
  LOOP
    IF to_regclass(format('public.%I', evidence_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', evidence_table);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'phase0_trusted_write_only_insert',
      evidence_table
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'phase0_trusted_write_only_update',
      evidence_table
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'phase0_trusted_write_only_delete',
      evidence_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)',
      'phase0_trusted_write_only_insert',
      evidence_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false)',
      'phase0_trusted_write_only_update',
      evidence_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (false)',
      'phase0_trusted_write_only_delete',
      evidence_table
    );
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated',
      evidence_table
    );
  END LOOP;
END;
$validation_write_guards$;

-- The legacy household table contains identifiable names, locations, notes,
-- and extended profiling data. Until sitio assignments and resident-level
-- consent/versioning exist, only the Researcher may mutate it; Secretary and
-- Captain (plus the legacy barangay alias) may read rows in their barangay.
-- Director, Associate, Admin, and Mother Leader use no direct detail access.
DO $household_profile_guards$
BEGIN
  IF to_regclass('public.household_profiles') IS NOT NULL THEN
    ALTER TABLE public.household_profiles ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "phase0_household_profiles_select_guard" ON public.household_profiles;
    CREATE POLICY "phase0_household_profiles_select_guard"
      ON public.household_profiles
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
            FROM public.users AS account
           WHERE account.id = (SELECT auth.uid())
             AND account.status = 'active'
             AND account.is_active IS TRUE
             AND (
               account.role = 'paraya_researcher'
               OR (
                 account.role IN (
                   'barangay_captain',
                   'barangay_secretary',
                   'barangay_official'
                 )
                 AND account.barangay_id = household_profiles.barangay_id
               )
             )
        )
      );

    DROP POLICY IF EXISTS "phase0_household_profiles_insert_guard" ON public.household_profiles;
    CREATE POLICY "phase0_household_profiles_insert_guard"
      ON public.household_profiles
      AS RESTRICTIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users AS account
           WHERE account.id = (SELECT auth.uid())
             AND account.status = 'active'
             AND account.is_active IS TRUE
             AND account.role = 'paraya_researcher'
        )
      );

    DROP POLICY IF EXISTS "phase0_household_profiles_update_guard" ON public.household_profiles;
    CREATE POLICY "phase0_household_profiles_update_guard"
      ON public.household_profiles
      AS RESTRICTIVE
      FOR UPDATE
      TO authenticated
      USING ((SELECT public.phase0_current_account_is_paraya()) AND EXISTS (
        SELECT 1 FROM public.users AS account
         WHERE account.id = (SELECT auth.uid())
           AND account.role = 'paraya_researcher'
      ))
      WITH CHECK ((SELECT public.phase0_current_account_is_paraya()) AND EXISTS (
        SELECT 1 FROM public.users AS account
         WHERE account.id = (SELECT auth.uid())
           AND account.role = 'paraya_researcher'
      ));

    DROP POLICY IF EXISTS "phase0_household_profiles_delete_guard" ON public.household_profiles;
    CREATE POLICY "phase0_household_profiles_delete_guard"
      ON public.household_profiles
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (false);
  END IF;
END;
$household_profile_guards$;

-- Storage has its own RLS boundary outside public.*. Add the same active-account
-- condition to authenticated object operations without granting access by
-- itself; each bucket still needs a purpose-specific permissive policy.
DO $storage_active_guard$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "phase0_active_account_guard" ON storage.objects;
    CREATE POLICY "phase0_active_account_guard"
      ON storage.objects
      AS RESTRICTIVE
      FOR ALL
      TO authenticated
      USING ((SELECT public.phase0_current_account_is_active()))
      WITH CHECK ((SELECT public.phase0_current_account_is_active()));
  END IF;
END;
$storage_active_guard$;

-- The previous migration installs this guard on tables that were already
-- RLS-enabled. Reinstall it explicitly after the workflow tables are enabled
-- so deployment order or live-schema drift cannot leave these tables outside
-- the active-account invariant.
DO $active_guard$
DECLARE
  guarded_table text;
BEGIN
  FOREACH guarded_table IN ARRAY ARRAY[
    'project_proposals',
    'proposal_sdg_alignment',
    'proposal_reviews',
    'proposal_validations',
    'proposal_validation_stakeholders',
    'proposal_validation_evidence',
    'proposal_validation_links',
    'household_profiles',
    'programs',
    'program_activities',
    'program_budgets',
    'program_signups'
  ]
  LOOP
    IF to_regclass(format('public.%I', guarded_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'phase0_active_account_guard',
      guarded_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.phase0_current_account_is_active())) WITH CHECK ((SELECT public.phase0_current_account_is_active()))',
      'phase0_active_account_guard',
      guarded_table
    );
  END LOOP;
END;
$active_guard$;

COMMIT;
