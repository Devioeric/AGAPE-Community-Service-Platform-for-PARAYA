-- Let the consolidated PARAYA Officer read operational tables (forward-only).
--
-- phase1_admin_legacy_operational_guard was written when paraya_officer was an
-- unmapped legacy role, so it denies that role everything on every guarded
-- table. After 20260921001231 made paraya_officer the single active Officer
-- role, the guard silently emptied the Officer's reads: surveys, donations,
-- impact, notifications, and dashboard charts returned no rows.
--
-- This migration splits the guard:
--   * reads: paraya_officer is no longer denied, so the existing permissive
--     and capability-based policies decide what the Officer may read, and the
--     per-module deny-override guard still applies;
--   * writes: a new restrictive guard keeps direct INSERT, UPDATE, and DELETE
--     by paraya_officer denied, exactly as before. Officer writes continue to
--     go through server routes and SECURITY DEFINER functions.
-- Admin and the retired office, student_org, department, and
-- barangay_official identities stay denied for every command.
BEGIN;

-- The per-table "DROP POLICY IF EXISTS" calls are expected to skip on first run.
SET LOCAL client_min_messages = warning;

DO $officer_read_guard$
DECLARE
  target record;
  legacy_roles constant text := $$ARRAY['admin','office','student_org','department','barangay_official']::text[]$$;
  officer_denied constant text := $$NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'paraya_officer')$$;
  guarded_count integer := 0;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'phase1_admin_legacy_operational_guard'
    ORDER BY tablename
  LOOP
    guarded_count := guarded_count + 1;
    EXECUTE format('DROP POLICY phase1_admin_legacy_operational_guard ON public.%I', target.tablename);
    EXECUTE format(
      'CREATE POLICY phase1_admin_legacy_operational_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = ANY (%s))) '
      'WITH CHECK (NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = ANY (%s)))',
      target.tablename, legacy_roles, legacy_roles);
    EXECUTE format('DROP POLICY IF EXISTS phase1_officer_direct_insert_guard ON public.%I', target.tablename);
    EXECUTE format('DROP POLICY IF EXISTS phase1_officer_direct_update_guard ON public.%I', target.tablename);
    EXECUTE format('DROP POLICY IF EXISTS phase1_officer_direct_delete_guard ON public.%I', target.tablename);
    EXECUTE format('CREATE POLICY phase1_officer_direct_insert_guard ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', target.tablename, officer_denied);
    EXECUTE format('CREATE POLICY phase1_officer_direct_update_guard ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', target.tablename, officer_denied, officer_denied);
    EXECUTE format('CREATE POLICY phase1_officer_direct_delete_guard ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)', target.tablename, officer_denied);
  END LOOP;
  IF guarded_count = 0 THEN
    RAISE EXCEPTION 'Officer read guard migration found no legacy operational guards';
  END IF;
END;
$officer_read_guard$;

COMMIT;
