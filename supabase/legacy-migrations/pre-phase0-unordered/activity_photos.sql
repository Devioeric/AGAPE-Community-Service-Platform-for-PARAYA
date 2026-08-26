-- Activity Photos
-- Tracks photos uploaded against a program activity (e.g. event documentation,
-- before/after shots, materials distribution). The binary files live in the
-- `activity-photos` Supabase Storage bucket; this table holds the metadata so
-- we can list, caption, and authorize them.
--
-- A storage_path of the form 'activities/{activity_id}/{uuid}.{ext}' lets
-- public URL generation be deterministic when the bucket is set to public,
-- and lets per-activity cleanup ('storage.from(bucket).remove([prefix])')
-- be cheap.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.activity_photos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID        NOT NULL REFERENCES public.program_activities(id) ON DELETE CASCADE,
  storage_path  TEXT        NOT NULL,
  caption       TEXT,
  uploaded_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_photos_activity ON public.activity_photos(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_photos_created  ON public.activity_photos(created_at DESC);

ALTER TABLE public.activity_photos ENABLE ROW LEVEL SECURITY;

-- PARAYA staff + admin manage all. Volunteers + barangay can read; useful for
-- the volunteer dashboard showing photos from activities they attended.
DROP POLICY IF EXISTS "ap_staff_all"  ON public.activity_photos;
DROP POLICY IF EXISTS "ap_read_authed" ON public.activity_photos;

CREATE POLICY "ap_staff_all" ON public.activity_photos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer', 'admin'
        )
    )
  );

CREATE POLICY "ap_read_authed" ON public.activity_photos
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
