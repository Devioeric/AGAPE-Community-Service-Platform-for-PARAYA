-- Relax the linked-records threshold: drop the "≥ 1 Captain-approved
-- community_need" requirement so any 2 linked records suffice.
--
-- The earlier proposal_validation_links.sql migration required at least one
-- approved community_need among the links. After review the team decided
-- that's too restrictive — a proposal informed by, say, two surveys + one
-- field observation is just as well-evidenced.
--
-- This migration only REPLACES the function. The existing triggers continue
-- to call it; the new logic is picked up automatically the next time any
-- link / event / stakeholder / evidence row changes.
--
-- New rule:
--   * Primary path:       ≥ 2 linked records (of any type / status)
--   * Supplementary path: any single validation event with ≥ 1 evidence file
--                         AND ≥ 3 stakeholders (unchanged)
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.recompute_community_validated(p_proposal_id UUID)
RETURNS VOID AS $$
DECLARE
  primary_met       BOOLEAN := FALSE;
  supplementary_met BOOLEAN := FALSE;
  has_any_signal    BOOLEAN := FALSE;
BEGIN
  -- ── Primary path: ≥ 2 linked records of any type ────────────────────────
  SELECT (
    (SELECT COUNT(*) FROM public.proposal_validation_links l
      WHERE l.proposal_id = p_proposal_id) >= 2
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

  -- ── Don't clobber legacy state for proposals with no new-style records ──
  SELECT (
    EXISTS (SELECT 1 FROM public.proposal_validation_links l WHERE l.proposal_id = p_proposal_id)
    OR EXISTS (SELECT 1 FROM public.proposal_validations v   WHERE v.proposal_id = p_proposal_id)
  ) INTO has_any_signal;

  IF NOT has_any_signal THEN
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

-- The trigger on community_needs.approval_status now does nothing meaningful
-- (approved status no longer affects the threshold). Drop it to remove the
-- dead overhead.
DROP TRIGGER  IF EXISTS recompute_cv_on_need_status      ON public.community_needs;
DROP FUNCTION IF EXISTS public.trg_recompute_cv_on_need_status();

-- Force a re-derivation for every proposal that has at least one linked
-- record so the boolean flag is consistent with the new rule immediately.
DO $$
DECLARE
  pid UUID;
BEGIN
  FOR pid IN SELECT DISTINCT proposal_id FROM public.proposal_validation_links LOOP
    PERFORM public.recompute_community_validated(pid);
  END LOOP;
END $$;
