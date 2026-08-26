-- Add report columns to program_activities.
--
-- Each activity has two reports per the PARAYA process (R-5 labeling):
--   * report_1 — Activity Report   (narrative of what happened)
--   * report_2 — Financial Report  (formerly "Liquidation Report")
--
-- The UI at /officer/programs lets staff fill these in via "Activity Report"
-- and "Financial Report" buttons under each activity. The PATCH route
-- (/api/programs/[id]/activities/[actId]) writes whichever field was edited.
-- The DB columns were never added in any prior migration, so save fails with:
--   "Could not find the 'report_1' column of 'program_activities'
--    in the schema cache"
--
-- Both columns are nullable — an activity is reportable but not required to
-- have either report until the work is done.
--
-- Safe to re-run.

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS report_1 TEXT;

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS report_2 TEXT;
