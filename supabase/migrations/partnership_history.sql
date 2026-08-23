-- Partnership History — append-only timeline of partnership events per barangay
-- Run this in the Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so an
-- already-existing table from an earlier schema setup is brought up to date.

CREATE TABLE IF NOT EXISTS public.partnership_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id  UUID        NOT NULL REFERENCES public.barangays(id) ON DELETE CASCADE,
  officer_id   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  event_type   TEXT        NOT NULL,
  notes        TEXT,
  date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If the table pre-existed with a different shape, add any missing columns.
ALTER TABLE public.partnership_history
  ADD COLUMN IF NOT EXISTS officer_id  UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.partnership_history
  ADD COLUMN IF NOT EXISTS event_type  TEXT;
ALTER TABLE public.partnership_history
  ADD COLUMN IF NOT EXISTS notes       TEXT;
ALTER TABLE public.partnership_history
  ADD COLUMN IF NOT EXISTS date        DATE        NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.partnership_history
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_phist_barangay ON public.partnership_history(barangay_id);
CREATE INDEX IF NOT EXISTS idx_phist_date     ON public.partnership_history(date DESC);

ALTER TABLE public.partnership_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phist_officer_all"    ON public.partnership_history;
DROP POLICY IF EXISTS "phist_brgy_read_own"  ON public.partnership_history;
DROP POLICY IF EXISTS "phist_vol_read_own"   ON public.partnership_history;

-- Officers + admins: full read/write
CREATE POLICY "phist_officer_all" ON public.partnership_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('paraya_officer', 'admin')
    )
  );

-- Barangay officials: read only their own barangay's history
CREATE POLICY "phist_brgy_read_own" ON public.partnership_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'barangay_official'
        AND u.barangay_id = public.partnership_history.barangay_id
    )
  );

-- Volunteers: read only their assigned barangay's history
CREATE POLICY "phist_vol_read_own" ON public.partnership_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'volunteer'
        AND u.barangay_id = public.partnership_history.barangay_id
    )
  );
