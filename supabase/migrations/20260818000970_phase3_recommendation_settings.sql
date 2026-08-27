-- Director-managed advisory recommendation threshold. This setting cannot
-- activate automation or mutate proposal workflow.
BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.ai_recommendation_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  sufficient_coverage_percent smallint NOT NULL DEFAULT 80
    CHECK(sufficient_coverage_percent BETWEEN 1 AND 100),
  row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
  updated_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_recommendation_settings(id,sufficient_coverage_percent)
VALUES(true,80) ON CONFLICT(id) DO NOTHING;

ALTER TABLE public.ai_recommendation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendation_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_recommendation_settings FROM anon,authenticated;
GRANT SELECT ON public.ai_recommendation_settings TO service_role;
CREATE POLICY ai_recommendation_settings_rpc_only
  ON public.ai_recommendation_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING(false) WITH CHECK(false);

CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT public.phase1_role_has_capability(p_role,p_capability) OR CASE
  WHEN p_role='paraya_director' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.category.manage',
   'ai.recommendation.review','ai.recommendation.configure'])
  WHEN p_role='paraya_associate' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','proposal.submit','proposal.handoff','budget.read','budget.prepare','budget.actual.record'])
  WHEN p_role='paraya_researcher' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'ai.recommendation.review'])
  WHEN p_role='finance_officer' THEN p_capability=ANY(ARRAY['budget.read','budget.review','budget.liquidation.review'])
  WHEN p_role IN('barangay_captain','barangay_secretary') THEN p_capability='historical_program.read'
  ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase3_update_recommendation_settings(
  p_sufficient_coverage_percent integer,
  p_expected_version bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  actor public.users;
  current_settings public.ai_recommendation_settings;
  saved public.ai_recommendation_settings;
BEGIN
  SELECT * INTO actor FROM public.users u WHERE u.id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE
     OR actor.role<>'paraya_director'
     OR NOT public.phase2_current_has_capability('ai.recommendation.configure') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_sufficient_coverage_percent IS NULL OR p_sufficient_coverage_percent NOT BETWEEN 1 AND 100
     OR p_expected_version IS NULL OR p_expected_version<1 THEN
    RAISE EXCEPTION 'invalid recommendation settings' USING ERRCODE='22023';
  END IF;

  SELECT * INTO current_settings FROM public.ai_recommendation_settings WHERE id=true FOR UPDATE;
  IF current_settings.id IS NULL THEN
    RAISE EXCEPTION 'recommendation settings are unavailable' USING ERRCODE='P0002';
  END IF;
  IF current_settings.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'stale recommendation settings version' USING ERRCODE='40001';
  END IF;

  UPDATE public.ai_recommendation_settings
  SET sufficient_coverage_percent=p_sufficient_coverage_percent,
      row_version=row_version+1,
      updated_by=actor.id,
      updated_at=now()
  WHERE id=true RETURNING * INTO saved;

  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata)
  VALUES(
    actor.id,actor.email,'ai.recommendation.settings.updated','ai_recommendation_settings','singleton',
    jsonb_build_object(
      'previous_sufficient_coverage_percent',current_settings.sufficient_coverage_percent,
      'sufficient_coverage_percent',saved.sufficient_coverage_percent,
      'previous_row_version',current_settings.row_version,
      'row_version',saved.row_version
    )
  );

  RETURN jsonb_build_object(
    'sufficientCoveragePercent',saved.sufficient_coverage_percent,
    'rowVersion',saved.row_version,
    'updatedAt',saved.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_role_has_capability(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase3_update_recommendation_settings(integer,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase3_update_recommendation_settings(integer,bigint) TO authenticated;

COMMIT;
