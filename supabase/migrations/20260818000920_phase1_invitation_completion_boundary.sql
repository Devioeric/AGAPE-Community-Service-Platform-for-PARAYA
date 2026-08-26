-- Phase 1 forward correction: let a valid invited identity prove only that its
-- own pending application account may complete activation. Direct access to
-- public.users remains subject to the active-account and capability policies.

BEGIN;

CREATE OR REPLACE FUNCTION public.phase0_current_invite_can_complete()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM auth.users AS identity
      JOIN public.users AS account
        ON account.id = identity.id
     WHERE identity.id = auth.uid()
       AND identity.invited_at IS NOT NULL
       AND identity.deleted_at IS NULL
       AND account.status = 'pending'
       AND account.is_active IS FALSE
       AND account.role::text IN (
         'paraya_director',
         'paraya_associate',
         'paraya_researcher',
         'barangay_captain',
         'barangay_secretary',
         'barangay_mother_leader',
         'volunteer',
         'admin',
         'finance_officer'
       )
  );
$function$;

REVOKE ALL ON FUNCTION public.phase0_current_invite_can_complete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase0_current_invite_can_complete() FROM anon;
GRANT EXECUTE ON FUNCTION public.phase0_current_invite_can_complete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase0_current_invite_can_complete() TO service_role;

COMMENT ON FUNCTION public.phase0_current_invite_can_complete() IS
  'Returns only whether the current authenticated invited identity matches its own pending inactive AGAPE login account.';

COMMIT;
