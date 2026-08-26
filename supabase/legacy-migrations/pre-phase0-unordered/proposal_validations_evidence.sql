-- Evidence-Based Community Validation (Phase II hardening).
--
-- The original implementation (proposal_community_validation.sql) modeled
-- validation as a single attestation flag on the proposal — an officer just
-- clicked a button. The PARAYA framework describes Phase II as actual
-- consultation with community stakeholders, so a checkbox isn't enough.
--
-- This migration introduces three new tables that capture the artifacts of
-- the consultation:
--
--   proposal_validations               One row per consultation event
--     id, proposal_id, method, date_conducted, summary,
--     recorded_by, created_at
--
--   proposal_validation_stakeholders   Who participated
--     id, validation_id, stakeholder_name, role, present, created_at
--
--   proposal_validation_evidence       Files (FGD minutes, photos, etc.)
--     id, validation_id, storage_path, file_name, mime_type,
--     file_size, uploaded_by, created_at
--
-- The legacy `community_validated` boolean on project_proposals is kept,
-- but it becomes DERIVED: a trigger recomputes it whenever validations,
-- stakeholders, or evidence change. A proposal counts as validated when at
-- least one validation event has BOTH:
--   * ≥ 1 piece of evidence uploaded
--   * ≥ 3 named stakeholders
--
-- Legacy proposals where the boolean was already TRUE but no new-style
-- validation event exists are left alone — the trigger only writes when there
-- IS a new-style record for the proposal. This preserves backward
-- compatibility for anything previously waived through the old flow.
--
-- One manual step (cannot be done from SQL):
--   * In Supabase Dashboard → Storage, create a new private bucket named
--     `proposal-validation-evidence` (single bucket, no public access).
--     File uploads from the API will use it.
--
-- Safe to re-run.


-- ═══════════════════════════════════════════════════════════════════════════
-- Tables
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.proposal_validations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID NOT NULL REFERENCES public.project_proposals(id) ON DELETE CASCADE,
  method          TEXT NOT NULL CHECK (method IN (
                    'fgd',                  -- Focus Group Discussion
                    'key_informant',        -- Key Informant Interview
                    'town_hall',            -- Public consultation / barangay assembly
                    'consultation',         -- General community consultation
                    'door_to_door',         -- Door-to-door / household visits
                    'other'
                  )),
  date_conducted  DATE NOT NULL,
  summary         TEXT NOT NULL CHECK (length(trim(summary)) >= 20),
  recorded_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_proposal ON public.proposal_validations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_pv_date     ON public.proposal_validations(date_conducted DESC);


CREATE TABLE IF NOT EXISTS public.proposal_validation_stakeholders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id    UUID NOT NULL REFERENCES public.proposal_validations(id) ON DELETE CASCADE,
  stakeholder_name TEXT NOT NULL CHECK (length(trim(stakeholder_name)) >= 2),
  role             TEXT,            -- e.g. Barangay Captain, Mother Leader, Household Head, Sectoral Rep
  present          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvs_validation
  ON public.proposal_validation_stakeholders(validation_id);


CREATE TABLE IF NOT EXISTS public.proposal_validation_evidence (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id  UUID NOT NULL REFERENCES public.proposal_validations(id) ON DELETE CASCADE,
  storage_path   TEXT NOT NULL,   -- Path within the proposal-validation-evidence bucket
  file_name      TEXT NOT NULL,
  mime_type      TEXT,
  file_size      BIGINT,
  uploaded_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pve_validation
  ON public.proposal_validation_evidence(validation_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════
-- Who can write a validation event:
--   PARAYA staff + admin
--   Any barangay role (Captain / Secretary / Mother Leader + legacy)
--   The original proposal creator (so partners can self-document their own
--   consultations and submit them for officer review)
--
-- Who can read:
--   PARAYA staff + admin: everything
--   Anyone who can act on the parent proposal (via the proposals_rls_expansion
--   policy on project_proposals — we just check the parent is visible).
--
-- The API uses createAdminClient() for writes after JS-side role checks, so
-- these policies are primarily defense-in-depth.

ALTER TABLE public.proposal_validations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_validation_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_validation_evidence     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_select"  ON public.proposal_validations;
DROP POLICY IF EXISTS "pv_insert"  ON public.proposal_validations;
DROP POLICY IF EXISTS "pv_update"  ON public.proposal_validations;
DROP POLICY IF EXISTS "pv_delete"  ON public.proposal_validations;

CREATE POLICY "pv_select" ON public.proposal_validations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.project_proposals p
        JOIN public.users u ON u.id = auth.uid()
       WHERE p.id = proposal_validations.proposal_id
         AND (
           u.role IN (
             'paraya_director', 'paraya_associate', 'paraya_researcher',
             'paraya_officer', 'finance_officer', 'admin',
             'barangay_captain', 'barangay_secretary', 'barangay_mother_leader',
             'barangay_official'
           )
           OR p.created_by = auth.uid()
         )
    )
  );

CREATE POLICY "pv_insert" ON public.proposal_validations
  FOR INSERT
  WITH CHECK (
    recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.project_proposals p
        JOIN public.users u ON u.id = auth.uid()
       WHERE p.id = proposal_validations.proposal_id
         AND (
           u.role IN (
             'paraya_director', 'paraya_associate', 'paraya_researcher',
             'paraya_officer', 'admin',
             'barangay_captain', 'barangay_secretary', 'barangay_mother_leader',
             'barangay_official'
           )
           OR p.created_by = auth.uid()
         )
    )
  );

CREATE POLICY "pv_update" ON public.proposal_validations
  FOR UPDATE
  USING (
    recorded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('paraya_director', 'paraya_associate', 'paraya_researcher',
                        'paraya_officer', 'admin')
    )
  );

CREATE POLICY "pv_delete" ON public.proposal_validations
  FOR DELETE
  USING (
    recorded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN ('paraya_director', 'paraya_associate', 'paraya_researcher',
                        'paraya_officer', 'admin')
    )
  );

-- Stakeholders and evidence inherit access from the parent validation row.
DROP POLICY IF EXISTS "pvs_all" ON public.proposal_validation_stakeholders;
DROP POLICY IF EXISTS "pve_all" ON public.proposal_validation_evidence;

CREATE POLICY "pvs_all" ON public.proposal_validation_stakeholders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposal_validations v
       WHERE v.id = proposal_validation_stakeholders.validation_id
    )
  );

CREATE POLICY "pve_all" ON public.proposal_validation_evidence
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposal_validations v
       WHERE v.id = proposal_validation_evidence.validation_id
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- Derived flag: keep project_proposals.community_validated in sync
-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger recomputes the flag for the affected proposal whenever any
-- validation, stakeholder, or evidence row is inserted / updated / deleted.
--
-- Criteria for `community_validated = TRUE`:
--   At least one validation event exists for the proposal that has
--   BOTH ≥ 1 evidence file AND ≥ 3 stakeholder rows.
--
-- The trigger ONLY writes when there's at least one validation event for the
-- proposal. Legacy rows where the boolean was set without new-style records
-- stay untouched.

CREATE OR REPLACE FUNCTION public.recompute_community_validated(p_proposal_id UUID)
RETURNS VOID AS $$
DECLARE
  has_any_event BOOLEAN;
  meets_threshold BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.proposal_validations v
     WHERE v.proposal_id = p_proposal_id
  ) INTO has_any_event;

  IF NOT has_any_event THEN
    -- Don't touch legacy state.
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.proposal_validations v
      LEFT JOIN public.proposal_validation_evidence     e ON e.validation_id = v.id
      LEFT JOIN public.proposal_validation_stakeholders s ON s.validation_id = v.id
     WHERE v.proposal_id = p_proposal_id
     GROUP BY v.id
     HAVING COUNT(DISTINCT e.id) >= 1
        AND COUNT(DISTINCT s.id) >= 3
  ) INTO meets_threshold;

  UPDATE public.project_proposals
     SET community_validated     = meets_threshold,
         community_validated_at  = CASE WHEN meets_threshold THEN now() ELSE community_validated_at END,
         community_validated_by  = CASE WHEN meets_threshold THEN auth.uid() ELSE community_validated_by END
   WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.trg_recompute_community_validated()
RETURNS TRIGGER AS $$
DECLARE
  affected_proposal UUID;
BEGIN
  -- Resolve the proposal_id depending on which table fired the trigger.
  IF TG_TABLE_NAME = 'proposal_validations' THEN
    IF (TG_OP = 'DELETE') THEN
      affected_proposal := OLD.proposal_id;
    ELSE
      affected_proposal := NEW.proposal_id;
    END IF;
  ELSE
    -- Stakeholders / evidence: look up through validation
    DECLARE
      v_id UUID;
    BEGIN
      IF (TG_OP = 'DELETE') THEN
        v_id := OLD.validation_id;
      ELSE
        v_id := NEW.validation_id;
      END IF;
      SELECT proposal_id INTO affected_proposal
        FROM public.proposal_validations WHERE id = v_id;
    END;
  END IF;

  IF affected_proposal IS NOT NULL THEN
    PERFORM public.recompute_community_validated(affected_proposal);
  END IF;

  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS recompute_cv_on_validations         ON public.proposal_validations;
DROP TRIGGER IF EXISTS recompute_cv_on_stakeholders        ON public.proposal_validation_stakeholders;
DROP TRIGGER IF EXISTS recompute_cv_on_evidence            ON public.proposal_validation_evidence;

CREATE TRIGGER recompute_cv_on_validations
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_validations
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_community_validated();

CREATE TRIGGER recompute_cv_on_stakeholders
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_validation_stakeholders
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_community_validated();

CREATE TRIGGER recompute_cv_on_evidence
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_validation_evidence
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_community_validated();
