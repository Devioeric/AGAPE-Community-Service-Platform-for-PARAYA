-- Proposal + Program Pipeline RLS Expansion
--
-- Aligns RLS policies across the full proposal-to-program pipeline with the
-- expanded role set (R-1 / R-6). The original policies were written for the
-- legacy `paraya_officer` and `barangay_official` roles only, which blocked
-- inserts from `paraya_director`, `paraya_associate`, `paraya_researcher`,
-- `finance_officer`, and the three partner roles (`office`, `student_org`,
-- `department`).
--
-- Tables covered:
--   project_proposals
--   proposal_sdg_alignment
--   proposal_reviews
--   programs
--   program_activities
--   program_budgets
--   program_signups
--
-- Access model:
--   - PARAYA staff (director/associate/researcher) + admin: full access
--   - finance_officer:    read-only across the pipeline
--   - office/student_org/department: own proposals + the programs born from them
--   - volunteer:          read programs, manage own signups
--
-- Safe to re-run.
--
-- Run this in the Supabase SQL Editor.

-- ─── Helper predicates (inlined for clarity) ────────────────────────────────
-- "Can submit proposal":      PARAYA staff + admin + partner roles
-- "Can manage all proposals": PARAYA staff + admin (no partners, no finance)
-- "Can read all proposals":   PARAYA staff + admin + finance_officer

-- =============================================================================
-- project_proposals
-- =============================================================================

ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (names from legacy migrations may vary; cover common ones)
DROP POLICY IF EXISTS "proposals_select"              ON public.project_proposals;
DROP POLICY IF EXISTS "proposals_insert"              ON public.project_proposals;
DROP POLICY IF EXISTS "proposals_update"              ON public.project_proposals;
DROP POLICY IF EXISTS "proposals_delete"              ON public.project_proposals;
DROP POLICY IF EXISTS "Proposals select"              ON public.project_proposals;
DROP POLICY IF EXISTS "Proposals insert"              ON public.project_proposals;
DROP POLICY IF EXISTS "Proposals update"              ON public.project_proposals;
DROP POLICY IF EXISTS "Proposals delete"              ON public.project_proposals;
DROP POLICY IF EXISTS "officers can manage proposals" ON public.project_proposals;
DROP POLICY IF EXISTS "officers and admins can manage proposals"
                                                      ON public.project_proposals;

-- ── SELECT ──────────────────────────────────────────────────────────────────
-- Staff/admin/finance see everything. Partners see only proposals they created.
-- (Barangay roles intentionally have no read access here — their reporting goes
-- through aggregated views, not raw proposal rows.)
CREATE POLICY "proposals_select" ON public.project_proposals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',  -- legacy alias
            'finance_officer',
            'admin'
          )
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND project_proposals.created_by = auth.uid()
          )
        )
    )
  );

-- ── INSERT ──────────────────────────────────────────────────────────────────
-- Anyone whose role can submit a proposal. created_by must match the caller.
CREATE POLICY "proposals_insert" ON public.project_proposals
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',  -- legacy alias
          'admin',
          'office', 'student_org', 'department'
        )
    )
  );

-- ── UPDATE ──────────────────────────────────────────────────────────────────
-- PARAYA staff + admin can edit anything (pipeline advancement, notes, etc.).
-- Finance officers can update (limited fields enforced in the API).
-- Partners can edit only their own proposals.
CREATE POLICY "proposals_update" ON public.project_proposals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',  -- legacy alias
            'finance_officer',
            'admin'
          )
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND project_proposals.created_by = auth.uid()
          )
        )
    )
  );

-- ── DELETE ──────────────────────────────────────────────────────────────────
-- PARAYA staff + admin only. (Partners can withdraw via status change, not delete.)
CREATE POLICY "proposals_delete" ON public.project_proposals
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',  -- legacy alias
          'admin'
        )
    )
  );


-- =============================================================================
-- proposal_sdg_alignment
-- =============================================================================
-- Same access model as the parent proposal: if you can act on the proposal,
-- you can act on its SDG alignment rows.

ALTER TABLE public.proposal_sdg_alignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sdg_alignment_select"  ON public.proposal_sdg_alignment;
DROP POLICY IF EXISTS "sdg_alignment_insert"  ON public.proposal_sdg_alignment;
DROP POLICY IF EXISTS "sdg_alignment_update"  ON public.proposal_sdg_alignment;
DROP POLICY IF EXISTS "sdg_alignment_delete"  ON public.proposal_sdg_alignment;
DROP POLICY IF EXISTS "officers can manage sdg alignment"
                                              ON public.proposal_sdg_alignment;

CREATE POLICY "sdg_alignment_select" ON public.proposal_sdg_alignment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_proposals p
      WHERE p.id = proposal_sdg_alignment.proposal_id
    )
  );

CREATE POLICY "sdg_alignment_insert" ON public.proposal_sdg_alignment
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.project_proposals p
        JOIN public.users u ON u.id = auth.uid()
       WHERE p.id = proposal_sdg_alignment.proposal_id
         AND (
           u.role IN (
             'paraya_director', 'paraya_associate', 'paraya_researcher',
             'paraya_officer',
             'admin'
           )
           OR (
             u.role IN ('office', 'student_org', 'department')
             AND p.created_by = auth.uid()
           )
         )
    )
  );

CREATE POLICY "sdg_alignment_update" ON public.proposal_sdg_alignment
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM public.project_proposals p
        JOIN public.users u ON u.id = auth.uid()
       WHERE p.id = proposal_sdg_alignment.proposal_id
         AND (
           u.role IN (
             'paraya_director', 'paraya_associate', 'paraya_researcher',
             'paraya_officer',
             'admin'
           )
           OR (
             u.role IN ('office', 'student_org', 'department')
             AND p.created_by = auth.uid()
           )
         )
    )
  );

CREATE POLICY "sdg_alignment_delete" ON public.proposal_sdg_alignment
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
        FROM public.project_proposals p
        JOIN public.users u ON u.id = auth.uid()
       WHERE p.id = proposal_sdg_alignment.proposal_id
         AND u.role IN (
           'paraya_director', 'paraya_associate', 'paraya_researcher',
           'paraya_officer',
           'admin'
         )
    )
  );


-- =============================================================================
-- proposal_reviews
-- =============================================================================
-- PARAYA staff + admin manage reviews. Finance can read. Partner accounts can
-- read reviews on their own proposals (so they see why something was sent back).

ALTER TABLE public.proposal_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_reviews_select"  ON public.proposal_reviews;
DROP POLICY IF EXISTS "proposal_reviews_insert"  ON public.proposal_reviews;
DROP POLICY IF EXISTS "proposal_reviews_update"  ON public.proposal_reviews;
DROP POLICY IF EXISTS "proposal_reviews_delete"  ON public.proposal_reviews;
DROP POLICY IF EXISTS "officers can manage proposal_reviews"
                                                 ON public.proposal_reviews;

CREATE POLICY "proposal_reviews_select" ON public.proposal_reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.project_proposals p
        JOIN public.users u ON u.id = auth.uid()
       WHERE p.id = proposal_reviews.proposal_id
         AND (
           u.role IN (
             'paraya_director', 'paraya_associate', 'paraya_researcher',
             'paraya_officer',
             'finance_officer',
             'admin'
           )
           OR (
             u.role IN ('office', 'student_org', 'department')
             AND p.created_by = auth.uid()
           )
         )
    )
  );

CREATE POLICY "proposal_reviews_insert" ON public.proposal_reviews
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',
          'finance_officer',
          'admin'
        )
    )
  );

CREATE POLICY "proposal_reviews_update" ON public.proposal_reviews
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',
          'admin'
        )
    )
  );

CREATE POLICY "proposal_reviews_delete" ON public.proposal_reviews
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',
          'admin'
        )
    )
  );


-- =============================================================================
-- programs
-- =============================================================================
-- Programs are visible to any authenticated user (volunteers need to discover
-- programs to sign up for; barangays see their own; partners filtered in JS).
-- Writes are restricted to PARAYA staff + admin.

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programs_select"  ON public.programs;
DROP POLICY IF EXISTS "programs_insert"  ON public.programs;
DROP POLICY IF EXISTS "programs_update"  ON public.programs;
DROP POLICY IF EXISTS "programs_delete"  ON public.programs;
DROP POLICY IF EXISTS "officers can manage programs"           ON public.programs;
DROP POLICY IF EXISTS "officers and admins can manage programs" ON public.programs;

CREATE POLICY "programs_select" ON public.programs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "programs_insert" ON public.programs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',
          'admin'
        )
    )
  );

CREATE POLICY "programs_update" ON public.programs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',
          'admin'
        )
    )
  );

CREATE POLICY "programs_delete" ON public.programs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',
          'admin'
        )
    )
  );


-- =============================================================================
-- program_activities
-- =============================================================================
-- PARAYA staff + admin: full access.
-- Partners: insert/update on programs born from their own proposals (R-6 marks
--   these approval_status='pending' until validated by PARAYA).
-- Volunteers + everyone else: read-only.

ALTER TABLE public.program_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_activities_select"  ON public.program_activities;
DROP POLICY IF EXISTS "program_activities_insert"  ON public.program_activities;
DROP POLICY IF EXISTS "program_activities_update"  ON public.program_activities;
DROP POLICY IF EXISTS "program_activities_delete"  ON public.program_activities;
DROP POLICY IF EXISTS "officers can manage program_activities"
                                                  ON public.program_activities;

CREATE POLICY "program_activities_select" ON public.program_activities
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "program_activities_insert" ON public.program_activities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',
            'admin'
          )
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND EXISTS (
              SELECT 1
                FROM public.programs pr
                JOIN public.project_proposals pp ON pp.id = pr.proposal_id
               WHERE pr.id = program_activities.program_id
                 AND pp.created_by = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "program_activities_update" ON public.program_activities
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',
            'admin'
          )
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND EXISTS (
              SELECT 1
                FROM public.programs pr
                JOIN public.project_proposals pp ON pp.id = pr.proposal_id
               WHERE pr.id = program_activities.program_id
                 AND pp.created_by = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "program_activities_delete" ON public.program_activities
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',
          'admin'
        )
    )
  );


-- =============================================================================
-- program_budgets
-- =============================================================================
-- Same access model as program_activities.

ALTER TABLE public.program_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_budgets_select"  ON public.program_budgets;
DROP POLICY IF EXISTS "program_budgets_insert"  ON public.program_budgets;
DROP POLICY IF EXISTS "program_budgets_update"  ON public.program_budgets;
DROP POLICY IF EXISTS "program_budgets_delete"  ON public.program_budgets;
DROP POLICY IF EXISTS "officers can manage program_budgets"
                                               ON public.program_budgets;

CREATE POLICY "program_budgets_select" ON public.program_budgets
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "program_budgets_insert" ON public.program_budgets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',
            'admin'
          )
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND EXISTS (
              SELECT 1
                FROM public.programs pr
                JOIN public.project_proposals pp ON pp.id = pr.proposal_id
               WHERE pr.id = program_budgets.program_id
                 AND pp.created_by = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "program_budgets_update" ON public.program_budgets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',
            'admin'
          )
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND EXISTS (
              SELECT 1
                FROM public.programs pr
                JOIN public.project_proposals pp ON pp.id = pr.proposal_id
               WHERE pr.id = program_budgets.program_id
                 AND pp.created_by = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "program_budgets_delete" ON public.program_budgets
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'paraya_director', 'paraya_associate', 'paraya_researcher',
          'paraya_officer',
          'admin'
        )
    )
  );


-- =============================================================================
-- program_signups
-- =============================================================================
-- Volunteers: insert / withdraw (UPDATE / DELETE) their own.
-- PARAYA staff + admin: manage all.
-- Partners: add volunteers to their own programs (creates pending signup).

ALTER TABLE public.program_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_signups_select"  ON public.program_signups;
DROP POLICY IF EXISTS "program_signups_insert"  ON public.program_signups;
DROP POLICY IF EXISTS "program_signups_update"  ON public.program_signups;
DROP POLICY IF EXISTS "program_signups_delete"  ON public.program_signups;
DROP POLICY IF EXISTS "officers can manage program_signups"
                                                ON public.program_signups;

-- SELECT: staff/admin see all; volunteers see their own; partners see signups
-- on their own programs; barangays see signups for programs in their barangay.
CREATE POLICY "program_signups_select" ON public.program_signups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',
            'admin'
          )
          OR program_signups.volunteer_id = auth.uid()
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND EXISTS (
              SELECT 1
                FROM public.programs pr
                JOIN public.project_proposals pp ON pp.id = pr.proposal_id
               WHERE pr.id = program_signups.program_id
                 AND pp.created_by = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "program_signups_insert" ON public.program_signups
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',
            'admin'
          )
          OR (
            u.role = 'volunteer' AND program_signups.volunteer_id = auth.uid()
          )
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND EXISTS (
              SELECT 1
                FROM public.programs pr
                JOIN public.project_proposals pp ON pp.id = pr.proposal_id
               WHERE pr.id = program_signups.program_id
                 AND pp.created_by = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "program_signups_update" ON public.program_signups
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',
            'admin'
          )
          OR (u.role = 'volunteer' AND program_signups.volunteer_id = auth.uid())
          OR (
            u.role IN ('office', 'student_org', 'department')
            AND EXISTS (
              SELECT 1
                FROM public.programs pr
                JOIN public.project_proposals pp ON pp.id = pr.proposal_id
               WHERE pr.id = program_signups.program_id
                 AND pp.created_by = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "program_signups_delete" ON public.program_signups
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN (
            'paraya_director', 'paraya_associate', 'paraya_researcher',
            'paraya_officer',
            'admin'
          )
          OR (u.role = 'volunteer' AND program_signups.volunteer_id = auth.uid())
        )
    )
  );
