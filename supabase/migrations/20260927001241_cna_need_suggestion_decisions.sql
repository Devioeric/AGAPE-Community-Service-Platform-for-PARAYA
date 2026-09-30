-- Data-derived community-need suggestion decisions (write side).
-- Suggestions remain advisory: an accepted suggestion enters the existing
-- pending_paraya_review workflow and still requires a human review decision.
BEGIN;

SET LOCAL search_path = public, extensions, pg_catalog;

CREATE TABLE public.community_need_suggestion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  cycle_id uuid NOT NULL REFERENCES public.profiling_cycles(id) ON DELETE RESTRICT,
  evidence_snapshot_id uuid NOT NULL REFERENCES public.profiling_evidence_snapshots(id) ON DELETE RESTRICT,
  indicator_code text NOT NULL CHECK (indicator_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  decision text NOT NULL CHECK (decision IN ('accepted', 'dismissed')),
  reason_code text CHECK (reason_code IS NULL OR reason_code IN
    ('not_a_priority','already_addressed','data_quality_concern','outside_paraya_scope','duplicate_of_existing_need','other')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  need_id uuid UNIQUE REFERENCES public.community_needs(id) ON DELETE RESTRICT,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  decided_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((decision = 'accepted' AND need_id IS NOT NULL AND reason_code IS NULL)
      OR (decision = 'dismissed' AND need_id IS NULL AND reason_code IS NOT NULL)),
  CHECK (reason_code IS DISTINCT FROM 'other' OR char_length(btrim(coalesce(note, ''))) >= 3)
);

CREATE INDEX community_need_suggestion_decisions_barangay_idx
  ON public.community_need_suggestion_decisions (barangay_id, indicator_code);
CREATE INDEX community_need_suggestion_decisions_cycle_idx
  ON public.community_need_suggestion_decisions (cycle_id, indicator_code);

CREATE TRIGGER community_need_suggestion_decisions_immutable
BEFORE UPDATE OR DELETE ON public.community_need_suggestion_decisions
FOR EACH ROW EXECUTE FUNCTION public.phase1_block_immutable_change();

ALTER TABLE public.community_need_suggestion_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_need_suggestion_decisions_active_account_guard
  ON public.community_need_suggestion_decisions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.phase0_current_account_is_active())
  WITH CHECK (public.phase0_current_account_is_active());
CREATE POLICY community_need_suggestion_decisions_rpc_only
  ON public.community_need_suggestion_decisions
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON TABLE public.community_need_suggestion_decisions FROM PUBLIC, anon, authenticated;

/* Keep the security catalog authoritative for the new RPC-only table. */
CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_table='finance_integrity_targets' THEN 'audit_logs'
  -- Retained domain payloads inherit their source module, not Admin audit access.
  WHEN p_table='community_need_review_events' THEN 'community_needs'
  WHEN p_table='community_need_suggestion_decisions' THEN 'community_needs'
  WHEN p_table='survey_template_events' THEN 'surveys'
  WHEN p_table='report_content_versions' THEN 'reports'
  -- Preserve the latest Phase 6 mappings and the original Phase 1 legacy aliases.
  WHEN p_table IN('report_lifecycle_events','phase6_delivery_runtime','notification_delivery_events') THEN 'audit_logs'
  WHEN p_table='notification_delivery_outbox' THEN 'communication'
  WHEN p_table='phase5_integrity_runtime' OR p_table='finance_integrity_events' THEN 'audit_logs'
  WHEN p_table='finance_integrity_proofs' THEN 'financial_integrity'
  WHEN p_table='phase4_component_runtime' OR p_table='volunteer_invitation_events' THEN 'audit_logs'
  WHEN p_table LIKE 'volunteer%' OR p_table='participation_forms' THEN 'volunteers'
  WHEN p_table LIKE 'proposal_budget_%' OR p_table='budget_categories' OR p_table='budget_review_events' OR p_table LIKE 'program_budget_%' OR p_table LIKE 'program_financial_%' OR p_table='program_expenditures' OR p_table LIKE 'liquidation_%' OR p_table='program_finance_events' THEN 'budgets'
  WHEN p_table LIKE 'partner_contact%' OR p_table LIKE 'partnership_%' OR p_table LIKE 'partner_entit%' OR p_table='partner_type_policies' OR p_table='legacy_account_partner_mappings' THEN 'partnerships'
  WHEN p_table LIKE 'historical_program%' THEN 'historical_programs'
  WHEN p_table LIKE 'proposal%' OR p_table IN('project_proposals','project_templates') THEN 'proposals'
  WHEN p_table LIKE 'program%' OR p_table='activity_photos' THEN 'programs'
  WHEN p_table IN('phase2_component_runtime','phase2_release_attestations','phase2_cutover_state') THEN 'audit_logs'
  WHEN p_table='users' THEN 'user_management' WHEN p_table='audit_logs' THEN 'audit_logs'
  WHEN p_table IN('barangays','partnership_history') THEN 'partnerships' WHEN p_table LIKE 'survey%' THEN 'surveys'
  WHEN p_table='community_needs' THEN 'community_needs' WHEN p_table='field_observations' THEN 'observations'
  WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets','skill_categories') THEN 'skills_assets'
  WHEN p_table='attendance' THEN 'attendance' WHEN p_table='activity_logs' THEN 'activity_logs' WHEN p_table LIKE 'donation%' THEN 'donations'
  WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' OR p_table IN('followup_assessments','qualitative_data') THEN 'impact'
  WHEN p_table LIKE 'analytics%' THEN 'analytics' WHEN p_table LIKE 'ai_recommendation%' OR p_table='chatbot_logs' THEN 'ai_assistance' WHEN p_table LIKE 'ai_report%' THEN 'reports'
  WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments','discussion_posts','discussion_replies') THEN 'communication'
  WHEN p_table IN('domain_correction_events','system_backups') OR p_table LIKE 'phase2_storage_read_event%' THEN 'audit_logs'
  WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles','households','residents','household_memberships') THEN 'profiling'
  ELSE NULL END;
$function$;

CREATE OR REPLACE FUNCTION public.cna_decide_need_suggestion(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  actor public.users%ROWTYPE;
  cycle public.profiling_cycles%ROWTYPE;
  snapshot public.profiling_evidence_snapshots%ROWTYPE;
  indicator jsonb;
  evidence jsonb;
  need_payload jsonb;
  policy_payload jsonb;
  v_cycle_id uuid;
  v_indicator_code text;
  decision text;
  reason_code text;
  note text;
  v_fingerprint text;
  need_id uuid;
  decision_id uuid;
  affected integer;
  title text;
  description text;
  category text;
  priority text;
  rule_threshold numeric;
  rule_high_threshold numeric;
  base_value bigint;
  yes_value bigint;
  lower_bound bigint;
  percent_value numeric;
  percent_is_lower_bound boolean := false;
  expected_affected integer;
BEGIN
  IF p_payload IS NULL
     OR NOT public.phase1_json_object_has_only(
       p_payload,
       ARRAY['cycle_id','indicator_code','decision','reason_code','note','need','policy']
     ) THEN
    RAISE EXCEPTION 'invalid suggestion decision payload' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO actor FROM public.users WHERE id = auth.uid();
  IF NOT public.phase0_current_account_is_active()
     OR NOT public.phase1_current_has_capability('community_need.manage')
     OR NOT public.phase1_current_has_capability('profiling.aggregate.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_payload->>'cycle_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid suggestion cycle id' USING ERRCODE = '22023';
  END IF;
  v_cycle_id := nullif(p_payload->>'cycle_id', '')::uuid;
  v_indicator_code := nullif(btrim(p_payload->>'indicator_code'), '');
  decision := nullif(btrim(p_payload->>'decision'), '');
  reason_code := nullif(btrim(p_payload->>'reason_code'), '');
  note := nullif(btrim(p_payload->>'note'), '');
  policy_payload := p_payload->'policy';

  IF v_cycle_id IS NULL OR v_indicator_code IS NULL OR decision NOT IN ('accept', 'dismiss')
     OR policy_payload IS NULL OR jsonb_typeof(policy_payload) <> 'object'
     OR octet_length(policy_payload::text) > 1024
     OR char_length(coalesce(note, '')) > 500 THEN
    RAISE EXCEPTION 'invalid suggestion decision fields' USING ERRCODE = '22023';
  END IF;

  SELECT profiling_cycle.*
    INTO cycle
  FROM public.profiling_cycles AS profiling_cycle
  WHERE profiling_cycle.id = v_cycle_id;
  IF cycle.id IS NULL THEN
    RAISE EXCEPTION 'cycle not found' USING ERRCODE = 'P0002';
  END IF;
  IF cycle.status NOT IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'need indicators require a completed cycle' USING ERRCODE = '23514';
  END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read', cycle.barangay_id, NULL);

  SELECT evidence_snapshot.*
    INTO snapshot
  FROM public.profiling_evidence_snapshots AS evidence_snapshot
  WHERE evidence_snapshot.cycle_id = cycle.id
    AND evidence_snapshot.aggregate_schema_version = 'agape.profiling.need-indicators.v1'
  ORDER BY evidence_snapshot.generated_at DESC
  LIMIT 1;
  IF snapshot.id IS NULL THEN
    RAISE EXCEPTION 'need indicators have not been generated' USING ERRCODE = '23514';
  END IF;

  SELECT indicator_item.item
    INTO indicator
  FROM jsonb_array_elements(coalesce(snapshot.aggregate_data->'indicators', '[]'::jsonb)) AS indicator_item(item)
  WHERE indicator_item.item->>'code' = v_indicator_code
  LIMIT 1;
  IF indicator IS NULL THEN
    RAISE EXCEPTION 'unknown indicator' USING ERRCODE = '22023';
  END IF;

  /* Rebuild the policy at the database boundary.  The browser and API may
     suggest edits to the need text, but they cannot forge thresholds,
     percentages, or affected counts in the immutable evidence record. */
  rule_threshold := CASE v_indicator_code
    WHEN 'hh_water_unimproved' THEN 25 WHEN 'hh_sanitation_limited' THEN 25
    WHEN 'hh_no_electricity' THEN 10 WHEN 'hh_housing_inadequate' THEN 20
    WHEN 'hh_flood_exposed' THEN 30 WHEN 'hh_no_digital_access' THEN 30
    WHEN 'hh_low_income' THEN 40 WHEN 'hh_need_health' THEN 30
    WHEN 'hh_need_education' THEN 30 WHEN 'hh_need_livelihood' THEN 30
    WHEN 'hh_need_housing' THEN 30 WHEN 'hh_need_sanitation' THEN 30
    WHEN 'hh_need_disaster_readiness' THEN 30 WHEN 'hh_need_digital_access' THEN 30
    WHEN 'res_school_age_not_enrolled' THEN 10 WHEN 'res_labor_force_unemployed' THEN 15
    WHEN 'res_disability_support' THEN 10 WHEN 'res_health_support' THEN 15
    ELSE NULL END;
  rule_high_threshold := CASE v_indicator_code
    WHEN 'hh_water_unimproved' THEN 50 WHEN 'hh_sanitation_limited' THEN 50
    WHEN 'hh_no_electricity' THEN 25 WHEN 'hh_housing_inadequate' THEN 40
    WHEN 'hh_flood_exposed' THEN 60 WHEN 'hh_no_digital_access' THEN 60
    WHEN 'hh_low_income' THEN 60 WHEN 'hh_need_health' THEN 60
    WHEN 'hh_need_education' THEN 60 WHEN 'hh_need_livelihood' THEN 60
    WHEN 'hh_need_housing' THEN 60 WHEN 'hh_need_sanitation' THEN 60
    WHEN 'hh_need_disaster_readiness' THEN 60 WHEN 'hh_need_digital_access' THEN 60
    WHEN 'res_school_age_not_enrolled' THEN 25 WHEN 'res_labor_force_unemployed' THEN 30
    WHEN 'res_disability_support' THEN 20 WHEN 'res_health_support' THEN 30
    ELSE NULL END;
  IF rule_threshold IS NULL OR rule_high_threshold IS NULL THEN
    RAISE EXCEPTION 'unsupported indicator code' USING ERRCODE = '22023';
  END IF;
  base_value := NULLIF(indicator->'base'->>'value', '')::bigint;
  yes_value := NULLIF(indicator->'yes'->>'value', '')::bigint;
  IF coalesce((indicator->'base'->>'suppressed')::boolean, false)
     OR base_value IS NULL OR base_value < 20 THEN
    RAISE EXCEPTION 'indicator base is not actionable' USING ERRCODE = '23514';
  END IF;
  IF indicator->'yes'->>'label' LIKE '<%' THEN
    RAISE EXCEPTION 'suppressed indicator cannot become a need' USING ERRCODE = '23514';
  ELSIF indicator->'yes'->>'label' = 'suppressed'
        AND indicator->'no'->>'label' = '<' || (snapshot.aggregate_data->'privacy'->>'suppressionThreshold') THEN
    lower_bound := greatest(base_value - ((snapshot.aggregate_data->'privacy'->>'suppressionThreshold')::integer - 1), 0);
    percent_value := round((lower_bound::numeric / base_value::numeric) * 100, 1);
    percent_is_lower_bound := true;
  ELSIF yes_value IS NOT NULL THEN
    percent_value := round((yes_value::numeric / base_value::numeric) * 100, 1);
  ELSE
    RAISE EXCEPTION 'ambiguous indicator suppression' USING ERRCODE = '23514';
  END IF;
  IF percent_value < rule_threshold THEN
    RAISE EXCEPTION 'indicator no longer meets policy threshold' USING ERRCODE = '23514';
  END IF;
  policy_payload := jsonb_build_object(
    'version', 'cna.need-suggestions.v1',
    'threshold', rule_threshold,
    'highThreshold', rule_high_threshold,
    'minBase', 20,
    'percent', percent_value,
    'percentIsLowerBound', percent_is_lower_bound
  );

  v_fingerprint := encode(
    digest(convert_to(cycle.id::text || '|' || v_indicator_code, 'UTF8'), 'sha256'),
    'hex'
  );
  IF EXISTS (SELECT 1 FROM public.community_need_suggestion_decisions existing_decision WHERE existing_decision.fingerprint = v_fingerprint) THEN
    RAISE EXCEPTION 'suggestion already decided' USING ERRCODE = '23505';
  END IF;

  evidence := indicator || jsonb_build_object(
    'cycleName', cycle.name,
    'reportingDate', cycle.collection_ends_on,
    'suppressionThreshold', snapshot.aggregate_data->'privacy'->'suppressionThreshold',
    'evidenceSnapshotId', snapshot.id
  );

  IF decision = 'accept' THEN
    need_payload := p_payload->'need';
    IF need_payload IS NULL OR jsonb_typeof(need_payload) <> 'object'
       OR NOT public.phase1_json_object_has_only(
         need_payload,
         ARRAY['title','description','category','priority','affected_count']
       ) THEN
      RAISE EXCEPTION 'invalid suggested need' USING ERRCODE = '22023';
    END IF;
    IF reason_code IS NOT NULL OR note IS NOT NULL THEN
      RAISE EXCEPTION 'acceptance cannot include a dismissal reason' USING ERRCODE = '22023';
    END IF;

    title := btrim(coalesce(need_payload->>'title', ''));
    description := coalesce(need_payload->>'description', '');
    category := need_payload->>'category';
    priority := coalesce(need_payload->>'priority', 'medium');
    IF char_length(title) NOT BETWEEN 3 AND 180
       OR coalesce(category, '') NOT IN ('health','livelihood','education','infrastructure','environment')
       OR priority NOT IN ('low','medium','high','critical')
       OR char_length(description) > 2000 THEN
      RAISE EXCEPTION 'invalid need fields' USING ERRCODE = '22023';
    END IF;
    IF need_payload ? 'affected_count' AND need_payload->'affected_count' <> 'null'::jsonb THEN
      IF jsonb_typeof(need_payload->'affected_count') <> 'number'
         OR need_payload->>'affected_count' !~ '^\d+$'
         OR char_length(need_payload->>'affected_count') > 7 THEN
        RAISE EXCEPTION 'invalid affected count' USING ERRCODE = '22023';
      END IF;
      affected := (need_payload->>'affected_count')::integer;
      IF affected > 1000000 THEN
        RAISE EXCEPTION 'invalid affected count' USING ERRCODE = '22023';
      END IF;
    ELSE
      affected := NULL;
    END IF;
      expected_affected := CASE WHEN indicator->>'unit' = 'resident'
        THEN coalesce(yes_value, lower_bound)::integer ELSE NULL END;
      IF affected IS DISTINCT FROM expected_affected THEN
        RAISE EXCEPTION 'affected count must match the aggregate indicator' USING ERRCODE = '22023';
      END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.barangays barangay
      WHERE barangay.id = cycle.barangay_id AND barangay.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'active barangay required' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.users secretary
      WHERE secretary.barangay_id = cycle.barangay_id
        AND secretary.role = 'barangay_secretary'
        AND secretary.status = 'active'
        AND secretary.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'barangay requires an active Secretary' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.community_needs(
      submitted_by, barangay_id, need_description, title, description,
      category, priority, affected_count, assessment_date, identified_date,
      resolved, status, approval_status, approved_by, approved_at, source
    ) VALUES (
      auth.uid(), cycle.barangay_id, coalesce(nullif(btrim(description), ''), title), title, description,
      category, priority, affected, current_date, current_date,
      false, 'identified', 'pending_paraya_review', NULL, NULL, 'household_profile'
    ) RETURNING id INTO need_id;

    INSERT INTO public.community_need_suggestion_decisions(
      fingerprint, barangay_id, cycle_id, evidence_snapshot_id, indicator_code,
      decision, need_id, evidence, policy, decided_by
    ) VALUES (
      v_fingerprint, cycle.barangay_id, cycle.id, snapshot.id, v_indicator_code,
      'accepted', need_id, evidence, policy_payload, auth.uid()
    ) RETURNING id INTO decision_id;

    INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
    VALUES (
      auth.uid(), 'community_need.submitted', 'community_need', need_id::text,
      jsonb_build_object('status','pending_paraya_review','source','household_profile','suggestion_fingerprint',v_fingerprint)
    );
    INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
    VALUES (
      auth.uid(), 'community_need.suggestion_accepted', 'community_need_suggestion', decision_id::text,
      jsonb_build_object('fingerprint',v_fingerprint,'indicator_code',v_indicator_code,'cycle_id',cycle.id,'evidence_snapshot_id',snapshot.id)
    );
    RETURN jsonb_build_object('needId', need_id, 'decisionId', decision_id);
  END IF;

  IF p_payload ? 'need' AND p_payload->'need' IS NOT NULL AND p_payload->'need' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'dismissal cannot include a need' USING ERRCODE = '22023';
  END IF;
  -- NULL NOT IN (...) is NULL, so a missing reason must be rejected explicitly.
  IF reason_code IS NULL
     OR reason_code NOT IN ('not_a_priority','already_addressed','data_quality_concern','outside_paraya_scope','duplicate_of_existing_need','other') THEN
    RAISE EXCEPTION 'dismissal reason is required' USING ERRCODE = '22023';
  END IF;
  IF reason_code = 'other' AND char_length(coalesce(note, '')) < 3 THEN
    RAISE EXCEPTION 'dismissal note is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.community_need_suggestion_decisions(
    fingerprint, barangay_id, cycle_id, evidence_snapshot_id, indicator_code,
    decision, reason_code, note, evidence, policy, decided_by
  ) VALUES (
    v_fingerprint, cycle.barangay_id, cycle.id, snapshot.id, v_indicator_code,
    'dismissed', reason_code, note, evidence, policy_payload, auth.uid()
  ) RETURNING id INTO decision_id;
  INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
  VALUES (
    auth.uid(), 'community_need.suggestion_dismissed', 'community_need_suggestion', decision_id::text,
    jsonb_build_object('fingerprint',v_fingerprint,'indicator_code',v_indicator_code,'cycle_id',cycle.id,'reason_code',reason_code)
  );
  RETURN jsonb_build_object('decisionId', decision_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.cna_decide_need_suggestion(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cna_decide_need_suggestion(jsonb) TO authenticated;

COMMIT;
