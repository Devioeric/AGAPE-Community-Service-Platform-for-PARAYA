-- Mixed-Method Tagging on Surveys
-- The framework calls out that PARAYA uses quantitative, qualitative, AND
-- mixed-method approaches per project (interviews, FGDs, Likert scales).
-- Without an explicit tag the Researcher can't filter analytics by methodology
-- or apply the right analytical lens (descriptive stats vs thematic coding).
--
-- Defaults to 'quantitative' for backward compat — existing surveys are
-- predominantly closed-question Likert / multiple-choice instruments.
-- Safe to re-run.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS methodology TEXT NOT NULL DEFAULT 'quantitative';

-- Idempotent CHECK addition (drop-and-readd pattern from role_expansion.sql)
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
   WHERE conrelid = 'public.surveys'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%methodology%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.surveys DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_methodology_check
  CHECK (methodology IN ('quantitative', 'qualitative', 'mixed'));
