-- Role expansion: 4 roles → 8 roles
-- Splits PARAYA officer into Director/Associate/Researcher, and barangay
-- official into Captain/Secretary/Mother Leader.
--
-- Legacy values (paraya_officer, barangay_official) remain ACCEPTED so existing
-- accounts continue to work. The system treats them as aliases:
--   paraya_officer    → behaves like paraya_director (broad PARAYA staff)
--   barangay_official → behaves like barangay_secretary (default barangay role)
--
-- Admins should re-assign existing users to their specific role via the
-- Admin > Users page when convenient.
--
-- Safe to re-run.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      -- New roles (preferred)
      'paraya_director',
      'paraya_associate',
      'paraya_researcher',
      'volunteer',
      'barangay_captain',
      'barangay_secretary',
      'barangay_mother_leader',
      'admin',
      -- Legacy values, accepted for transition
      'paraya_officer',
      'barangay_official'
    )
  );

-- Helpful index for role-scoped queries (idempotent)
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
