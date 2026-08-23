-- ============================================================================
-- AGAPE COMBINED MIGRATIONS — paste-and-run script
-- ============================================================================
-- Bundles all migrations shipped during the 2026-05-20 debugging sweep so you
-- can apply them in one shot. Every section is idempotent — safe to re-run.
--
-- Sections (in dependency order):
--   1. proposals_rls_expansion           — RLS for proposal-to-program pipeline
--   2. program_activities_created_by     — adds created_by column
--   3. program_activities_status_check   — realigns status CHECK
--   4. program_activities_report_columns — adds report_1, report_2
--   5. program_activities_timestamps     — adds created_at, updated_at
--   6. program_budgets_schema_alignment  — dedupe + rename + add category/notes
--   7. program_budgets_drop_unique_program — drops single-row constraint
--   8. program_signups_status_check      — realigns signup status CHECK
--   9. activity_logs_approval            — adds approval workflow columns
--  10. household_profiles_family_name_nullable — drops NOT NULL
--  11. rls_expansion_remaining_tables    — RLS for 9 more tables
--
-- The superseded migration program_budgets_rename_amount_columns.sql is NOT
-- included — its work is subsumed by program_budgets_schema_alignment.sql.
-- ============================================================================



-- ############################################################################
-- ## proposals_rls_expansion.sql
-- ############################################################################

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


-- ############################################################################
-- ## program_activities_created_by.sql
-- ############################################################################

-- Add `created_by` to program_activities.
--
-- `program_item_approvals.sql` added `created_by` to program_budgets and
-- `added_by` to program_signups, but program_activities was missed. The
-- POST handler at src/app/api/programs/[id]/activities/route.ts inserts
-- `created_by` on every new activity, and the validation queue
-- (/api/validations) joins through this column to show who submitted the
-- pending item. Without the column the insert fails with:
--   "Could not find the 'created_by' column of 'program_activities' in the schema cache"
--
-- Safe to re-run.

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pa_created_by
  ON public.program_activities(created_by);


-- ############################################################################
-- ## program_activities_status_check.sql
-- ############################################################################

-- Realign the `program_activities.status` CHECK constraint with the values
-- the application UI actually uses.
--
-- The activity form (officer + partner sides) sends:
--   planned | ongoing | completed | cancelled
-- But the original initial-schema CHECK constraint accepts a different set
-- (e.g. scheduled | in_progress | completed | cancelled), causing inserts to
-- fail with:
--   "new row for relation \"program_activities\" violates check constraint
--    \"program_activities_status_check\""
--
-- This migration:
--   1. Normalizes any legacy values to the new vocabulary
--   2. Drops the old constraint (if present, by name)
--   3. Re-adds the constraint with the application's vocabulary
--   4. Backfills NULLs to 'planned' so the NOT NULL default applies
--
-- Safe to re-run.

-- ── 1. Normalize legacy values ─────────────────────────────────────────────
-- Map old vocabulary onto the new one. Add cases here if your DB has any
-- other legacy values surfaced by running:
--   SELECT DISTINCT status FROM public.program_activities;
UPDATE public.program_activities
   SET status = CASE status
                  WHEN 'scheduled'   THEN 'planned'
                  WHEN 'upcoming'    THEN 'planned'
                  WHEN 'in_progress' THEN 'ongoing'
                  WHEN 'active'      THEN 'ongoing'
                  WHEN 'done'        THEN 'completed'
                  ELSE status
                END
 WHERE status IN ('scheduled', 'upcoming', 'in_progress', 'active', 'done');

-- ── 2. Backfill NULL / unknown values so the new constraint doesn't reject
-- pre-existing rows.
UPDATE public.program_activities
   SET status = 'planned'
 WHERE status IS NULL
    OR status NOT IN ('planned', 'ongoing', 'completed', 'cancelled');

-- ── 3. Drop the legacy constraint (idempotent) ────────────────────────────
ALTER TABLE public.program_activities
  DROP CONSTRAINT IF EXISTS program_activities_status_check;

-- ── 4. Re-add with the application's vocabulary ───────────────────────────
ALTER TABLE public.program_activities
  ADD CONSTRAINT program_activities_status_check
  CHECK (status IN ('planned', 'ongoing', 'completed', 'cancelled'));

-- ── 5. Ensure a sensible default for new rows that omit status ────────────
ALTER TABLE public.program_activities
  ALTER COLUMN status SET DEFAULT 'planned';


-- ############################################################################
-- ## program_activities_report_columns.sql
-- ############################################################################

-- Add report columns to program_activities.
--
-- Each activity has two reports per the PARAYA process (R-5 labeling):
--   * report_1 — Activity Report   (narrative of what happened)
--   * report_2 — Financial Report  (formerly "Liquidation Report")
--
-- The UI at /officer/programs lets staff fill these in via "Activity Report"
-- and "Financial Report" buttons under each activity. The PATCH route
-- (/api/programs/[id]/activities/[actId]) writes whichever field was edited.
-- The DB columns were never added in any prior migration, so save fails with:
--   "Could not find the 'report_1' column of 'program_activities'
--    in the schema cache"
--
-- Both columns are nullable — an activity is reportable but not required to
-- have either report until the work is done.
--
-- Safe to re-run.

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS report_1 TEXT;

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS report_2 TEXT;


-- ############################################################################
-- ## program_activities_timestamps.sql
-- ############################################################################

-- Add created_at and updated_at to program_activities.
--
-- The PATCH handler at /api/programs/[id]/activities/[actId] stamps
-- `updated_at: new Date().toISOString()` on every update, and the
-- validations queue at /api/validations selects + orders by `created_at`.
-- Neither column exists on the production table, so:
--   * PATCH (Edit activity, save Activity/Financial report) fails with:
--       "Could not find the 'updated_at' column of 'program_activities'
--        in the schema cache"
--   * Validations queue silently drops pending activity submissions.
--
-- This migration adds both columns. Existing rows are backfilled to NOW(),
-- which is the safest available value (we don't know the true creation time
-- for already-existing activities).
--
-- Safe to re-run.

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.program_activities
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Index on created_at — validations queue orders by it.
CREATE INDEX IF NOT EXISTS idx_pa_created_at
  ON public.program_activities(created_at DESC);


-- ############################################################################
-- ## program_budgets_schema_alignment.sql
-- ############################################################################

-- program_budgets schema alignment.
--
-- Real schema we found in production:
--   id, program_id, allocated_amount, spent_amount, remaining_amount,
--   updated_at, approval_status, approved_by, approved_at, approval_notes,
--   created_by
-- Plus two EMPTY duplicate columns (`allocated`, `spent`) that the previous
-- migration's "ADD COLUMN IF NOT EXISTS" safety net accidentally created
-- because the rename block was guarding for `planned_amount` / `actual_amount`
-- (the wrong legacy names — the real ones were `*_amount`).
--
-- Notable gaps:
--   * No `category` column — the form's `category` field never had a home.
--   * No `notes` / `description` column — same story.
--
-- This migration:
--   1. Drops the empty duplicate `allocated` and `spent` columns (if both they
--      and `*_amount` exist).
--   2. Renames `allocated_amount` → `allocated`, `spent_amount` → `spent`
--      so the DB matches the application's vocabulary.
--   3. Adds the missing `category` and `notes` columns the forms have been
--      trying to write to.
--
-- Safe to re-run.

-- ── 1+2: dedupe + rename allocated ────────────────────────────────────────
DO $$
DECLARE
  has_amount BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='program_budgets'
       AND column_name='allocated_amount'
  );
  has_canonical BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='program_budgets'
       AND column_name='allocated'
  );
BEGIN
  IF has_amount AND has_canonical THEN
    -- Duplicate columns exist. Drop the empty one we accidentally created,
    -- then rename the real one to claim the canonical name.
    EXECUTE 'ALTER TABLE public.program_budgets DROP COLUMN allocated';
    EXECUTE 'ALTER TABLE public.program_budgets RENAME COLUMN allocated_amount TO allocated';
  ELSIF has_amount AND NOT has_canonical THEN
    EXECUTE 'ALTER TABLE public.program_budgets RENAME COLUMN allocated_amount TO allocated';
  END IF;
END $$;

-- ── 1+2: dedupe + rename spent ────────────────────────────────────────────
DO $$
DECLARE
  has_amount BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='program_budgets'
       AND column_name='spent_amount'
  );
  has_canonical BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='program_budgets'
       AND column_name='spent'
  );
BEGIN
  IF has_amount AND has_canonical THEN
    EXECUTE 'ALTER TABLE public.program_budgets DROP COLUMN spent';
    EXECUTE 'ALTER TABLE public.program_budgets RENAME COLUMN spent_amount TO spent';
  ELSIF has_amount AND NOT has_canonical THEN
    EXECUTE 'ALTER TABLE public.program_budgets RENAME COLUMN spent_amount TO spent';
  END IF;
END $$;

-- ── 3: add the missing app-side columns ───────────────────────────────────
-- Nullable so existing rows don't violate NOT NULL. The form-side validation
-- already requires `category` for new rows; pre-existing rows will show with
-- no category until backfilled.
ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE public.program_budgets
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_pb_category ON public.program_budgets(category);


-- ############################################################################
-- ## program_budgets_drop_unique_program.sql
-- ############################################################################

-- Drop the unique constraint on program_budgets.program_id.
--
-- The original schema modeled `program_budgets` as one summary row per
-- program (allocated_amount, spent_amount, remaining_amount). The
-- application treats it as line items — many rows per program, one per
-- category (Supplies, Transportation, Honoraria, …). Hitting "Add Budget
-- Item" a second time on the same program raises:
--   "duplicate key value violates unique constraint
--    program_budgets_program_id_key"
--
-- This migration drops that constraint so multiple budget lines per program
-- are allowed.
--
-- Safe to re-run.

ALTER TABLE public.program_budgets
  DROP CONSTRAINT IF EXISTS program_budgets_program_id_key;

-- Replace it with a non-unique index on program_id so SELECT WHERE
-- program_id = ? stays fast.
CREATE INDEX IF NOT EXISTS idx_pb_program_id
  ON public.program_budgets(program_id);


-- ############################################################################
-- ## program_signups_status_check.sql
-- ############################################################################

-- Realign program_signups.status CHECK constraint with the values the
-- application uses.
--
-- The signup flow uses three status values:
--   * pending   — self-signup awaiting officer confirmation
--   * confirmed — officer (or staff) has assigned this volunteer
--   * withdrawn — volunteer or officer removed the signup
--
-- The original schema's CHECK constraint admits only a subset (likely just
-- 'pending' / 'confirmed') and rejects 'withdrawn' — or admits only
-- 'pending' and rejects both 'confirmed' and 'withdrawn'. Adding a
-- volunteer via the officer/partner path hits:
--   "new row for relation \"program_signups\" violates check constraint
--    \"program_signups_status_check\""
--
-- This migration normalizes any legacy values, drops the existing constraint,
-- and re-adds it with the application's vocabulary.
--
-- Safe to re-run.

-- ── 1. Normalize legacy values onto the canonical vocabulary ─────────────
UPDATE public.program_signups
   SET status = CASE status
                  WHEN 'cancelled' THEN 'withdrawn'  -- old withdraw name
                  WHEN 'rejected'  THEN 'withdrawn'
                  WHEN 'active'    THEN 'confirmed'
                  ELSE status
                END
 WHERE status IN ('cancelled', 'rejected', 'active');

-- ── 2. Backfill any unknown / NULL values to 'pending' so the new
--      constraint doesn't reject pre-existing rows ─────────────────────────
UPDATE public.program_signups
   SET status = 'pending'
 WHERE status IS NULL
    OR status NOT IN ('pending', 'confirmed', 'withdrawn');

-- ── 3. Drop the legacy constraint (idempotent) ─────────────────────────────
ALTER TABLE public.program_signups
  DROP CONSTRAINT IF EXISTS program_signups_status_check;

-- ── 4. Re-add with the application's vocabulary ───────────────────────────
ALTER TABLE public.program_signups
  ADD CONSTRAINT program_signups_status_check
  CHECK (status IN ('pending', 'confirmed', 'withdrawn'));

-- ── 5. Ensure default stays 'pending' for new self-signups ───────────────
ALTER TABLE public.program_signups
  ALTER COLUMN status SET DEFAULT 'pending';


-- ############################################################################
-- ## activity_logs_approval.sql
-- ############################################################################

-- Add approval workflow columns to activity_logs.
--
-- The application has a full approval workflow built out for volunteer
-- activity logs:
--   * Officer UI (officer/volunteers page) shows pending logs with
--     Approve/Reject actions
--   * PATCH /api/activity-logs/[id] updates status + reviewed_by + updated_at
--   * Volunteer dashboard, analytics snapshot, AI narrative, and barangay
--     reports all filter `eq("status", "approved")`
-- …but the DB columns were never added, so every approval call would have
-- failed and every "approved" filter would have errored / silently returned
-- nothing.
--
-- This migration adds the missing columns to match the application's
-- expectations. Existing rows are backfilled to 'approved' so volunteers
-- don't suddenly lose credit for hours already logged.
--
-- Safe to re-run.

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS status TEXT
    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: existing logs were never reviewed, but we should trust them as
-- approved so volunteers don't suddenly see zero hours after the column is
-- added. New logs going forward will start as 'pending' (the default).
UPDATE public.activity_logs
   SET status = 'approved'
 WHERE status = 'pending'
   AND reviewed_at IS NULL
   AND reviewed_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_al_status        ON public.activity_logs(status);
CREATE INDEX IF NOT EXISTS idx_al_volunteer_id  ON public.activity_logs(volunteer_id);


-- ############################################################################
-- ## household_profiles_family_name_nullable.sql
-- ############################################################################

-- Drop NOT NULL on household_profiles.family_name.
--
-- Production has a `family_name TEXT NOT NULL` column from the original
-- schema, but the household profiling form + /api/household-profiles route
-- only capture `head_of_household`. New inserts fail with:
--   "null value in column \"family_name\" of relation \"household_profiles\"
--    violates not-null constraint"
--
-- The application doesn't model `family_name` separately — `head_of_household`
-- is the functional equivalent. Making the column nullable unblocks inserts
-- without forcing a rewrite of the form (or losing whatever historical data
-- already lives in the column).
--
-- If you later want `family_name` to be a distinct field, add it to the form
-- and the API insert payload, then re-tighten this constraint.
--
-- Safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'household_profiles'
       AND column_name  = 'family_name'
       AND is_nullable  = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.household_profiles ALTER COLUMN family_name DROP NOT NULL';
  END IF;
END $$;


-- ############################################################################
-- ## rls_expansion_remaining_tables.sql
-- ############################################################################

-- Comprehensive RLS Expansion for the Remaining Tables.
--
-- Background:
--   The R-1 role expansion split the legacy `paraya_officer` into three
--   PARAYA staff roles (director / associate / researcher) and the legacy
--   `barangay_official` into three barangay roles (captain / secretary /
--   mother_leader). Several table migrations were written before this
--   expansion and still have RLS policies like:
--     WHERE u.role IN ('paraya_officer', 'admin')
--   which silently block the new roles from reading or writing.
--
--   `proposals_rls_expansion.sql` already handled the proposal-to-program
--   pipeline. This migration sweeps the remaining tables.
--
-- Tables covered:
--   household_profiles
--   partnership_history
--   barangay_skills
--   barangay_assets
--   field_observations
--   survey_templates
--   survey_answer_codes
--   forum_threads
--   forum_posts
--   ai_reports
--   activity_photos
--
-- Access model used throughout:
--   PARAYA staff   = director + associate + researcher + paraya_officer (legacy)
--   Barangay roles = captain + secretary + mother_leader + barangay_official (legacy)
--   Admin always has full access.
--
-- Safe to re-run.


-- ═════════════════════════════════════════════════════════════════════════════
-- household_profiles
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.household_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hp_officer_all"   ON public.household_profiles;
DROP POLICY IF EXISTS "hp_brgy_read_own" ON public.household_profiles;

CREATE POLICY "hp_officer_all" ON public.household_profiles
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

CREATE POLICY "hp_brgy_read_own" ON public.household_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'barangay_captain', 'barangay_secretary', 'barangay_mother_leader',
          'barangay_official'
        )
        AND u.barangay_id = public.household_profiles.barangay_id
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- partnership_history
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.partnership_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ph_officer_all"   ON public.partnership_history;
DROP POLICY IF EXISTS "ph_brgy_read_own" ON public.partnership_history;

CREATE POLICY "ph_officer_all" ON public.partnership_history
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

CREATE POLICY "ph_brgy_read_own" ON public.partnership_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'barangay_captain', 'barangay_secretary', 'barangay_mother_leader',
          'barangay_official'
        )
        AND u.barangay_id = public.partnership_history.barangay_id
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- barangay_skills + barangay_assets
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.barangay_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barangay_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skills_officer_all"   ON public.barangay_skills;
DROP POLICY IF EXISTS "skills_brgy_read_own" ON public.barangay_skills;
DROP POLICY IF EXISTS "assets_officer_all"   ON public.barangay_assets;
DROP POLICY IF EXISTS "assets_brgy_read_own" ON public.barangay_assets;

CREATE POLICY "skills_officer_all" ON public.barangay_skills
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

CREATE POLICY "skills_brgy_read_own" ON public.barangay_skills
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'barangay_captain', 'barangay_secretary', 'barangay_mother_leader',
          'barangay_official'
        )
        AND u.barangay_id = public.barangay_skills.barangay_id
    )
  );

CREATE POLICY "assets_officer_all" ON public.barangay_assets
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

CREATE POLICY "assets_brgy_read_own" ON public.barangay_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN (
          'barangay_captain', 'barangay_secretary', 'barangay_mother_leader',
          'barangay_official'
        )
        AND u.barangay_id = public.barangay_assets.barangay_id
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- field_observations
-- ═════════════════════════════════════════════════════════════════════════════
-- PARAYA staff + admin: full access.
-- Mother leaders specifically can also write observations from the field
-- (per the original migration's intent).

ALTER TABLE public.field_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fo_officer_all"          ON public.field_observations;
DROP POLICY IF EXISTS "fo_mother_leader_write"  ON public.field_observations;

CREATE POLICY "fo_officer_all" ON public.field_observations
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

CREATE POLICY "fo_mother_leader_write" ON public.field_observations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('barangay_mother_leader', 'barangay_official')
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- survey_templates + survey_answer_codes
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.survey_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_answer_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "st_officer_select" ON public.survey_templates;
DROP POLICY IF EXISTS "st_officer_write"  ON public.survey_templates;
DROP POLICY IF EXISTS "sac_officer_all"   ON public.survey_answer_codes;

CREATE POLICY "st_officer_select" ON public.survey_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
       WHERE id = auth.uid()
         AND role IN (
           'paraya_director', 'paraya_associate', 'paraya_researcher',
           'paraya_officer', 'admin'
         )
    )
  );

CREATE POLICY "st_officer_write" ON public.survey_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
       WHERE id = auth.uid()
         AND role IN (
           'paraya_director', 'paraya_associate', 'paraya_researcher',
           'paraya_officer', 'admin'
         )
    )
  );

CREATE POLICY "sac_officer_all" ON public.survey_answer_codes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
       WHERE id = auth.uid()
         AND role IN (
           'paraya_director', 'paraya_associate', 'paraya_researcher',
           'paraya_officer', 'admin'
         )
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- forum_threads + forum_posts
-- ═════════════════════════════════════════════════════════════════════════════
-- Note: the owner column on these tables is `author_id`, not `created_by`.
-- Any authenticated user can read; authors manage their own rows;
-- PARAYA staff + admin moderate any row.

ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts   ENABLE ROW LEVEL SECURITY;

-- Drop both the original policy names and any names we may have created.
DROP POLICY IF EXISTS "ft_read_all"        ON public.forum_threads;
DROP POLICY IF EXISTS "ft_insert_auth"     ON public.forum_threads;
DROP POLICY IF EXISTS "ft_update_owner"    ON public.forum_threads;
DROP POLICY IF EXISTS "ft_delete_owner"    ON public.forum_threads;
DROP POLICY IF EXISTS "ft_moderate"        ON public.forum_threads;
DROP POLICY IF EXISTS "ft_read"            ON public.forum_threads;
DROP POLICY IF EXISTS "ft_insert"          ON public.forum_threads;

DROP POLICY IF EXISTS "fp_read_all"        ON public.forum_posts;
DROP POLICY IF EXISTS "fp_insert_auth"     ON public.forum_posts;
DROP POLICY IF EXISTS "fp_update_owner"    ON public.forum_posts;
DROP POLICY IF EXISTS "fp_delete_owner"    ON public.forum_posts;
DROP POLICY IF EXISTS "fp_moderate"        ON public.forum_posts;
DROP POLICY IF EXISTS "fp_read"            ON public.forum_posts;
DROP POLICY IF EXISTS "fp_insert"          ON public.forum_posts;

-- Threads
CREATE POLICY "ft_read_all"     ON public.forum_threads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ft_insert_auth"  ON public.forum_threads FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "ft_update_owner" ON public.forum_threads FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "ft_delete_owner" ON public.forum_threads FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "ft_moderate"     ON public.forum_threads
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

-- Posts
CREATE POLICY "fp_read_all"     ON public.forum_posts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fp_insert_auth"  ON public.forum_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "fp_update_owner" ON public.forum_posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "fp_delete_owner" ON public.forum_posts FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "fp_moderate"     ON public.forum_posts
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


-- ═════════════════════════════════════════════════════════════════════════════
-- ai_reports
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "officers and admins can manage ai_reports" ON public.ai_reports;
DROP POLICY IF EXISTS "ai_reports_officer_all"                    ON public.ai_reports;

CREATE POLICY "ai_reports_officer_all" ON public.ai_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
       WHERE id = auth.uid()
         AND role IN (
           'paraya_director', 'paraya_associate', 'paraya_researcher',
           'paraya_officer', 'admin'
         )
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- activity_photos
-- ═════════════════════════════════════════════════════════════════════════════
-- Read: any authenticated user (volunteers see photos from their programs).
-- Write: PARAYA staff + admin; activity photos may also be uploaded by the
--   officer who's running the activity. Volunteers don't write here.

ALTER TABLE public.activity_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ap_read"         ON public.activity_photos;
DROP POLICY IF EXISTS "ap_officer_all"  ON public.activity_photos;

CREATE POLICY "ap_read" ON public.activity_photos
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "ap_officer_all" ON public.activity_photos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
       WHERE id = auth.uid()
         AND role IN (
           'paraya_director', 'paraya_associate', 'paraya_researcher',
           'paraya_officer', 'admin'
         )
    )
  );


-- ============================================================================
-- END OF COMBINED MIGRATIONS
-- ============================================================================
-- After running this, refresh the Postgrest schema cache so column changes
-- are picked up immediately by the API:
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
