-- Drop the unique constraint on program_budgets.program_id.
--
-- The original schema modeled `program_budgets` as one summary row per
-- program (allocated_amount, spent_amount, remaining_amount). The
-- application treats it as line items — many rows per program, one per
-- category (Supplies, Transportation, Honoraria, …). Hitting "Add Budget
-- Item" a second time on the same program raises:
--   "duplicate key value violates unique constraint
--    program_budgets_program_id_key"
--
-- This migration drops that constraint so multiple budget lines per program
-- are allowed.
--
-- Safe to re-run.

ALTER TABLE public.program_budgets
  DROP CONSTRAINT IF EXISTS program_budgets_program_id_key;

-- Replace it with a non-unique index on program_id so SELECT WHERE
-- program_id = ? stays fast.
CREATE INDEX IF NOT EXISTS idx_pb_program_id
  ON public.program_budgets(program_id);
