-- Phase 1A: capability-based authorization boundary and Admin/legacy isolation.
-- Additive and deny-first. Apply only after Phase 0 has passed clone verification.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_permission_module(p_capability text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN p_capability LIKE 'admin.users.%' THEN 'user_management'
    WHEN p_capability LIKE 'admin.audit.%' THEN 'audit_logs'
    WHEN p_capability LIKE 'admin.recovery.%' THEN 'backup'
    WHEN p_capability LIKE 'legacy_partner.%' THEN 'historical_records'
    WHEN p_capability LIKE 'partnership.%' THEN 'partnerships'
    WHEN p_capability LIKE 'proposal.%' THEN 'proposals'
    WHEN p_capability LIKE 'program.%' THEN 'programs'
    WHEN p_capability LIKE 'volunteer.%' THEN 'volunteers'
    WHEN p_capability LIKE 'survey.%' THEN 'surveys'
    WHEN p_capability LIKE 'donation.%' THEN 'donations'
    WHEN p_capability LIKE 'impact.%' THEN 'impact'
    WHEN p_capability LIKE 'analytics.%' THEN 'analytics'
    WHEN p_capability LIKE 'profiling.%' THEN 'profiling'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_role_has_capability(p_role text, p_capability text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN p_role = 'admin' THEN p_capability IN ('admin.users.manage','admin.audit.read','admin.recovery.read')
    WHEN p_role IN ('office','student_org','department') THEN p_capability = 'legacy_partner.history.read'
    WHEN p_role = 'finance_officer' THEN p_capability IN ('proposal.read','proposal.finance')
    WHEN p_role = 'volunteer' THEN p_capability IN ('program.read','volunteer.self','survey.read','survey.respond')
    WHEN p_role = 'barangay_captain' THEN p_capability IN ('partnership.read','survey.read','survey.respond','profiling.detail.read','profiling.aggregate.read','profiling.endorse')
    WHEN p_role = 'barangay_secretary' THEN p_capability IN ('partnership.read','survey.read','survey.respond','profiling.detail.read','profiling.aggregate.read','profiling.validate')
    WHEN p_role = 'barangay_mother_leader' THEN p_capability IN ('partnership.read','survey.read','survey.respond','profiling.collect')
    WHEN p_role = 'barangay_official' THEN p_capability IN ('partnership.read','survey.read','survey.respond')
    WHEN p_role = 'paraya_director' THEN p_capability IN (
      'partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','proposal.decide',
      'program.read','program.manage','volunteer.manage','survey.read','survey.manage','donation.read','donation.manage',
      'impact.read','impact.manage','analytics.aggregate.read','profiling.aggregate.read','profiling.privacy.configure')
    WHEN p_role = 'paraya_associate' THEN p_capability IN (
      'partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','program.read','program.manage',
      'volunteer.manage','survey.read','survey.manage','donation.read','donation.manage','impact.read','impact.manage',
      'analytics.aggregate.read','profiling.aggregate.read')
    WHEN p_role = 'paraya_researcher' THEN p_capability IN (
      'partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','program.read','program.manage',
      'volunteer.manage','survey.read','survey.manage','donation.read','donation.manage','impact.read','impact.manage',
      'analytics.aggregate.read','profiling.aggregate.read','profiling.cycle.manage','profiling.detail.read')
    WHEN p_role = 'paraya_officer' THEN p_capability IN (
      'partnership.read','proposal.read','proposal.create','proposal.review','program.read','program.manage','volunteer.manage',
      'survey.read','survey.manage','donation.read','donation.manage','impact.read','impact.manage','analytics.aggregate.read','profiling.aggregate.read')
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_current_has_capability(p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.users AS actor
     WHERE actor.id = auth.uid()
       AND actor.status = 'active'
       AND actor.is_active IS TRUE
       AND public.phase1_role_has_capability(actor.role, p_capability)
       AND COALESCE((actor.permissions ->> public.phase1_permission_module(p_capability))::boolean, true) IS NOT FALSE
  );
$function$;

REVOKE ALL ON FUNCTION public.phase1_permission_module(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase1_role_has_capability(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase1_current_has_capability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase1_current_has_capability(text) TO authenticated, service_role;

-- Existing true permission values are redundant. Persist only explicit false
-- denies so a JSON override cannot be mistaken for a grant.
UPDATE public.users AS u
   SET permissions = COALESCE((
     SELECT jsonb_object_agg(entry.key, false)
       FROM jsonb_each(COALESCE(u.permissions, '{}'::jsonb)) AS entry(key, value)
      WHERE entry.value = 'false'::jsonb
   ), '{}'::jsonb)
 WHERE u.permissions IS DISTINCT FROM COALESCE((
     SELECT jsonb_object_agg(entry.key, false)
       FROM jsonb_each(COALESCE(u.permissions, '{}'::jsonb)) AS entry(key, value)
      WHERE entry.value = 'false'::jsonb
   ), '{}'::jsonb);

-- Infrastructure Admin and former institutional identities cannot use old
-- permissive operational policies directly. Historical reads are delivered by
-- narrow, redacted server endpoints, never by broad PostgREST table access.
DO $isolate_operational_roles$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','p')
       AND c.relrowsecurity IS TRUE
       AND c.relname NOT IN ('users','audit_logs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'phase1_admin_legacy_operational_guard', target.schema_name, target.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN (''admin'',''office'',''student_org'',''department''))) WITH CHECK (NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN (''admin'',''office'',''student_org'',''department'')))',
      'phase1_admin_legacy_operational_guard', target.schema_name, target.table_name
    );
  END LOOP;
END;
$isolate_operational_roles$;

COMMIT;
