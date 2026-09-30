-- Admit the consolidated PARAYA Officer in functions that still name only the
-- retired roles (forward-only).
--
-- 20260921001231 made paraya_officer the single active Officer role, but these
-- functions kept literal checks for paraya_director, paraya_associate, or
-- paraya_researcher. The Officer was therefore refused or skipped in: partner
-- registry reads and renewals, responsible-officer pickers, manual attendance,
-- survey-code voids, recommendation alerts and threshold settings, Phase 4
-- runtime configuration and external invitations, and invite completion.
--
-- Each retired-role check gains paraya_officer; the retired roles stay listed
-- (they cannot sign in, so this changes nothing for them). Grants and function
-- attributes are preserved because each definition is re-created from
-- pg_get_functiondef.
BEGIN;

DO $officer_function_roles$
DECLARE
  fn record;
  original text;
  patched text;
  expected text[] := ARRAY[
    'phase0_current_invite_can_complete', 'phase1_void_survey_answer_code',
    'phase2_generate_renewal_reminders', 'phase2_get_partner', 'phase2_get_partner_operating_catalog',
    'phase2_get_partner_relationship_detail', 'phase2_list_partners',
    'phase2_reconcile_legacy_partner_mapping_v2', 'phase2_renew_partnership_term',
    'phase3_sync_recommendation_notifications', 'phase3_update_recommendation_settings',
    'phase4_configure_component', 'phase4_create_program_invitation', 'phase8_guard_attendance_invariants'
  ];
  patched_names text[] := '{}';
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (expected)
    ORDER BY p.proname
  LOOP
    original := pg_get_functiondef(fn.oid);
    patched := regexp_replace(original,
      '''paraya_director''\s*,\s*''paraya_associate''\s*,\s*''paraya_researcher''',
      '''paraya_officer'',''paraya_director'',''paraya_associate'',''paraya_researcher''', 'g');
    patched := regexp_replace(patched, 'role\s*=\s*''paraya_director''', 'role IN(''paraya_officer'',''paraya_director'')', 'g');
    patched := regexp_replace(patched, '\s*<>\s*''paraya_director''', ' NOT IN(''paraya_officer'',''paraya_director'')', 'g');
    patched := regexp_replace(patched, 'IN\(''paraya_researcher'',''paraya_associate''\)', 'IN(''paraya_officer'',''paraya_researcher'',''paraya_associate'')', 'g');
    IF patched = original OR position('''paraya_officer''' IN patched) = 0 THEN
      RAISE EXCEPTION 'Officer role patch did not apply to %', fn.proname;
    END IF;
    EXECUTE patched;
    patched_names := patched_names || fn.proname::text;
  END LOOP;
  IF EXISTS (SELECT 1 FROM unnest(expected) name WHERE name <> ALL (patched_names)) THEN
    RAISE EXCEPTION 'Officer role patch is missing functions: %',
      (SELECT string_agg(name, ', ') FROM unnest(expected) name WHERE name <> ALL (patched_names));
  END IF;
END;
$officer_function_roles$;

COMMIT;
