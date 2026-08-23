-- Phase 0: make application account status a database authorization boundary.
--
-- A Supabase Auth session is not sufficient by itself. Direct PostgREST calls
-- from pending, suspended, inactive, or orphaned identities must fail even if
-- an older table policy grants access based on role alone.
--
-- This migration adds one RESTRICTIVE policy to every existing RLS-enabled
-- table in the public schema. Restrictive policies grant no access by
-- themselves; they add an AND condition to the table's existing permissive
-- policies. public.users receives narrower operation-specific guards: an
-- inactive identity may read only its own pending row for invitation
-- completion, while every direct write requires an active account.

BEGIN;

DO $migration_check$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION
      'Phase 0 active-account RLS requires public.users; reconcile/apply the live base schema first';
  END IF;
END;
$migration_check$;

CREATE OR REPLACE FUNCTION public.phase0_current_account_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.users AS account
     WHERE account.id = auth.uid()
       AND account.status = 'active'
       AND account.is_active IS TRUE
  );
$function$;

REVOKE ALL ON FUNCTION public.phase0_current_account_is_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase0_current_account_is_active() FROM anon;
GRANT EXECUTE ON FUNCTION public.phase0_current_account_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase0_current_account_is_active() TO service_role;

COMMENT ON FUNCTION public.phase0_current_account_is_active() IS
  'Returns true only when the current Auth subject has an active AGAPE application account.';

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phase0_users_select_guard" ON public.users;
CREATE POLICY "phase0_users_select_guard"
  ON public.users
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.phase0_current_account_is_active())
    OR (
      id = (SELECT auth.uid())
      AND status = 'pending'
      AND is_active IS FALSE
    )
  );

DROP POLICY IF EXISTS "phase0_users_update_guard" ON public.users;
CREATE POLICY "phase0_users_update_guard"
  ON public.users
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.phase0_current_account_is_active()))
  WITH CHECK ((SELECT public.phase0_current_account_is_active()));

DROP POLICY IF EXISTS "phase0_users_insert_guard" ON public.users;
CREATE POLICY "phase0_users_insert_guard"
  ON public.users
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "phase0_users_delete_guard" ON public.users;
CREATE POLICY "phase0_users_delete_guard"
  ON public.users
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

DO $install_policies$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT namespace.nspname AS schema_name,
           relation.relname AS table_name
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relkind IN ('r', 'p')
       AND relation.relrowsecurity IS TRUE
       AND relation.relname <> 'users'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      'phase0_active_account_guard',
      target.schema_name,
      target.table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.phase0_current_account_is_active())) WITH CHECK ((SELECT public.phase0_current_account_is_active()))',
      'phase0_active_account_guard',
      target.schema_name,
      target.table_name
    );
  END LOOP;
END;
$install_policies$;

COMMIT;
