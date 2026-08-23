-- Lessons-Learned Link Between Cycles
-- The PARAYA framework treats past reports as institutional memory — "teams
-- often review previous reports to understand what strategies were effective,
-- what challenges were encountered, and what recommendations were made."
--
-- This column lets a new proposal explicitly cite the prior proposals it
-- builds on, making the feedback loop (Phase VIII → Phase I) visible in the
-- system. UI shows a multi-select picker on the form and a "Builds on"
-- section in the detail sheet.
-- Safe to re-run.

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS informed_by_proposals UUID[] NOT NULL DEFAULT '{}';

-- GIN index makes "which proposals cite proposal X?" cheap.
CREATE INDEX IF NOT EXISTS idx_proposals_informed_by_gin
  ON public.project_proposals
  USING GIN (informed_by_proposals);
