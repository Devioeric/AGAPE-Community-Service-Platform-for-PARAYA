-- Survey Response Scrubbing (data cleaning)
-- Adds the columns that let a Researcher flag a survey_response as an outlier
-- or inconsistent entry with a documented reason. Flagged rows are excluded
-- from analytics aggregates by default but are never deleted — the framework
-- requires that exclusion decisions remain auditable.
-- Safe to re-run.

ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS excluded         BOOLEAN     NOT NULL DEFAULT FALSE;

ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS exclusion_reason TEXT;

ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS excluded_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS excluded_at      TIMESTAMPTZ;

-- Partial index for the analytics "show excluded" view, which is the only
-- query path that needs to find flagged rows quickly.
CREATE INDEX IF NOT EXISTS idx_survey_responses_excluded
  ON public.survey_responses(survey_id)
  WHERE excluded = TRUE;
