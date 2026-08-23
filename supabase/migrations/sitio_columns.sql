-- Sitio-level granularity
-- Adds a `sitio` text column to household_profiles and community_needs so
-- data collection can be tracked at the sitio level (subdivision of a
-- barangay). Mother Leaders facilitate at this level per the scope.
--
-- Safe to re-run.

ALTER TABLE public.household_profiles
  ADD COLUMN IF NOT EXISTS sitio TEXT;

ALTER TABLE public.community_needs
  ADD COLUMN IF NOT EXISTS sitio TEXT;

-- Indexes for sitio-level aggregation
CREATE INDEX IF NOT EXISTS idx_hp_barangay_sitio ON public.household_profiles(barangay_id, sitio);
CREATE INDEX IF NOT EXISTS idx_cn_barangay_sitio ON public.community_needs(barangay_id, sitio);
