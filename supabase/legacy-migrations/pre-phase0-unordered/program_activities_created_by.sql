-- Add `created_by` to program_activities.
--
-- `program_item_approvals.sql` added `created_by` to program_budgets and
-- `added_by` to program_signups, but program_activities was missed. The
-- POST handler at src/app/api/programs/[id]/activities/route.ts inserts
-- `created_by` on every new activity, and the validation queue
-- (/api/validations) joins through this column to show who submitted the
-- pending item. Without the column the insert fails with:
--   "Could not find the 'created_by' column of 'program_activities' in the schema cache"
--
-- Safe to re-run.

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pa_created_by
  ON public.program_activities(created_by);
