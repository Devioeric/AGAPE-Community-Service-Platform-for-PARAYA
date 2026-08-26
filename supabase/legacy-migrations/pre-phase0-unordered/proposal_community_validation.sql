-- Phase II Community Validation
-- The PARAYA framework requires objectives to be drafted internally, then
-- *validated with community stakeholders* before the proposal advances.
-- Currently the pipeline jumps straight from draft → submitted, with no record
-- of whether that consultation happened.
--
-- These columns capture the validation as an attestation on the proposal
-- itself: a flag + the notes/date/person who recorded the consultation. The
-- pre-screening gate (lib/proposals/prescreening.ts) enforces it so a proposal
-- can't pass pre_screening without an attested validation.
-- Safe to re-run.

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS community_validated       BOOLEAN     NOT NULL DEFAULT FALSE;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS community_validation_notes TEXT;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS community_validated_at    TIMESTAMPTZ;

ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS community_validated_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL;
