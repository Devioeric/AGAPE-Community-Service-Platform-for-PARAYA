-- Restore dashboard access for the consolidated PARAYA Officer role.
--
-- The role-consolidation migration updated the Officer branch of the
-- dashboard function, but its initial approved-role guard was inherited from
-- the pre-consolidation function and still omitted paraya_officer.  Repair
-- that guard forward-only while preserving the rest of the reviewed function
-- definition and its grants.
BEGIN;

DO $dashboard_officer_guard$
DECLARE
  definition text;
  patched_definition text;
BEGIN
  SELECT pg_get_functiondef('public.phase7_get_dashboard_summary()'::regprocedure)
    INTO definition;

  IF definition IS NULL THEN
    RAISE EXCEPTION 'phase7 dashboard summary function is missing';
  END IF;

  -- Match only the first approved-role sequence.  The same sequence is also
  -- used by the admin card counts later in the function; N=1 intentionally
  -- leaves those historical-role counting rules unchanged.
  patched_definition := regexp_replace(
    definition,
    $$'paraya_director'[[:space:]]*,[[:space:]]*'paraya_associate'[[:space:]]*,[[:space:]]*'paraya_researcher'[[:space:]]*,[[:space:]]*'finance_officer'$$,
    $$'paraya_director','paraya_associate','paraya_researcher','paraya_officer','finance_officer'$$,
    1,
    1
  );

  IF patched_definition = definition THEN
    RAISE EXCEPTION 'phase7 dashboard approved-role guard shape changed; review required';
  END IF;

  -- The preceding role-consolidation migration normally already changed this
  -- branch.  Keep the repair safe for a database where that replacement was
  -- not applied, without changing any other role branches.
  patched_definition := replace(
    patched_definition,
    $$ELSIF actor.role IN('paraya_director','paraya_associate') THEN$$,
    $$ELSIF actor.role='paraya_officer' THEN$$
  );

  EXECUTE patched_definition;
END;
$dashboard_officer_guard$;

REVOKE ALL ON FUNCTION public.phase7_get_dashboard_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase7_get_dashboard_summary() TO authenticated;

COMMIT;
