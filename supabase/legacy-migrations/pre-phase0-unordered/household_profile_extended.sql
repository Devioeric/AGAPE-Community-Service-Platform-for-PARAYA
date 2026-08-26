-- Household Profile Extended Data
-- Adds a free-form JSONB column to household_profiles to hold the ~50 community
-- profiling indicators (demographics, housing, utilities, sanitation, health,
-- nutrition, education, livelihood, etc.) that the paper Family Profiling Form
-- captures. Keeping these in JSONB lets PARAYA evolve the form without further
-- migrations; the canonical field catalog lives in
-- src/lib/household-profile-schema.ts.
--
-- Aggregations use Postgres JSONB operators (->>, jsonb_path_query, etc.) on
-- household_profiles.extended_data, so individual indicators stay queryable.
-- Safe to re-run.

ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS extended_data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- GIN index lets us cheaply ask "households where extended_data ? 'flood_prone'"
-- and "household-count by sitio for flood_prone = yes" without a sequential scan.
CREATE INDEX IF NOT EXISTS idx_hp_extended_data_gin
  ON public.household_profiles
  USING GIN (extended_data);
