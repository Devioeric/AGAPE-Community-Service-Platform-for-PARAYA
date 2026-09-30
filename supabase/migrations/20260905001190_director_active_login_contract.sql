-- Align authentication with the confirmed seven-login scope. Historical
-- identities, role strings, mappings and authorship are not rewritten.
-- No feature flag, Auth identity, provisioning grant or service-role read changes.
BEGIN;
SET LOCAL search_path=pg_catalog,public;

CREATE OR REPLACE FUNCTION public.phase0_current_account_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.users account
  WHERE account.id=auth.uid() AND account.status='active' AND account.is_active IS TRUE
   AND account.role IN ('paraya_director','paraya_associate','paraya_researcher',
    'finance_officer','barangay_secretary','volunteer','admin')
 );
$function$;
COMMENT ON FUNCTION public.phase0_current_account_is_active() IS
 'True only for the current Auth subject with an active approved seven-role login; historical and unknown roles are denied even if misconfigured.';
REVOKE ALL ON FUNCTION public.phase0_current_account_is_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase0_current_account_is_active() TO authenticated,service_role;

-- Role/capability identifiers may still describe legacy historical records.
-- A current actor may never acquire those identifiers as authenticated access.
CREATE OR REPLACE FUNCTION public.phase1_current_has_capability(p_capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $function$
 SELECT public.phase0_current_account_is_active() AND EXISTS (
  SELECT 1 FROM public.users actor WHERE actor.id=auth.uid()
   AND public.phase1_role_has_capability(actor.role,p_capability)
   AND coalesce((actor.permissions->>public.phase1_permission_module(p_capability))::boolean,true) IS NOT FALSE
 );
$function$;
REVOKE ALL ON FUNCTION public.phase1_current_has_capability(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase1_current_has_capability(text) TO authenticated,service_role;

-- This correction is included in Phase 1 replays too; do not manufacture a
-- Phase 2 dependency when its optional capability helper has not been installed.
DO $phase2_guard$
BEGIN
 IF to_regprocedure('public.phase2_current_has_capability(text)') IS NOT NULL THEN
  EXECUTE $definition$
   CREATE OR REPLACE FUNCTION public.phase2_current_has_capability(p_capability text)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path=pg_catalog,public AS $function$
    SELECT public.phase0_current_account_is_active() AND EXISTS (
     SELECT 1 FROM public.users actor WHERE actor.id=auth.uid()
      AND public.phase2_role_has_capability(actor.role,p_capability)
      AND coalesce((actor.permissions->>public.phase2_permission_module(p_capability))::boolean,true) IS NOT FALSE
    );
   $function$;
  $definition$;
  REVOKE ALL ON FUNCTION public.phase2_current_has_capability(text) FROM PUBLIC,anon;
  GRANT EXECUTE ON FUNCTION public.phase2_current_has_capability(text) TO authenticated,service_role;
 END IF;
END;
$phase2_guard$;

-- Existing restrictive public/Storage active-account policies inherit this
-- fail-closed definition. Fix forward; do not roll back to historical logins.
COMMIT;
