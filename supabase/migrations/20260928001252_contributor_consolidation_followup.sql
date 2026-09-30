-- Contributor consolidation follow-up (forward-only).
--
-- Two corrections found after 20260928001250 and 20260928001251 were applied.
-- Applied migrations are never edited, so they are made here instead:
--   1. The Phase 2 responsible-officer trigger still accepted only the retired
--      Director, Associate, and Researcher roles.
--   2. The Contributor partner scope in the proposal catalog now uses the same
--      phase2_contributor_can_use_partner() guard as proposal save and submit.
BEGIN;

-- The older Phase 2 trigger still carried the pre-consolidation PARAYA role
-- list. Replace its predicate so new workflow rows recognize only the
-- canonical active Officer role.
CREATE OR REPLACE FUNCTION public.phase2_guard_responsible_officer()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE officer_id uuid;
BEGIN
  officer_id := coalesce(
    nullif(to_jsonb(NEW)->>'responsible_officer_id','')::uuid,
    nullif(to_jsonb(NEW)->>'phase2_responsible_officer_id','')::uuid
  );
  IF officer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id=officer_id AND u.status='active' AND u.is_active IS TRUE
      AND u.role='paraya_officer'
  ) THEN
    RAISE EXCEPTION 'responsible officer must be an active PARAYA officer' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

-- Swap the catalog's inline link check (written by 20260928001251) for the
-- shared guard. Fail closed if the catalog definition has drifted.
DO $patch_catalog_scope$
DECLARE fn_def text; old_scope text; new_scope text;
BEGIN
  SELECT pg_get_functiondef('public.phase2_get_proposal_catalog()'::regprocedure) INTO fn_def;
  old_scope := 'WHERE p.data_mode=active_mode AND p.lifecycle=''active'' AND p.classification=''internal'' AND p.entity_type IN (''dyci_office'',''student_organization'',''academic_department'') AND (NOT public.phase2_contributor_is_active() OR EXISTS (SELECT 1 FROM public.contributor_partner_links link WHERE link.contributor_user_id=auth.uid() AND link.partner_id=p.id AND link.status=''active''))),''[]''::jsonb),';
  new_scope := 'WHERE p.data_mode=active_mode AND p.lifecycle=''active'' AND (NOT public.phase2_contributor_is_active() OR public.phase2_contributor_can_use_partner(p.id,active_mode))),''[]''::jsonb),';
  IF position(new_scope IN fn_def) > 0 THEN RETURN; END IF;
  IF position(old_scope IN fn_def) = 0 THEN RAISE EXCEPTION 'Contributor follow-up could not locate proposal catalog partner scope'; END IF;
  EXECUTE replace(fn_def, old_scope, new_scope);
END;
$patch_catalog_scope$;

COMMIT;
