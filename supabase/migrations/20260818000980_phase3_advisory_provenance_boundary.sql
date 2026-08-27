-- Keep recommendation-derived planning provenance separate from completed
-- human community validation. This is forward-only and additive.
BEGIN;

ALTER TABLE public.proposal_validation_links
  ADD COLUMN IF NOT EXISTS provenance_kind text NOT NULL DEFAULT 'validation';

ALTER TABLE public.proposal_validation_links
  DROP CONSTRAINT IF EXISTS proposal_validation_links_provenance_kind_check;
ALTER TABLE public.proposal_validation_links
  ADD CONSTRAINT proposal_validation_links_provenance_kind_check
  CHECK (provenance_kind IN ('validation', 'advisory_planning'));

CREATE OR REPLACE FUNCTION public.recompute_community_validated(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  primary_met boolean := false;
  supplementary_met boolean := false;
  has_any_signal boolean := false;
  proposal_barangay_id uuid;
BEGIN
  SELECT p.barangay_id
  INTO proposal_barangay_id
  FROM public.project_proposals p
  WHERE p.id = p_proposal_id;

  -- Planning provenance remains visible but cannot satisfy this human review
  -- gate. The structural path needs two separately recorded validation links,
  -- including an approved need for the proposal's own barangay.
  SELECT
    count(*) >= 2
    AND bool_or(
      l.source_type = 'community_need'
      AND EXISTS (
        SELECT 1
        FROM public.community_needs n
        WHERE n.id = l.source_id
          AND n.approval_status = 'approved'
          AND n.barangay_id = proposal_barangay_id
      )
    )
  INTO primary_met
  FROM public.proposal_validation_links l
  WHERE l.proposal_id = p_proposal_id
    AND l.provenance_kind = 'validation';

  SELECT EXISTS (
    SELECT 1
    FROM public.proposal_validations v
    LEFT JOIN public.proposal_validation_evidence e ON e.validation_id = v.id
    LEFT JOIN public.proposal_validation_stakeholders s ON s.validation_id = v.id
    WHERE v.proposal_id = p_proposal_id
    GROUP BY v.id
    HAVING count(DISTINCT e.id) >= 1
       AND count(DISTINCT s.id) >= 3
  ) INTO supplementary_met;

  SELECT (
    EXISTS (
      SELECT 1 FROM public.proposal_validation_links l
      WHERE l.proposal_id = p_proposal_id
    )
    OR EXISTS (
      SELECT 1 FROM public.proposal_validations v
      WHERE v.proposal_id = p_proposal_id
    )
  ) INTO has_any_signal;

  IF NOT has_any_signal THEN
    RETURN;
  END IF;

  UPDATE public.project_proposals
  SET community_validated = (primary_met OR supplementary_met),
      community_validated_at = CASE
        WHEN (primary_met OR supplementary_met) THEN now()
        ELSE NULL
      END,
      community_validated_by = CASE
        WHEN (primary_met OR supplementary_met) THEN COALESCE(auth.uid(), community_validated_by)
        ELSE NULL
      END
  WHERE id = p_proposal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_community_validated(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_community_validated(uuid) TO service_role;

COMMIT;
