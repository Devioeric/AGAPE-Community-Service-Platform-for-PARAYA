-- Realign the `program_activities.status` CHECK constraint with the values
-- the application UI actually uses.
--
-- The activity form (officer + partner sides) sends:
--   planned | ongoing | completed | cancelled
-- But the original initial-schema CHECK constraint accepts a different set
-- (e.g. scheduled | in_progress | completed | cancelled), causing inserts to
-- fail with:
--   "new row for relation \"program_activities\" violates check constraint
--    \"program_activities_status_check\""
--
-- This migration:
--   1. Normalizes any legacy values to the new vocabulary
--   2. Drops the old constraint (if present, by name)
--   3. Re-adds the constraint with the application's vocabulary
--   4. Backfills NULLs to 'planned' so the NOT NULL default applies
--
-- Safe to re-run.

-- ── 1. Normalize legacy values ─────────────────────────────────────────────
-- Map old vocabulary onto the new one. Add cases here if your DB has any
-- other legacy values surfaced by running:
--   SELECT DISTINCT status FROM public.program_activities;
UPDATE public.program_activities
   SET status = CASE status
                  WHEN 'scheduled'   THEN 'planned'
                  WHEN 'upcoming'    THEN 'planned'
                  WHEN 'in_progress' THEN 'ongoing'
                  WHEN 'active'      THEN 'ongoing'
                  WHEN 'done'        THEN 'completed'
                  ELSE status
                END
 WHERE status IN ('scheduled', 'upcoming', 'in_progress', 'active', 'done');

-- ── 2. Backfill NULL / unknown values so the new constraint doesn't reject
-- pre-existing rows.
UPDATE public.program_activities
   SET status = 'planned'
 WHERE status IS NULL
    OR status NOT IN ('planned', 'ongoing', 'completed', 'cancelled');

-- ── 3. Drop the legacy constraint (idempotent) ────────────────────────────
ALTER TABLE public.program_activities
  DROP CONSTRAINT IF EXISTS program_activities_status_check;

-- ── 4. Re-add with the application's vocabulary ───────────────────────────
ALTER TABLE public.program_activities
  ADD CONSTRAINT program_activities_status_check
  CHECK (status IN ('planned', 'ongoing', 'completed', 'cancelled'));

-- ── 5. Ensure a sensible default for new rows that omit status ────────────
ALTER TABLE public.program_activities
  ALTER COLUMN status SET DEFAULT 'planned';
