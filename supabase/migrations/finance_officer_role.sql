-- Finance Officer Role
-- Adds 'finance_officer' to the users.role CHECK constraint. The Finance
-- Officer sits outside the PARAYA research chain so they can attest to
-- budget integrity independently — only this role (or admin) can sign off
-- the mark_finance_cleared action on a proposal.
--
-- Idempotent: drops the existing CHECK on users.role and re-adds with the
-- expanded value set. Matches the pattern in role_expansion.sql.
-- Safe to re-run.

DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
   WHERE conrelid = 'public.users'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'paraya_director',
    'paraya_associate',
    'paraya_researcher',
    'volunteer',
    'barangay_captain',
    'barangay_secretary',
    'barangay_mother_leader',
    'finance_officer',
    'admin',
    -- Legacy aliases retained during the transition
    'paraya_officer',
    'barangay_official'
  ));
