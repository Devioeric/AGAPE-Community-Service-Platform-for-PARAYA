-- Rename program_budgets columns to match the application code.
--
-- The original schema named the budget amount columns `planned_amount` and
-- `actual_amount`, but every form, API insert/update, type declaration, and
-- UI display in the application uses `allocated` and `spent`. The mismatch
-- caused writes to fail with:
--   "Could not find the 'allocated' column of 'program_budgets'
--    in the schema cache"
--
-- This migration renames the DB columns so the application's preferred names
-- become canonical. The analytics route is updated in code to read the new
-- names. Safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'program_budgets'
       AND column_name  = 'planned_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'program_budgets'
       AND column_name  = 'allocated'
  ) THEN
    ALTER TABLE public.program_budgets RENAME COLUMN planned_amount TO allocated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'program_budgets'
       AND column_name  = 'actual_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'program_budgets'
       AND column_name  = 'spent'
  ) THEN
    ALTER TABLE public.program_budgets RENAME COLUMN actual_amount TO spent;
  END IF;
END $$;

-- Defensive: ensure the columns exist (in case neither the old nor new name
-- was present for some reason).
ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS allocated NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS spent     NUMERIC NOT NULL DEFAULT 0;
