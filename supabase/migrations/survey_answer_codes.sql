-- Qualitative Coding for Survey Answers
-- Lets Researchers tag (or "code") free-text survey_answers with themes during
-- thematic analysis (Phase V of the PARAYA Action Research Cycle). The
-- framework expects multiple coders for inter-rater reliability, so a single
-- answer can carry many codes from many people — UNIQUE(answer_id, coder_id,
-- label) prevents duplicate-by-same-coder but allows the same label from
-- different coders, which is what reveals agreement.
--
-- Labels are free-form text. We surface "existing labels on this survey" in
-- the UI to encourage consistency without forcing a fixed taxonomy.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.survey_answer_codes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id   UUID        NOT NULL REFERENCES public.survey_answers(id) ON DELETE CASCADE,
  -- Cached so we can group/filter by survey without joining through
  -- survey_answers → survey_responses every time.
  survey_id   UUID        NOT NULL REFERENCES public.surveys(id)        ON DELETE CASCADE,
  label       TEXT        NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  coder_id    UUID        NOT NULL REFERENCES public.users(id)          ON DELETE CASCADE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The same coder cannot stamp the same label on the same answer twice;
-- different coders applying the same label IS allowed (that's what generates
-- the inter-rater agreement signal).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'survey_answer_codes_unique_per_coder'
  ) THEN
    ALTER TABLE public.survey_answer_codes
      ADD CONSTRAINT survey_answer_codes_unique_per_coder
      UNIQUE (answer_id, coder_id, label);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sac_survey   ON public.survey_answer_codes(survey_id);
CREATE INDEX IF NOT EXISTS idx_sac_answer   ON public.survey_answer_codes(answer_id);
CREATE INDEX IF NOT EXISTS idx_sac_label    ON public.survey_answer_codes(survey_id, label);

ALTER TABLE public.survey_answer_codes ENABLE ROW LEVEL SECURITY;

-- Only PARAYA staff and admins can read/write codes. Survey respondents never
-- see how their answers are tagged.
DROP POLICY IF EXISTS "sac_staff_all" ON public.survey_answer_codes;
CREATE POLICY "sac_staff_all" ON public.survey_answer_codes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer', 'admin'
        )
    )
  );
