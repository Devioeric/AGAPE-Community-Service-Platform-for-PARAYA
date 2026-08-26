-- Skill & Asset Documentation — barangay-level capacity tracking
-- Run this in the Supabase SQL Editor.

-- ─── barangay_skills ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.barangay_skills (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id  UUID        NOT NULL REFERENCES public.barangays(id) ON DELETE CASCADE,
  skill_name   TEXT        NOT NULL,
  category     TEXT        NOT NULL,    -- "trade" | "education" | "health" | "agriculture" | "technology" | "other"
  practitioner_count INT   NOT NULL DEFAULT 0 CHECK (practitioner_count >= 0),
  proficiency_level  TEXT,              -- "beginner" | "intermediate" | "advanced" | NULL
  notes        TEXT,
  created_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bskills_barangay ON public.barangay_skills(barangay_id);
CREATE INDEX IF NOT EXISTS idx_bskills_category ON public.barangay_skills(category);

ALTER TABLE public.barangay_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bskills_officer_all"   ON public.barangay_skills;
DROP POLICY IF EXISTS "bskills_brgy_read_own" ON public.barangay_skills;

CREATE POLICY "bskills_officer_all" ON public.barangay_skills
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('paraya_officer', 'admin')
    )
  );

CREATE POLICY "bskills_brgy_read_own" ON public.barangay_skills
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'barangay_official'
        AND u.barangay_id = public.barangay_skills.barangay_id
    )
  );


-- ─── barangay_assets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.barangay_assets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id  UUID        NOT NULL REFERENCES public.barangays(id) ON DELETE CASCADE,
  asset_name   TEXT        NOT NULL,
  asset_type   TEXT        NOT NULL,    -- "facility" | "equipment" | "natural" | "infrastructure" | "other"
  quantity     INT         NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  condition    TEXT,                    -- "excellent" | "good" | "fair" | "poor"
  notes        TEXT,
  created_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bassets_barangay ON public.barangay_assets(barangay_id);
CREATE INDEX IF NOT EXISTS idx_bassets_type     ON public.barangay_assets(asset_type);

ALTER TABLE public.barangay_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bassets_officer_all"   ON public.barangay_assets;
DROP POLICY IF EXISTS "bassets_brgy_read_own" ON public.barangay_assets;

CREATE POLICY "bassets_officer_all" ON public.barangay_assets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('paraya_officer', 'admin')
    )
  );

CREATE POLICY "bassets_brgy_read_own" ON public.barangay_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'barangay_official'
        AND u.barangay_id = public.barangay_assets.barangay_id
    )
  );
