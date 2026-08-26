-- Survey Builder v2 — adds sections, conditional questions, and settings fields
-- Run this in the Supabase SQL Editor

-- New columns on surveys
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS opens_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_anonymous     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_editable      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submission_type  TEXT    NOT NULL DEFAULT 'once';

-- New columns on survey_questions
ALTER TABLE survey_questions
  ADD COLUMN IF NOT EXISTS section_title TEXT,
  ADD COLUMN IF NOT EXISTS conditions    JSONB;

-- Rename order_num → order_index if the column is still called order_num
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'survey_questions' AND column_name = 'order_num'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'survey_questions' AND column_name = 'order_index'
  ) THEN
    ALTER TABLE survey_questions RENAME COLUMN order_num TO order_index;
  END IF;
END $$;
