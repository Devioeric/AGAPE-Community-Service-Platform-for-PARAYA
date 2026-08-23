-- Add approval workflow columns to activity_logs.
--
-- The application has a full approval workflow built out for volunteer
-- activity logs:
--   * Officer UI (officer/volunteers page) shows pending logs with
--     Approve/Reject actions
--   * PATCH /api/activity-logs/[id] updates status + reviewed_by + updated_at
--   * Volunteer dashboard, analytics snapshot, AI narrative, and barangay
--     reports all filter `eq("status", "approved")`
-- …but the DB columns were never added, so every approval call would have
-- failed and every "approved" filter would have errored / silently returned
-- nothing.
--
-- This migration adds the missing columns to match the application's
-- expectations. Existing rows are backfilled to 'approved' so volunteers
-- don't suddenly lose credit for hours already logged.
--
-- Safe to re-run.

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS status TEXT
    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: existing logs were never reviewed, but we should trust them as
-- approved so volunteers don't suddenly see zero hours after the column is
-- added. New logs going forward will start as 'pending' (the default).
UPDATE public.activity_logs
   SET status = 'approved'
 WHERE status = 'pending'
   AND reviewed_at IS NULL
   AND reviewed_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_al_status        ON public.activity_logs(status);
CREATE INDEX IF NOT EXISTS idx_al_volunteer_id  ON public.activity_logs(volunteer_id);
