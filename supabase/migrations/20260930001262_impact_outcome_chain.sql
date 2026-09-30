-- Impact outcome chain.
-- 1. An optional community-profile figure a program aims to lower. The key
--    list lives in src/lib/community-profile/targets.ts and is validated by
--    the program API; SQL only checks the key format.
-- 2. Corrections for recorded SDG contributions: void with a reason, the same
--    way impact indicators, stories, and follow-ups are corrected.
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS target_profile_figure text
    CHECK (target_profile_figure IS NULL OR target_profile_figure ~ '^[a-z_]{2,60}$');
COMMENT ON COLUMN public.programs.target_profile_figure IS
  'Optional key from src/lib/community-profile/targets.ts: the community profile figure this program aims to lower.';

ALTER TABLE public.program_sdg_outcomes
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.program_sdg_outcomes
  ADD CONSTRAINT program_sdg_outcomes_void_check CHECK (
    (voided_at IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND void_reason IS NOT NULL AND length(btrim(void_reason)) BETWEEN 3 AND 1000)
  );
CREATE INDEX IF NOT EXISTS program_sdg_outcomes_active_program_idx
  ON public.program_sdg_outcomes(program_id) WHERE voided_at IS NULL;
