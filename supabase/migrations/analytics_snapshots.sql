-- Analytics Snapshots — periodic frozen aggregates for reporting.
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- A snapshot row is the system's state at the end of a period (month / quarter
-- / year). The `data` JSONB column holds the full aggregate blob used by both
-- the snapshots listing UI and downstream PDF/Excel exports.

CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type  TEXT        NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  data         JSONB       NOT NULL,
  generated_by UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  trigger      TEXT        NOT NULL DEFAULT 'manual' CHECK (trigger IN ('cron', 'manual')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_snap_period_type  ON public.analytics_snapshots(period_type);
CREATE INDEX IF NOT EXISTS idx_snap_period_start ON public.analytics_snapshots(period_start DESC);

ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snap_staff_all" ON public.analytics_snapshots;
CREATE POLICY "snap_staff_all" ON public.analytics_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('paraya_director', 'paraya_associate', 'paraya_researcher', 'paraya_officer', 'admin')
    )
  );
