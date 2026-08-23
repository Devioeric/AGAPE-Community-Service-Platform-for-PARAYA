-- Link a survey to a program.
--
-- The Survey Builder gets a new "Program Linkage" setting so officers can
-- attach a survey to a specific program (e.g. a baseline survey for "Mobile
-- Library for Brgy. Biñang 2nd"). The link is informational + used by the
-- program detail page to surface attached surveys and by analytics to scope
-- responses to a program's beneficiaries.
--
-- Nullable: standalone / community-wide surveys keep program_id = NULL.
-- ON DELETE SET NULL so deleting a program doesn't cascade and lose the
-- survey data (the survey just becomes unlinked).
--
-- Safe to re-run.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS program_id UUID
    REFERENCES public.programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surveys_program_id
  ON public.surveys(program_id);
