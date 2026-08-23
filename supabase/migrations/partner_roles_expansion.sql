-- Partner Roles Expansion
-- Adds three new account types that can submit proposals and co-manage the
-- programs born from those proposals:
--   - office         (DYCI offices: OSAS, Registrar, Marketing, etc.)
--   - student_org    (Recognised student organisations / CSG / SSCs)
--   - department     (Academic departments: CICS, CCEA, CBA, etc.)
--
-- All three behave the same way at the RBAC level (collectively "partners")
-- but are kept as distinct roles so admins can tell them apart, dashboards
-- can label them clearly, and reports can break them down by source.
--
-- Adds `org_name` text column to capture the entity name (e.g. "CICS",
-- "CSG", "OSAS") since partners share a single user account but represent
-- different orgs. Nullable so it doesn't affect other roles.
--
-- Safe to re-run.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      -- PARAYA staff
      'paraya_director',
      'paraya_associate',
      'paraya_researcher',
      -- Volunteer
      'volunteer',
      -- Barangay
      'barangay_captain',
      'barangay_secretary',
      'barangay_mother_leader',
      -- Finance gate
      'finance_officer',
      -- Partner accounts (NEW)
      'office',
      'student_org',
      'department',
      -- Admin
      'admin',
      -- Legacy aliases, still accepted
      'paraya_officer',
      'barangay_official'
    )
  );

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS org_name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_org_name ON public.users(org_name)
  WHERE org_name IS NOT NULL;
