-- Add columns that may be missing from the barangays table
ALTER TABLE public.barangays
  ADD COLUMN IF NOT EXISTS contact_person   TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone    TEXT,
  ADD COLUMN IF NOT EXISTS contact_email    TEXT,
  ADD COLUMN IF NOT EXISTS total_population INTEGER,
  ADD COLUMN IF NOT EXISTS total_households INTEGER,
  ADD COLUMN IF NOT EXISTS partnership_start DATE,
  ADD COLUMN IF NOT EXISTS latitude          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();
