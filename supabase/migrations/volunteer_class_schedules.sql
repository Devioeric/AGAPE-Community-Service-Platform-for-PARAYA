-- Volunteer Class Schedules — recurring weekly class blocks
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.volunteer_class_schedules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject      TEXT        NOT NULL,
  day_of_week  INT         NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0 = Sunday
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  location     TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vcs_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_vcs_volunteer ON public.volunteer_class_schedules(volunteer_id);

ALTER TABLE public.volunteer_class_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vcs_select_own" ON public.volunteer_class_schedules;
DROP POLICY IF EXISTS "vcs_insert_own" ON public.volunteer_class_schedules;
DROP POLICY IF EXISTS "vcs_update_own" ON public.volunteer_class_schedules;
DROP POLICY IF EXISTS "vcs_delete_own" ON public.volunteer_class_schedules;

CREATE POLICY "vcs_select_own" ON public.volunteer_class_schedules
  FOR SELECT USING (auth.uid() = volunteer_id);

CREATE POLICY "vcs_insert_own" ON public.volunteer_class_schedules
  FOR INSERT WITH CHECK (auth.uid() = volunteer_id);

CREATE POLICY "vcs_update_own" ON public.volunteer_class_schedules
  FOR UPDATE USING (auth.uid() = volunteer_id);

CREATE POLICY "vcs_delete_own" ON public.volunteer_class_schedules
  FOR DELETE USING (auth.uid() = volunteer_id);
