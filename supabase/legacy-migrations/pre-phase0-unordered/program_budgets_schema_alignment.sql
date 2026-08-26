-- program_budgets schema alignment.
--
-- Real schema we found in production:
--   id, program_id, allocated_amount, spent_amount, remaining_amount,
--   updated_at, approval_status, approved_by, approved_at, approval_notes,
--   created_by
-- Plus two EMPTY duplicate columns (`allocated`, `spent`) that the previous
-- migration's "ADD COLUMN IF NOT EXISTS" safety net accidentally created
-- because the rename block was guarding for `planned_amount` / `actual_amount`
-- (the wrong legacy names — the real ones were `*_amount`).
--
-- Notable gaps:
--   * No `category` column — the form's `category` field never had a home.
--   * No `notes` / `description` column — same story.
--
-- This migration:
--   1. Drops the empty duplicate `allocated` and `spent` columns (if both they
--      and `*_amount` exist).
--   2. Renames `allocated_amount` → `allocated`, `spent_amount` → `spent`
--      so the DB matches the application's vocabulary.
--   3. Adds the missing `category` and `notes` columns the forms have been
--      trying to write to.
--
-- Safe to re-run.

-- ── 1+2: dedupe + rename allocated ────────────────────────────────────────
DO $$
DECLARE
  has_amount BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='program_budgets'
       AND column_name='allocated_amount'
  );
  has_canonical BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='program_budgets'
       AND column_name='allocated'
  );
BEGIN
  IF has_amount AND has_canonical THEN
    -- Duplicate columns exist. Drop the empty one we accidentally created,
    -- then rename the real one to claim the canonical name.
    EXECUTE 'ALTER TABLE public.program_budgets DROP COLUMN allocated';
    EXECUTE 'ALTER TABLE public.program_budgets RENAME COLUMN allocated_amount TO allocated';
  ELSIF has_amount AND NOT has_canonical THEN
    EXECUTE 'ALTER TABLE public.program_budgets RENAME COLUMN allocated_amount TO allocated';
  END IF;
END $$;

-- ── 1+2: dedupe + rename spent ────────────────────────────────────────────
DO $$
DECLARE
  has_amount BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='program_budgets'
       AND column_name='spent_amount'
  );
  has_canonical BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='program_budgets'
       AND column_name='spent'
  );
BEGIN
  IF has_amount AND has_canonical THEN
    EXECUTE 'ALTER TABLE public.program_budgets DROP COLUMN spent';
    EXECUTE 'ALTER TABLE public.program_budgets RENAME COLUMN spent_amount TO spent';
  ELSIF has_amount AND NOT has_canonical THEN
    EXECUTE 'ALTER TABLE public.program_budgets RENAME COLUMN spent_amount TO spent';
  END IF;
END $$;

-- ── 3: add the missing app-side columns ───────────────────────────────────
-- Nullable so existing rows don't violate NOT NULL. The form-side validation
-- already requires `category` for new rows; pre-existing rows will show with
-- no category until backfilled.
ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_pb_category ON public.program_budgets(category);
