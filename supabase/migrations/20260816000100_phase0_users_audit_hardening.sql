-- Phase 0: protect account-governance fields and make audit events append-only.
--
-- Deployment prerequisites:
--   1. public.users already exists and has RLS-compatible auth.uid() ownership.
--   2. public.audit_logs has been created by audit_logs_columns.sql.
--   3. The application invite flow activates accounts through a trusted
--      service-role endpoint; authenticated clients can no longer activate
--      themselves by updating public.users directly.
--
-- This migration is additive and intentionally does not change role values or
-- rewrite existing account/audit data.

BEGIN;

DO $migration_check$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION
      'Phase 0 hardening requires public.users; reconcile/apply the live base schema first';
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION
      'Phase 0 hardening requires public.audit_logs; apply audit_logs_columns.sql first';
  END IF;
END;
$migration_check$;

-- RLS limits ordinary self-service updates to the caller's own row. The
-- trigger below supplies the column boundary that RLS policies cannot express.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can update own profile" ON public.users;
CREATE POLICY "users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE OR REPLACE FUNCTION public.guard_users_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  claim_role text;
  actor_id uuid;
  changed_columns text[];
BEGIN
  -- Read both the JWT role and subject. Checking the subject as well protects
  -- authenticated requests if a gateway omits the legacy role claim setting.
  claim_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.role()
  );
  actor_id := auth.uid();

  IF current_user::text IN ('anon', 'authenticated')
     OR claim_role IN ('anon', 'authenticated')
     OR actor_id IS NOT NULL THEN
    SELECT array_agg(column_name ORDER BY column_name)
      INTO changed_columns
      FROM jsonb_object_keys(to_jsonb(NEW)) AS columns(column_name)
     -- An allowlist remains secure when the live table contains privileged
     -- columns that are absent from this repository's incomplete base schema.
     WHERE column_name <> ALL (ARRAY[
       'full_name',
       'phone',
       'notification_prefs',
       'updated_at'
     ]::text[])
       AND (to_jsonb(OLD) -> column_name)
           IS DISTINCT FROM
           (to_jsonb(NEW) -> column_name);

    IF COALESCE(cardinality(changed_columns), 0) > 0 THEN
      RAISE EXCEPTION
        'Authenticated users cannot change account-governance fields'
        USING
          ERRCODE = '42501',
          DETAIL = format(
            'Protected columns in this update: %s',
            array_to_string(changed_columns, ', ')
          ),
          HINT = 'Use an authorized server-side account-administration workflow.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_users_privileged_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_users_privileged_columns() FROM anon, authenticated;

DROP TRIGGER IF EXISTS protect_users_privileged_columns ON public.users;
CREATE TRIGGER protect_users_privileged_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_users_privileged_columns();

COMMENT ON FUNCTION public.guard_users_privileged_columns() IS
  'Rejects direct authenticated changes to identity, role, status, permission, barangay, and organization ownership fields.';
COMMENT ON TRIGGER protect_users_privileged_columns ON public.users IS
  'Column-level guard complementing the own-row users UPDATE RLS policy.';

-- The committed application only inserts audit events and reads them through
-- the administrator interface. Replace the old FOR ALL policy with read-only
-- administrator access; service_role remains the trusted writer.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_all" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_admin_select" ON public.audit_logs;
CREATE POLICY "audit_admin_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.users AS account
       WHERE account.id = (SELECT auth.uid())
         AND account.role = 'admin'
    )
  );

REVOKE ALL ON public.audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM service_role;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only; update and delete are not allowed'
    USING
      ERRCODE = '42501',
      HINT = 'Create a compensating audit event instead of changing history.';

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_audit_log_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_audit_log_mutation() FROM anon, authenticated, service_role;

DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_audit_log_mutation();

COMMENT ON FUNCTION public.reject_audit_log_mutation() IS
  'Rejects mutation of an existing audit event; corrections must be appended as new events.';
COMMENT ON TRIGGER audit_logs_append_only ON public.audit_logs IS
  'Makes audit history append-only during normal application and service-role operation.';

COMMIT;
