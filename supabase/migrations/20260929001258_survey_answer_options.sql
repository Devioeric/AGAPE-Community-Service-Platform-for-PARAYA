-- Make survey submission work again (forward-only).
--
-- 1. phase1_submit_survey_response (20260817000300) stores selected choices in
--    survey_answers.answer_options, and the survey analysis and pre/post
--    comparison routes read that column, but no migration ever created it.
--    Every submission failed ("column answer_options does not exist") and
--    both analysis routes returned 503. Existing answers keep their choices
--    in answer_text, which src/lib/surveys/analysis.ts already reads as a
--    fallback, so no backfill is needed. Table-level grants and RLS policies
--    cover the new column.
-- 2. The same function's required-answer check compares a.response_id with a
--    PL/pgSQL variable also named response_id, which PostgreSQL rejects as
--    ambiguous. The variable is renamed; the survey_answers column is not.
BEGIN;

ALTER TABLE public.survey_answers ADD COLUMN IF NOT EXISTS answer_options text[];

DO $survey_submit_variable$
DECLARE
  definition text;
  patched text;
  fragment record;
BEGIN
  SELECT pg_get_functiondef('public.phase1_submit_survey_response(uuid,jsonb)'::regprocedure) INTO definition;
  IF position('new_response_id' IN definition) > 0 THEN RETURN; END IF;
  patched := definition;
  FOR fragment IN SELECT * FROM (VALUES
    ('response_id uuid;', 'new_response_id uuid;'),
    ('RETURNING id INTO response_id;', 'RETURNING id INTO new_response_id;'),
    ('VALUES(response_id,question.id,', 'VALUES(new_response_id,question.id,'),
    ('a.response_id=response_id', 'a.response_id=new_response_id'),
    ('RETURN response_id;', 'RETURN new_response_id;')
  ) AS pairs(old_text, new_text) LOOP
    IF position(fragment.old_text IN patched) = 0 THEN
      RAISE EXCEPTION 'Survey submission patch could not find: %', fragment.old_text;
    END IF;
    patched := replace(patched, fragment.old_text, fragment.new_text);
  END LOOP;
  EXECUTE patched;
END;
$survey_submit_variable$;

COMMIT;
