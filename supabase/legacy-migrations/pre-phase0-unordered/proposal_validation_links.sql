-- Phase II validation as structural linkage to existing community-engagement
-- records, instead of (or in addition to) uploaded artifacts.
--
-- Background:
--   The earlier proposal_validations_evidence.sql migration modelled
--   validation as uploaded FGD minutes / signed attendance / photos. That
--   works, but it duplicates what AGAPE already captures: community_needs
--   (Captain-approved), survey_responses, field_observations, and
--   household_profiles all have provenance built in (who reported, when,
--   where). Citing those records is stronger evidence than uploading a
--   document, because the lineage is already structural.
--
--   This migration introduces a new "links" model: each link cites one
--   existing record that informed the proposal's objectives, with a free-text
--   rationale explaining how. The DB trigger then derives the
--   `community_validated` flag from EITHER:
--     * Linked-records path (primary): at least 2 distinct links, with at
--       least 1 of them being an APPROVED community_need
--     * Uploaded-evidence path (supplementary, legacy): the existing rule
--       — any validation event with ≥1 evidence file AND ≥3 stakeholders
--
-- Safe to re-run.


-- ═══════════════════════════════════════════════════════════════════════════
-- Table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.proposal_validation_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES public.project_proposals(id) ON DELETE CASCADE,
  source_type   TEXT NOT NULL CHECK (source_type IN (
                  'community_need',
                  'survey',
                  'survey_response',
                  'field_observation',
                  'household_profile'
                )),
  source_id     UUID NOT NULL,
  rationale     TEXT NOT NULL CHECK (length(trim(rationale)) >= 10),
  linked_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One link per (proposal, record) — re-linking is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pvl_proposal_source
  ON public.proposal_validation_links(proposal_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_pvl_proposal
  ON public.proposal_validation_links(proposal_id);

CREATE INDEX IF NOT EXISTS idx_pvl_source
  ON public.proposal_validation_links(source_type, source_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.proposal_validation_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pvl_select" ON public.proposal_validation_links;
DROP POLICY IF EXISTS "pvl_insert" ON public.proposal_validation_links;
DROP POLICY IF EXISTS "pvl_delete" ON public.proposal_validation_links;

-- Read: anyone who can act on the parent proposal.
CREATE POLICY "pvl_select" ON public.proposal_validation_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.project_proposals p
        JOIN public.users u ON u.id = auth.uid()
       WHERE p.id = proposal_validation_links.proposal_id
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

-- Write: PARAYA staff/admin, any barangay role, or the proposal creator.
CREATE POLICY "pvl_insert" ON public.proposal_validation_links
  FOR INSERT
  WITH CHECK (
    linked_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.project_proposals p
        JOIN public.users u ON u.id = auth.uid()
       WHERE p.id = proposal_validation_links.proposal_id
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

CREATE POLICY "pvl_delete" ON public.proposal_validation_links
  FOR DELETE
  USING (
    linked_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role IN (
           'paraya_director', 'paraya_associate', 'paraya_researcher',
           'paraya_officer', 'admin'
         )
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- Updated trigger function: now considers BOTH paths
-- ═══════════════════════════════════════════════════════════════════════════
-- The function from proposal_validations_evidence.sql is replaced. The
-- function name + signature stay the same so the existing triggers on
-- proposal_validations / stakeholders / evidence continue to fire it.
-- We add a third trigger below on proposal_validation_links.

CREATE OR REPLACE FUNCTION public.recompute_community_validated(p_proposal_id UUID)
RETURNS VOID AS $$
DECLARE
  primary_met       BOOLEAN := FALSE;
  supplementary_met BOOLEAN := FALSE;
  has_any_signal    BOOLEAN := FALSE;
BEGIN
  -- ── Primary path: linked records ────────────────────────────────────────
  -- Need ≥ 2 total links AND ≥ 1 of them must be an APPROVED community_need.
  SELECT (
    (SELECT COUNT(*) FROM public.proposal_validation_links l
      WHERE l.proposal_id = p_proposal_id) >= 2
    AND EXISTS (
      SELECT 1
        FROM public.proposal_validation_links l
        JOIN public.community_needs cn ON cn.id = l.source_id
       WHERE l.proposal_id   = p_proposal_id
         AND l.source_type   = 'community_need'
         AND cn.approval_status = 'approved'
    )
  ) INTO primary_met;

  -- ── Supplementary path: uploaded evidence + stakeholders ────────────────
  -- Any single validation event with ≥1 file AND ≥3 stakeholders.
  SELECT EXISTS (
    SELECT 1
      FROM public.proposal_validations v
      LEFT JOIN public.proposal_validation_evidence     e ON e.validation_id = v.id
      LEFT JOIN public.proposal_validation_stakeholders s ON s.validation_id = v.id
     WHERE v.proposal_id = p_proposal_id
     GROUP BY v.id
     HAVING COUNT(DISTINCT e.id) >= 1
        AND COUNT(DISTINCT s.id) >= 3
  ) INTO supplementary_met;

  -- ── Did the proposal generate any "new-style" signal at all? ────────────
  -- Used so we don't trample legacy boolean state for proposals that have
  -- neither links nor events recorded yet.
  SELECT (
    EXISTS (SELECT 1 FROM public.proposal_validation_links l WHERE l.proposal_id = p_proposal_id)
    OR EXISTS (SELECT 1 FROM public.proposal_validations v   WHERE v.proposal_id = p_proposal_id)
  ) INTO has_any_signal;

  IF NOT has_any_signal THEN
    -- Don't touch legacy state.
    RETURN;
  END IF;

  UPDATE public.project_proposals
     SET community_validated     = (primary_met OR supplementary_met),
         community_validated_at  = CASE WHEN (primary_met OR supplementary_met)
                                        THEN now() ELSE community_validated_at END,
         community_validated_by  = CASE WHEN (primary_met OR supplementary_met)
                                        THEN COALESCE(auth.uid(), community_validated_by)
                                        ELSE community_validated_by END
   WHERE id = p_proposal_id;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger on the new table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_recompute_cv_on_links()
RETURNS TRIGGER AS $$
DECLARE
  affected_proposal UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    affected_proposal := OLD.proposal_id;
  ELSE
    affected_proposal := NEW.proposal_id;
  END IF;
  IF affected_proposal IS NOT NULL THEN
    PERFORM public.recompute_community_validated(affected_proposal);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recompute_cv_on_links ON public.proposal_validation_links;
CREATE TRIGGER recompute_cv_on_links
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_validation_links
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_cv_on_links();


-- ═══════════════════════════════════════════════════════════════════════════
-- Edge-case trigger: when a linked community_need's approval_status changes
-- ═══════════════════════════════════════════════════════════════════════════
-- If a need is approved AFTER being linked (or un-approved), recompute the
-- flag for every proposal that cites it.

CREATE OR REPLACE FUNCTION public.trg_recompute_cv_on_need_status()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    FOR r IN
      SELECT DISTINCT proposal_id
        FROM public.proposal_validation_links
       WHERE source_type = 'community_need'
         AND source_id   = NEW.id
    LOOP
      PERFORM public.recompute_community_validated(r.proposal_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recompute_cv_on_need_status ON public.community_needs;
CREATE TRIGGER recompute_cv_on_need_status
  AFTER UPDATE ON public.community_needs
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_cv_on_need_status();
