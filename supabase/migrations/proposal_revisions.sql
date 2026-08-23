-- Proposal Revisions Loop
-- Adds 'revisions_requested' as a valid status on project_proposals so reviewers
-- can send a proposal back to the proponent with revision notes instead of an
-- outright rejection. The proponent can then resubmit, which moves the row back
-- to 'submitted'. The audit trail of who-asked-for-what is captured in the
-- existing proposal_reviews table (decision = 'revisions_requested').
-- Safe to re-run.

-- Drop the existing status CHECK constraint (idempotent — pattern matches role_expansion.sql).
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
   WHERE conrelid = 'public.project_proposals'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.project_proposals DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

-- Re-add the CHECK with the new status included.
ALTER TABLE public.project_proposals
  ADD CONSTRAINT project_proposals_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'pre_screening',
    'sdg_review',
    'finance_review',
    'approved',
    'rejected',
    'revisions_requested'
  ));

-- Track how many revision rounds a proposal has been through, for reporting.
ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS revision_count INT NOT NULL DEFAULT 0;

-- Cache which stage the revision was requested from, so resubmit returns to the
-- correct point in the pipeline (default 'submitted' if null).
ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS revision_requested_from TEXT;
