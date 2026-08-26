-- Phase 1 AI-report compatibility and lifecycle columns.
-- Additive/forward-only: preserve legacy report_type/content rows and actor IDs.
BEGIN;

ALTER TABLE public.ai_reports
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS narrative text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid REFERENCES public.analytics_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.ai_reports
SET title=coalesce(title,initcap(replace(coalesce(report_type,'legacy'),'_',' '))||' AI Report'),
    period_start=coalesce(period_start,generated_at::date),
    period_end=coalesce(period_end,generated_at::date),
    narrative=coalesce(narrative,content),
    status=coalesce(status,'draft'),
    created_at=coalesce(created_at,generated_at),
    updated_at=coalesce(updated_at,generated_at)
WHERE title IS NULL OR period_start IS NULL OR period_end IS NULL OR narrative IS NULL
   OR status IS NULL OR created_at IS NULL OR updated_at IS NULL;

ALTER TABLE public.ai_reports
  ALTER COLUMN report_type DROP NOT NULL,
  ALTER COLUMN content DROP NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN period_start SET NOT NULL,
  ALTER COLUMN period_end SET NOT NULL,
  ALTER COLUMN narrative SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.ai_reports DROP CONSTRAINT IF EXISTS ai_reports_status_check;
ALTER TABLE public.ai_reports ADD CONSTRAINT ai_reports_status_check
  CHECK(status IN('draft','reviewed','approved'));
ALTER TABLE public.ai_reports DROP CONSTRAINT IF EXISTS ai_reports_period_check;
ALTER TABLE public.ai_reports ADD CONSTRAINT ai_reports_period_check CHECK(period_end>=period_start);

CREATE INDEX IF NOT EXISTS ai_reports_period_status_idx
  ON public.ai_reports(period_start,period_end,status,created_at DESC);

COMMIT;
