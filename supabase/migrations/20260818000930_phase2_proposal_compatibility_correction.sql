-- Forward-only correction required by the existing V1/V2 proposal functions.
-- The functions already reference expected_beneficiary_count, but the canonical
-- foundational table did not contain the column. The approved scope also uses
-- the complete SDG 1-17 catalog rather than the former four-goal subset.
BEGIN;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS expected_beneficiary_count integer;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_proposals'::regclass
      AND conname = 'project_proposals_expected_beneficiary_count_check'
  ) THEN
    ALTER TABLE public.project_proposals
      ADD CONSTRAINT project_proposals_expected_beneficiary_count_check
      CHECK (expected_beneficiary_count IS NULL OR expected_beneficiary_count >= 0);
  END IF;
END;
$constraints$;

ALTER TABLE public.proposal_sdg_alignment
  DROP CONSTRAINT IF EXISTS proposal_sdg_alignment_sdg_number_check;
ALTER TABLE public.proposal_sdg_alignment
  ADD CONSTRAINT proposal_sdg_alignment_sdg_number_check
  CHECK (sdg_number BETWEEN 1 AND 17);

ALTER TABLE public.proposal_sdg_alignments
  DROP CONSTRAINT IF EXISTS proposal_sdg_alignments_sdg_goal_check;
ALTER TABLE public.proposal_sdg_alignments
  ADD CONSTRAINT proposal_sdg_alignments_sdg_goal_check
  CHECK (sdg_goal BETWEEN 1 AND 17);

COMMIT;
