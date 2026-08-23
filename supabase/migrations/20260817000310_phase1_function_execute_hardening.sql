-- PostgreSQL grants function execution to PUBLIC by default. Remove that
-- implicit grant from every Phase 1 function; explicit authenticated or
-- service_role grants declared by the owning migration remain in force.
BEGIN;

DO $revoke_phase1_public_execute$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'phase1\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',fn.proname,fn.args);
  END LOOP;
END;
$revoke_phase1_public_execute$;

COMMIT;
