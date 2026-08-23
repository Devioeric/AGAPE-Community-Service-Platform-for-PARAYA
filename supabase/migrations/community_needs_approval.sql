-- Community Needs Approval Workflow
-- Adds an approval gate: needs submitted by barangay roles (secretary, mother
-- leader) must be approved by the Barangay Captain before PARAYA staff see
-- them. Direct submissions by PARAYA staff bypass the gate.
--
-- Safe to re-run.

ALTER TABLE public.community_needs
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    NOT NULL DEFAULT 'approved'  -- default 'approved' so pre-existing rows stay visible
    CHECK (approval_status IN ('pending_captain', 'approved', 'rejected', 'needs_revision'));

ALTER TABLE public.community_needs
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.community_needs
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;

ALTER TABLE public.community_needs
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_cn_approval_status ON public.community_needs(approval_status);
CREATE INDEX IF NOT EXISTS idx_cn_barangay_status ON public.community_needs(barangay_id, approval_status);
