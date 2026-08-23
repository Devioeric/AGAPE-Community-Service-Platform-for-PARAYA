-- Realign survey_questions.question_type CHECK constraint with the values
-- the application actually uses.
--
-- The Survey Builder UI (officer/surveys page) emits four question types:
--   * text             — open-ended free-text answer
--   * multiple_choice  — pick one option (radio)
--   * checkbox         — pick many options
--   * rating           — numeric scale
-- The original schema's CHECK constraint accepts a different vocabulary
-- (likely 'short_text' / 'single_choice' / 'multi_choice' / 'scale' or
-- similar) and rejects the new ones with:
--   "new row for relation \"survey_questions\" violates check constraint
--    \"survey_questions_question_type_check\""
--
-- This migration normalizes any legacy values onto the new vocabulary,
-- drops the old constraint, and re-adds it with the application's set.
--
-- Safe to re-run.

-- ── 1. Normalize legacy values onto the canonical vocabulary ─────────────
UPDATE public.survey_questions
   SET question_type = CASE question_type
                         WHEN 'short_text'    THEN 'text'
                         WHEN 'long_text'     THEN 'text'
                         WHEN 'textarea'      THEN 'text'
                         WHEN 'open_ended'    THEN 'text'
                         WHEN 'single_choice' THEN 'multiple_choice'
                         WHEN 'radio'         THEN 'multiple_choice'
                         WHEN 'select'        THEN 'multiple_choice'
                         WHEN 'multi_choice'  THEN 'checkbox'
                         WHEN 'multi_select'  THEN 'checkbox'
                         WHEN 'multiselect'   THEN 'checkbox'
                         WHEN 'scale'         THEN 'rating'
                         WHEN 'likert'        THEN 'rating'
                         WHEN 'stars'         THEN 'rating'
                         ELSE question_type
                       END
 WHERE question_type IN (
   'short_text', 'long_text', 'textarea', 'open_ended',
   'single_choice', 'radio', 'select',
   'multi_choice', 'multi_select', 'multiselect',
   'scale', 'likert', 'stars'
 );

-- ── 2. Backfill any unknown / NULL values defensively ─────────────────────
UPDATE public.survey_questions
   SET question_type = 'text'
 WHERE question_type IS NULL
    OR question_type NOT IN ('text', 'multiple_choice', 'checkbox', 'rating');

-- ── 3. Drop legacy constraint ─────────────────────────────────────────────
ALTER TABLE public.survey_questions
  DROP CONSTRAINT IF EXISTS survey_questions_question_type_check;

-- ── 4. Re-add with the application's vocabulary ───────────────────────────
ALTER TABLE public.survey_questions
  ADD CONSTRAINT survey_questions_question_type_check
  CHECK (question_type IN ('text', 'multiple_choice', 'checkbox', 'rating'));
