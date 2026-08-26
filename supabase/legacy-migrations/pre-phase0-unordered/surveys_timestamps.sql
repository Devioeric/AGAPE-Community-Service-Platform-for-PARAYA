-- Add created_at and updated_at to surveys.
--
-- The Survey Builder PATCH/PUT handlers stamp `updated_at` on every save,
-- and several list/analytics queries order by `created_at`. Neither column
-- exists on the original surveys schema, so saving/publishing fails with:
--   "Could not find the 'updated_at' column of 'surveys' in the schema cache"
--
-- This migration adds both columns. Pre-existing rows are backfilled to
-- NOW() — the truest creation time is lost, but it's the safest fallback.
--
-- Safe to re-run.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_surveys_created_at
  ON public.surveys(created_at DESC);
