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
