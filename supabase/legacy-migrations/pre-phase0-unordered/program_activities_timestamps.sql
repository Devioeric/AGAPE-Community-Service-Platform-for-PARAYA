-- Add created_at and updated_at to program_activities.
--
-- The PATCH handler at /api/programs/[id]/activities/[actId] stamps
-- `updated_at: new Date().toISOString()` on every update, and the
-- validations queue at /api/validations selects + orders by `created_at`.
-- Neither column exists on the production table, so:
--   * PATCH (Edit activity, save Activity/Financial report) fails with:
--       "Could not find the 'updated_at' column of 'program_activities'
--        in the schema cache"
--   * Validations queue silently drops pending activity submissions.
--
-- This migration adds both columns. Existing rows are backfilled to NOW(),
-- which is the safest available value (we don't know the true creation time
-- for already-existing activities).
--
-- Safe to re-run.

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Index on created_at — validations queue orders by it.
CREATE INDEX IF NOT EXISTS idx_pa_created_at
  ON public.program_activities(created_at DESC);
