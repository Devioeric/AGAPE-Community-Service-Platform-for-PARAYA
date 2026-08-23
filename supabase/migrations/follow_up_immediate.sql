-- Staged Impact Assessment — Phase VIII
-- The framework specifies assessment in stages: an *immediate* review shortly
-- after the activity (≤1 week), plus 6-month and 12-month follow-ups for
-- sustained outcomes. The existing follow_up_records table only had two
-- types (6_month, 12_month); this migration extends the allowed values.
--
-- Idempotent: drops any existing CHECK on follow_up_type before re-adding the
-- expanded constraint, mirroring role_expansion.sql's pattern.
-- Safe to re-run.

-- Note: the actual column in this DB is `followup_type` (no underscore between
-- "follow" and "up"). Older drafts of the impact UI used `follow_up_type`,
-- which simply got silently dropped on insert. This migration enforces the
-- expanded value set on the real column.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
   WHERE conrelid = 'public.follow_up_records'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%followup_type%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.follow_up_records DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.follow_up_records
  ADD CONSTRAINT follow_up_records_type_check
  CHECK (followup_type IN ('immediate', '6_month', '12_month'));
