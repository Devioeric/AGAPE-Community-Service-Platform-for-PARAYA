-- Surveys RLS Expansion.
--
-- The surveys, survey_questions, survey_responses, and survey_answers tables
-- were created in an initial migration with RLS policies allowing only
-- 'paraya_officer' + 'admin'. After the R-1 role expansion, the new PARAYA
-- staff roles (paraya_director / paraya_associate / paraya_researcher) get
-- blocked. Publishing a new survey hits:
--   "new row violates row-level security policy for table \"surveys\""
--
-- Access model:
--   * PARAYA staff (director / associate / researcher / paraya_officer) + admin
--       — full read/write on all four tables.
--   * Any authenticated user
--       — read published surveys + their questions (so volunteers / barangay
--         users can answer them).
--       — submit their own response + answers.
--       — read their own responses + answers.
--
-- Safe to re-run.


-- ═════════════════════════════════════════════════════════════════════════════
-- surveys
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "surveys_officer_all"     ON public.surveys;
DROP POLICY IF EXISTS "surveys_read_published"  ON public.surveys;
DROP POLICY IF EXISTS "officers can manage surveys" ON public.surveys;
DROP POLICY IF EXISTS "Surveys select"          ON public.surveys;
DROP POLICY IF EXISTS "Surveys insert"          ON public.surveys;
DROP POLICY IF EXISTS "Surveys update"          ON public.surveys;
DROP POLICY IF EXISTS "Surveys delete"          ON public.surveys;

CREATE POLICY "surveys_officer_all" ON public.surveys
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

-- Non-staff readers see only published surveys.
CREATE POLICY "surveys_read_published" ON public.surveys
  FOR SELECT
  USING (
    status = 'published'
    AND auth.uid() IS NOT NULL
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- survey_questions
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sq_officer_all"     ON public.survey_questions;
DROP POLICY IF EXISTS "sq_read_published"  ON public.survey_questions;
DROP POLICY IF EXISTS "officers can manage survey_questions" ON public.survey_questions;

CREATE POLICY "sq_officer_all" ON public.survey_questions
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

-- Anyone authenticated can read questions belonging to a published survey.
CREATE POLICY "sq_read_published" ON public.survey_questions
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_questions.survey_id
        AND s.status = 'published'
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- survey_responses
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sr_officer_all"         ON public.survey_responses;
DROP POLICY IF EXISTS "sr_own_select"          ON public.survey_responses;
DROP POLICY IF EXISTS "sr_own_insert"          ON public.survey_responses;
DROP POLICY IF EXISTS "sr_own_update"          ON public.survey_responses;
DROP POLICY IF EXISTS "officers can manage survey_responses" ON public.survey_responses;

CREATE POLICY "sr_officer_all" ON public.survey_responses
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

-- Anyone authenticated can submit a response to a published survey.
CREATE POLICY "sr_own_insert" ON public.survey_responses
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_responses.survey_id
        AND s.status = 'published'
    )
  );

-- Volunteers/barangay users can read responses they themselves submitted.
CREATE POLICY "sr_own_select" ON public.survey_responses
  FOR SELECT
  USING (respondent_id = auth.uid());

-- And update their own (e.g. resume editing if survey is editable).
CREATE POLICY "sr_own_update" ON public.survey_responses
  FOR UPDATE
  USING (respondent_id = auth.uid());


-- ═════════════════════════════════════════════════════════════════════════════
-- survey_answers
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.survey_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_officer_all"   ON public.survey_answers;
DROP POLICY IF EXISTS "sa_own_select"    ON public.survey_answers;
DROP POLICY IF EXISTS "sa_own_insert"    ON public.survey_answers;
DROP POLICY IF EXISTS "officers can manage survey_answers" ON public.survey_answers;

CREATE POLICY "sa_officer_all" ON public.survey_answers
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

-- Allow inserts into answers as long as the response they belong to was
-- created by the caller.
CREATE POLICY "sa_own_insert" ON public.survey_answers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.id = survey_answers.response_id
        AND r.respondent_id = auth.uid()
    )
  );

-- And let respondents read their own answers.
CREATE POLICY "sa_own_select" ON public.survey_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.survey_responses r
      WHERE r.id = survey_answers.response_id
        AND r.respondent_id = auth.uid()
    )
  );
