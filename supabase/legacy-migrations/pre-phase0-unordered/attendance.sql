-- Attendance Verification — QR Code / OTP check-in for program activities.
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Mechanism: each program activity has a rotating 6-character OTP that
-- volunteers enter (manually, or via a QR code that encodes a URL containing
-- the OTP). The OTP expires after a configurable window. Volunteers can only
-- check in once per activity.

-- ─── attendance ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID        NOT NULL REFERENCES public.program_activities(id) ON DELETE CASCADE,
  volunteer_id  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method        TEXT        NOT NULL DEFAULT 'otp' CHECK (method IN ('qr', 'otp', 'manual')),
  ip_address    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS idx_att_activity   ON public.attendance(activity_id);
CREATE INDEX IF NOT EXISTS idx_att_volunteer  ON public.attendance(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_att_checked_in ON public.attendance(checked_in_at DESC);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "att_volunteer_read_own"   ON public.attendance;
DROP POLICY IF EXISTS "att_volunteer_insert_own" ON public.attendance;
DROP POLICY IF EXISTS "att_staff_all"            ON public.attendance;

-- Volunteers can read + insert their own attendance rows
CREATE POLICY "att_volunteer_read_own" ON public.attendance
  FOR SELECT USING (auth.uid() = volunteer_id);

CREATE POLICY "att_volunteer_insert_own" ON public.attendance
  FOR INSERT WITH CHECK (auth.uid() = volunteer_id);

-- PARAYA staff + admin: full access
CREATE POLICY "att_staff_all" ON public.attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('paraya_director', 'paraya_associate', 'paraya_researcher', 'paraya_officer', 'admin')
    )
  );

-- ─── program_activities: OTP columns ───────────────────────────────────────
ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS attendance_otp            TEXT;

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS attendance_otp_expires_at TIMESTAMPTZ;

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS attendance_otp_issued_at  TIMESTAMPTZ;

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS attendance_otp_issued_by  UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pa_otp ON public.program_activities(attendance_otp);
