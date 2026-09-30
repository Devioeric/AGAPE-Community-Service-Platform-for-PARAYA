-- Additive account-management state for direct administrator provisioning.
-- Plaintext passwords are never stored; Supabase Auth remains authoritative.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_historical_password_state_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_historical_password_state_check
      CHECK (
        must_change_password IS NOT TRUE
        OR role IN ('paraya_officer','finance_officer','barangay_secretary','volunteer','admin')
      );
  END IF;
END;
$guard$;

COMMENT ON COLUMN public.users.must_change_password IS
  'True only for directly provisioned accounts until the user completes a password update.';
