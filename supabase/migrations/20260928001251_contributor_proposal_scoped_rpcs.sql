-- Contributor proposal portal authorization (forward-only).
--
-- Contributors may prepare, save, read, and submit only proposals they own.
-- They must attribute each proposal to an authorised linked proponent entity;
-- PARAYA Officer assignment is selected by the server.  Existing Officer and
-- Finance workflows remain unchanged, and no direct table grants are added.
BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('public.phase2_save_proposal_graph(uuid,integer,jsonb)') IS NULL
     OR to_regprocedure('public.phase2_save_proposal_graph_v2(uuid,integer,jsonb)') IS NULL
     OR to_regprocedure('public.phase2_list_proposals()') IS NULL
     OR to_regprocedure('public.phase2_get_proposal(uuid)') IS NULL
     OR to_regprocedure('public.phase2_get_proposal_catalog()') IS NULL
     OR to_regprocedure('public.phase2_list_beneficiary_evidence_options(uuid)') IS NULL
     OR to_regprocedure('public.phase2_calculate_beneficiary_estimate(text,uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.phase2_apply_proposal_action(uuid,text,integer,text,text[])') IS NULL
     OR to_regclass('public.contributor_partner_links') IS NULL THEN
    RAISE EXCEPTION 'Contributor proposal scope requires the Phase 2 proposal RPCs and contributor links';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.phase2_contributor_is_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'contributor'
      AND u.status = 'active' AND u.is_active IS TRUE
  );
$function$;

CREATE OR REPLACE FUNCTION public.phase2_contributor_can_use_partner(
  p_partner_id uuid,
  p_data_mode text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.contributor_partner_links link
    JOIN public.partner_entities entity ON entity.id = link.partner_id
    JOIN public.partner_entity_roles role_link
      ON role_link.partner_id = entity.id AND role_link.role = 'proponent'
    WHERE link.contributor_user_id = auth.uid()
      AND link.partner_id = p_partner_id
      AND link.status = 'active'
      AND entity.data_mode = p_data_mode
      AND entity.lifecycle = 'active'
      AND entity.classification = 'internal'
      AND entity.entity_type IN ('dyci_office','student_organization','academic_department')
      AND EXISTS (
        SELECT 1 FROM public.users actor
        WHERE actor.id = auth.uid() AND actor.role = 'contributor'
          AND actor.status = 'active' AND actor.is_active IS TRUE
          AND EXISTS (
            SELECT 1 FROM public.phase2_component_runtime runtime
            WHERE runtime.component = 'proposals'
              AND (runtime.mode <> 'synthetic'
                OR (actor.is_synthetic_test IS TRUE AND actor.id = ANY(runtime.synthetic_user_ids)))
          )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.phase2_contributor_is_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase2_contributor_can_use_partner(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase2_contributor_is_active() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase2_contributor_can_use_partner(uuid,text) TO authenticated, service_role;

-- Extend the existing graph writer in place.  The migration fails closed if a
-- later migration changed a protected authorization boundary unexpectedly.
DO $patch_save$
DECLARE
  fn_def text;
  updated text;
  needle text;
BEGIN
  SELECT pg_get_functiondef('public.phase2_save_proposal_graph(uuid,integer,jsonb)'::regprocedure) INTO fn_def;
  updated := fn_def;

  needle := 'DECLARE active_mode text; v_proposal_id uuid; profile public.proposal_v2_profiles; budget public.proposal_budget_revisions; budget_id uuid; next_number integer;';
  IF position(needle IN updated) = 0 THEN
    RAISE EXCEPTION 'Contributor migration could not locate proposal writer declaration';
  END IF;
  updated := replace(updated, needle,
    'DECLARE active_mode text; v_proposal_id uuid; profile public.proposal_v2_profiles; budget public.proposal_budget_revisions; budget_id uuid; next_number integer; reviewer_id uuid;');

  needle := 'IF NOT (public.phase2_current_has_capability(''proposal.create'') AND public.phase2_current_has_capability(''budget.prepare'')) THEN RAISE EXCEPTION ''forbidden'' USING ERRCODE=''42501''; END IF;';
  IF position(needle IN updated) = 0 THEN
    RAISE EXCEPTION 'Contributor migration could not locate proposal writer capability guard';
  END IF;
  updated := replace(updated, needle,
    'IF NOT ((public.phase2_current_has_capability(''proposal.create'') AND public.phase2_current_has_capability(''budget.prepare'')) OR (public.phase2_current_has_capability(''contributor.proposal.create'') AND public.phase2_current_has_capability(''contributor.budget.prepare''))) THEN RAISE EXCEPTION ''forbidden'' USING ERRCODE=''42501''; END IF;'
    || E'\n'
    || ' IF public.phase2_contributor_is_active() THEN'
    || E'\n'
    || '  IF nullif(p_payload->>''originating_partner_id'','''') IS NULL OR NOT public.phase2_contributor_can_use_partner((p_payload->>''originating_partner_id'')::uuid,active_mode) THEN RAISE EXCEPTION ''linked proponent entity is required'' USING ERRCODE=''42501''; END IF;'
    || E'\n'
    || '  p_payload := jsonb_set(p_payload,''{origin_channel}'',to_jsonb(''partner_document''::text),true);'
    || E'\n'
    || '  SELECT u.id INTO reviewer_id FROM public.users u WHERE u.role=''paraya_officer'' AND u.status=''active'' AND u.is_active IS TRUE AND (active_mode<>''synthetic'' OR (u.is_synthetic_test IS TRUE AND u.id=ANY(coalesce((SELECT synthetic_user_ids FROM public.phase2_component_runtime WHERE component=''proposals''), ''{}''::uuid[])))) ORDER BY u.id LIMIT 1;'
    || E'\n'
    || '  IF reviewer_id IS NULL THEN RAISE EXCEPTION ''no active PARAYA Officer is available to review the proposal'' USING ERRCODE=''42501''; END IF;'
    || E'\n'
    || '  p_payload := jsonb_set(p_payload,''{responsible_officer_id}'',to_jsonb(reviewer_id::text),true);'
    || E'\n'
    || ' END IF;');

  needle := 'IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=(p_payload->>''responsible_officer_id'')::uuid AND role IN(''paraya_director'',''paraya_associate'',''paraya_researcher'') AND status=''active'' AND is_active) THEN RAISE EXCEPTION ''responsible officer is invalid'' USING ERRCODE=''22023''; END IF;';
  IF position(needle IN updated) = 0 THEN
    RAISE EXCEPTION 'Contributor migration could not locate responsible Officer guard';
  END IF;
  updated := replace(updated, needle,
    'IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=(p_payload->>''responsible_officer_id'')::uuid AND role=''paraya_officer'' AND status=''active'' AND is_active) THEN RAISE EXCEPTION ''responsible officer is invalid'' USING ERRCODE=''22023''; END IF;');

  needle := 'v_proposal_id:=p_proposal_id; PERFORM public.phase2_assert_runtime(''proposals'',v_proposal_id);';
  IF position(needle IN updated) = 0 THEN
    RAISE EXCEPTION 'Contributor migration could not locate proposal update branch';
  END IF;
  updated := replace(updated, needle,
    needle || E'\n'
    || '  IF public.phase2_contributor_is_active() AND NOT EXISTS (SELECT 1 FROM public.project_proposals q WHERE q.id=v_proposal_id AND q.created_by=auth.uid()) THEN RAISE EXCEPTION ''contributors may edit only their own proposals'' USING ERRCODE=''42501''; END IF;');

  EXECUTE updated;
END;
$patch_save$;

DO $patch_submit$
DECLARE fn_def text; updated text; needle text;
BEGIN
  SELECT pg_get_functiondef('public.phase2_apply_proposal_action(uuid,text,integer,text,text[])'::regprocedure) INTO fn_def;
  updated := fn_def;
  needle := 'IF NOT public.phase2_current_has_capability(''proposal.submit'') OR p.workflow_status NOT IN(''draft'',''revisions_requested'') OR budget.status<>''draft'' THEN RAISE EXCEPTION ''invalid submit transition'' USING ERRCODE=''42501''; END IF;';
  IF position(needle IN updated) = 0 THEN
    RAISE EXCEPTION 'Contributor migration could not locate proposal submit guard';
  END IF;
  updated := replace(updated, needle,
    'IF NOT (public.phase2_current_has_capability(''proposal.submit'') OR (public.phase2_current_has_capability(''contributor.proposal.submit'') AND public.phase2_contributor_is_active() AND EXISTS (SELECT 1 FROM public.project_proposals q WHERE q.id=p_proposal_id AND q.created_by=auth.uid()) AND public.phase2_contributor_can_use_partner(p.originating_partner_id,p.data_mode))) OR p.workflow_status NOT IN(''draft'',''revisions_requested'') OR budget.status<>''draft'' THEN RAISE EXCEPTION ''invalid submit transition'' USING ERRCODE=''42501''; END IF;');
  EXECUTE updated;
END;
$patch_submit$;

DO $patch_list$
DECLARE fn_def text; updated text; needle text;
BEGIN
  SELECT pg_get_functiondef('public.phase2_list_proposals()'::regprocedure) INTO fn_def;
  updated := fn_def;
  needle := 'IF NOT public.phase2_current_has_capability(''proposal.read'') THEN RAISE EXCEPTION ''forbidden'' USING ERRCODE=''42501''; END IF;';
  IF position(needle IN updated) = 0 THEN RAISE EXCEPTION 'Contributor migration could not locate proposal list guard'; END IF;
  updated := replace(updated, needle,
    'IF NOT (public.phase2_current_has_capability(''proposal.read'') OR public.phase2_current_has_capability(''contributor.proposal.read'')) THEN RAISE EXCEPTION ''forbidden'' USING ERRCODE=''42501''; END IF;');
  needle := 'WHERE p.data_mode=active_mode;';
  IF position(needle IN updated) = 0 THEN RAISE EXCEPTION 'Contributor migration could not locate proposal list scope'; END IF;
  updated := replace(updated, needle,
    'WHERE p.data_mode=active_mode AND (NOT public.phase2_contributor_is_active() OR q.created_by=auth.uid());');
  EXECUTE updated;
END;
$patch_list$;

DO $patch_get$
DECLARE fn_def text; updated text; needle text;
BEGIN
  SELECT pg_get_functiondef('public.phase2_get_proposal(uuid)'::regprocedure) INTO fn_def;
  updated := fn_def;
  needle := 'IF NOT public.phase2_current_has_capability(''proposal.read'') THEN RAISE EXCEPTION ''forbidden'' USING ERRCODE=''42501''; END IF;';
  IF position(needle IN updated) = 0 THEN RAISE EXCEPTION 'Contributor migration could not locate proposal detail guard'; END IF;
  updated := replace(updated, needle,
    'IF NOT (public.phase2_current_has_capability(''proposal.read'') OR public.phase2_current_has_capability(''contributor.proposal.read'')) THEN RAISE EXCEPTION ''forbidden'' USING ERRCODE=''42501''; END IF;'
    || E'\n'
    || ' IF public.phase2_contributor_is_active() AND NOT EXISTS (SELECT 1 FROM public.project_proposals q WHERE q.id=p_proposal_id AND q.created_by=auth.uid()) THEN RAISE EXCEPTION ''proposal not found'' USING ERRCODE=''P0002''; END IF;');
  EXECUTE updated;
END;
$patch_get$;

DO $patch_catalog$
DECLARE fn_def text; updated text; needle text;
BEGIN
  SELECT pg_get_functiondef('public.phase2_get_proposal_catalog()'::regprocedure) INTO fn_def;
  updated := fn_def;
  needle := 'IF NOT public.phase2_current_has_capability(''proposal.create'')';
  IF position(needle IN updated) = 0 THEN RAISE EXCEPTION 'Contributor migration could not locate proposal catalog guard'; END IF;
  updated := replace(updated, needle,
    'IF NOT (public.phase2_current_has_capability(''proposal.create'') OR public.phase2_current_has_capability(''contributor.proposal.create''))');
  -- Scope the partner catalog to entities explicitly linked to the active
  -- Contributor.  The aggregate spelling is stable in the latest Phase 2
  -- catalog definition; fail closed if it drifts.
  needle := 'WHERE p.data_mode=active_mode AND p.lifecycle=''active''),''[]''::jsonb),';
  IF position(needle IN updated) = 0 THEN RAISE EXCEPTION 'Contributor migration could not locate proposal catalog partner scope'; END IF;
  updated := replace(updated, needle,
    'WHERE p.data_mode=active_mode AND p.lifecycle=''active'' AND p.classification=''internal'' AND p.entity_type IN (''dyci_office'',''student_organization'',''academic_department'') AND (NOT public.phase2_contributor_is_active() OR EXISTS (SELECT 1 FROM public.contributor_partner_links link WHERE link.contributor_user_id=auth.uid() AND link.partner_id=p.id AND link.status=''active''))),''[]''::jsonb),');
  updated := replace(updated, 'u.role IN(''paraya_director'',''paraya_associate'',''paraya_researcher'')', 'u.role=''paraya_officer'' AND NOT public.phase2_contributor_is_active()');
  EXECUTE updated;
END;
$patch_catalog$;

-- Evidence options and aggregate beneficiary estimates are safe for a
-- Contributor to read, but remain de-identified and server-scoped.
DO $patch_evidence_options$
DECLARE fn_def text; updated text; needle text;
BEGIN
  SELECT pg_get_functiondef('public.phase2_list_beneficiary_evidence_options(uuid)'::regprocedure) INTO fn_def;
  updated := fn_def;
  needle := 'IF NOT public.phase2_current_has_capability(''proposal.create'')';
  IF position(needle IN updated) = 0 THEN RAISE EXCEPTION 'Contributor migration could not locate evidence-options guard'; END IF;
  updated := replace(updated, needle,
    'IF NOT (public.phase2_current_has_capability(''proposal.create'') OR public.phase2_current_has_capability(''contributor.proposal.create''))');
  EXECUTE updated;
END;
$patch_evidence_options$;

DO $patch_evidence_estimate$
DECLARE fn_def text; updated text; needle text;
BEGIN
  SELECT pg_get_functiondef('public.phase2_calculate_beneficiary_estimate(text,uuid,uuid,uuid)'::regprocedure) INTO fn_def;
  updated := fn_def;
  needle := 'IF NOT (public.phase2_current_has_capability(''proposal.create'') OR public.phase2_current_has_capability(''proposal.read'')) THEN';
  IF position(needle IN updated) = 0 THEN RAISE EXCEPTION 'Contributor migration could not locate beneficiary-estimate guard'; END IF;
  updated := replace(updated, needle,
    'IF NOT (public.phase2_current_has_capability(''proposal.create'') OR public.phase2_current_has_capability(''proposal.read'') OR public.phase2_current_has_capability(''contributor.proposal.create'')) THEN');
  EXECUTE updated;
END;
$patch_evidence_estimate$;

COMMENT ON FUNCTION public.phase2_contributor_can_use_partner(uuid,text) IS
  'Contributor proposal attribution guard: requires active linked proponent entity in the current data mode.';

COMMIT;
