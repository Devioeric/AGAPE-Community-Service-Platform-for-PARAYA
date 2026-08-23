-- Household Profiles — aggregate-only community profiling per barangay
-- Used when PARAYA officers conduct community profile assessments.
-- Run this in the Supabase SQL Editor.
-- Safe to re-run: brings an existing household_profiles table up to date.

CREATE TABLE IF NOT EXISTS public.household_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id       UUID        NOT NULL REFERENCES public.barangays(id) ON DELETE CASCADE,
  household_number  TEXT        NOT NULL,
  head_of_household TEXT,
  member_count      INT         NOT NULL DEFAULT 1 CHECK (member_count >= 1),
  income_bracket    TEXT,
  primary_needs     TEXT[]      NOT NULL DEFAULT '{}',
  geo_location      TEXT,
  notes             TEXT,
  collected_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  collected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If the table pre-existed with a different shape, add any missing columns.
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS household_number  TEXT;
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS head_of_household TEXT;
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS member_count      INT         NOT NULL DEFAULT 1;
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS income_bracket    TEXT;
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS primary_needs     TEXT[]      NOT NULL DEFAULT '{}';
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS geo_location      TEXT;
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS notes             TEXT;
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS collected_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS collected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill household_number on any pre-existing rows so the NOT NULL + unique
-- constraint can be added below. Window functions need a CTE here.
WITH numbered AS (
  SELECT id,
         'HH-' || LPAD(
           (ROW_NUMBER() OVER (PARTITION BY barangay_id ORDER BY created_at))::text,
           3, '0'
         ) AS new_num
    FROM public.household_profiles
   WHERE household_number IS NULL
)
UPDATE public.household_profiles hp
   SET household_number = numbered.new_num
  FROM numbered
 WHERE hp.id = numbered.id;

-- Enforce NOT NULL on household_number once it's backfilled
ALTER TABLE public.household_profiles
  ALTER COLUMN household_number SET NOT NULL;

-- Unique within a barangay (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'household_profiles_brgy_num_key'
  ) THEN
    ALTER TABLE public.household_profiles
      ADD CONSTRAINT household_profiles_brgy_num_key UNIQUE (barangay_id, household_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hp_barangay     ON public.household_profiles(barangay_id);
CREATE INDEX IF NOT EXISTS idx_hp_collected_at ON public.household_profiles(collected_at DESC);

ALTER TABLE public.household_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hp_officer_all"     ON public.household_profiles;
DROP POLICY IF EXISTS "hp_brgy_read_own"   ON public.household_profiles;

-- Officers + admins: full read/write
CREATE POLICY "hp_officer_all" ON public.household_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('paraya_officer', 'admin')
    )
  );

-- Barangay officials: read only their own barangay's profiles
CREATE POLICY "hp_brgy_read_own" ON public.household_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'barangay_official'
        AND u.barangay_id = public.household_profiles.barangay_id
    )
  );
