-- Pre/Post Survey Linking
-- The framework's Phase VIII assessment compares the community's situation
-- BEFORE and AFTER an intervention. To do this in AGAPE we let a follow-up
-- survey reference its baseline through `parent_survey_id`. The compare page
-- then aligns questions whose text matches between the two surveys and
-- visualizes the shift in distributions.
-- Safe to re-run.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS parent_survey_id UUID REFERENCES public.surveys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surveys_parent ON public.surveys(parent_survey_id);
