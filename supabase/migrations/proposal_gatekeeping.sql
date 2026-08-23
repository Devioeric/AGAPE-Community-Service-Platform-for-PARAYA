-- Proposal Approval Gatekeeping
-- Adds columns to project_proposals for: income-generation flag, finance
-- clearance, and pre-screening results. Safe to re-run.

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS is_income_generating BOOLEAN     NOT NULL DEFAULT FALSE;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS finance_clearance    BOOLEAN     NOT NULL DEFAULT FALSE;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS finance_cleared_at   TIMESTAMPTZ;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS finance_cleared_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS finance_notes        TEXT;

-- Pre-screening result is cached so reviewers can see why a proposal was held
-- up without re-running the check.
ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS prescreening_passed  BOOLEAN;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS prescreening_checks  JSONB;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS prescreening_ran_at  TIMESTAMPTZ;
