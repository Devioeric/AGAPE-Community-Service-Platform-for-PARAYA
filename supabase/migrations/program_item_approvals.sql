-- Program-Item Approval Workflow
-- Partner accounts (office / student_org / department) can add activities,
-- budget items, and volunteer signups to programs they own, but every such
-- addition must be validated by a PARAYA officer before it counts.
--
-- Pattern mirrors community_needs_approval.sql: a status column on each
-- table defaulting to 'approved' so pre-existing rows stay visible, plus
-- audit columns capturing who approved/rejected and when. Items created by
-- PARAYA staff bypass the gate (the API sets approved on insert).
--
-- Safe to re-run.

-- ── Program Activities ────────────────────────────────────────────────────
ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_pa_approval_status
  ON public.program_activities(approval_status);

-- ── Program Budgets ───────────────────────────────────────────────────────
ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;

ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- Capture who added the budget line, for partner-attribution + audit.
ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pb_approval_status
  ON public.program_budgets(approval_status);

-- ── Program Signups ───────────────────────────────────────────────────────
-- Volunteers self-signing bypass the partner gate (handled in the API: status
-- starts 'pending' for self-signup but approval_status is 'approved'). The new
-- column gates partner-initiated adds.
ALTER TABLE public.program_signups
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.program_signups
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.program_signups
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;

ALTER TABLE public.program_signups
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

ALTER TABLE public.program_signups
  ADD COLUMN IF NOT EXISTS added_by       UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ps_approval_status
  ON public.program_signups(approval_status);
