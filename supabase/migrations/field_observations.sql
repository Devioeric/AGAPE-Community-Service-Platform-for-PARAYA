-- Phase I Field Observations
-- The framework's Phase I is *open-ended observation* — the Researcher
-- immerses in the community to notice gaps, social phenomena, and unmet
-- needs before any structured needs/survey is filed. The existing
-- community_needs / household_profiles tables capture *formalized* findings;
-- this table is the journal that comes before them.
--
-- Records are intentionally lightweight: a date, a sitio, a paragraph of
-- observation, an optional follow-up action, and who recorded it. Use cases:
-- "noticed a stagnant drainage canal near the chapel after Sunday Mass",
-- "elderly residents in Sitio X mentioned no medicine deliveries since
-- October". These notes get reviewed by the team and may seed formal needs.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.field_observations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  observer_id       UUID        NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  barangay_id       UUID                 REFERENCES public.barangays(id) ON DELETE SET NULL,
  sitio             TEXT,
  observation_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  observation       TEXT        NOT NULL CHECK (length(trim(observation)) >= 10),
  -- Loose category — helps when the team reviews observations to decide what
  -- becomes a formal need vs what gets archived.
  category          TEXT        CHECK (category IS NULL OR category IN (
                      'environmental', 'health', 'economic', 'social',
                      'infrastructure', 'education', 'safety', 'other'
                    )),
  follow_up_action  TEXT,
  -- Loose linkage to a community_need if/when one is filed from this note.
  -- Nullable: the whole point is that observation comes BEFORE the formal need.
  promoted_to_need_id UUID      REFERENCES public.community_needs(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_obs_observer     ON public.field_observations(observer_id);
CREATE INDEX IF NOT EXISTS idx_field_obs_barangay     ON public.field_observations(barangay_id);
CREATE INDEX IF NOT EXISTS idx_field_obs_date         ON public.field_observations(observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_obs_promoted     ON public.field_observations(promoted_to_need_id);

ALTER TABLE public.field_observations ENABLE ROW LEVEL SECURITY;

-- PARAYA staff and admins read/write all observations. Barangay roles can
-- read observations scoped to their barangay (useful for awareness, but
-- they don't create them themselves).
DROP POLICY IF EXISTS "fo_staff_all"      ON public.field_observations;
DROP POLICY IF EXISTS "fo_brgy_read_own"  ON public.field_observations;

CREATE POLICY "fo_staff_all" ON public.field_observations
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

CREATE POLICY "fo_brgy_read_own" ON public.field_observations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'barangay_captain', 'barangay_secretary',
          'barangay_mother_leader', 'barangay_official'
        )
        AND u.barangay_id = public.field_observations.barangay_id
    )
  );
