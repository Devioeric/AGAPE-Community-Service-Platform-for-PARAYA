-- Durable, human-controlled review history for advisory need recommendations.
-- This migration does not enable any feature or proposal workflow transition.
BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.ai_recommendation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  need_id uuid NOT NULL REFERENCES public.community_needs(id) ON DELETE RESTRICT,
  recommendation_schema text NOT NULL DEFAULT 'agape.ai.need-recommendations.v2',
  recommendation_fingerprint text NOT NULL,
  action text NOT NULL,
  reason_code text,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_recommendation_reviews_schema_check
    CHECK (recommendation_schema='agape.ai.need-recommendations.v2'),
  CONSTRAINT ai_recommendation_reviews_fingerprint_check
    CHECK (recommendation_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_recommendation_reviews_action_check
    CHECK (action IN('endorsed','dismissed')),
  CONSTRAINT ai_recommendation_reviews_reason_check
    CHECK (
      (action='endorsed' AND reason_code IS NULL)
      OR (action='dismissed' AND reason_code IN(
        'insufficient_evidence',
        'duplicate_or_covered',
        'outside_current_scope',
        'data_quality_concern',
        'defer_until_next_cycle'
      ))
    )
);

CREATE INDEX ai_recommendation_reviews_need_latest_idx
  ON public.ai_recommendation_reviews(need_id,event_sequence DESC);
CREATE INDEX ai_recommendation_reviews_fingerprint_idx
  ON public.ai_recommendation_reviews(recommendation_fingerprint);

CREATE TRIGGER ai_recommendation_reviews_immutable
  BEFORE UPDATE OR DELETE ON public.ai_recommendation_reviews
  FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

ALTER TABLE public.ai_recommendation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendation_reviews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_recommendation_reviews FROM anon,authenticated;
REVOKE ALL ON SEQUENCE public.ai_recommendation_reviews_event_sequence_seq FROM PUBLIC,anon,authenticated;
CREATE POLICY ai_recommendation_reviews_rpc_only
  ON public.ai_recommendation_reviews AS RESTRICTIVE FOR ALL TO authenticated
  USING(false) WITH CHECK(false);

-- Keep SQL and TypeScript capability defaults aligned. The AI-assistance
-- module deny override can only subtract this role capability.
CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT public.phase1_role_has_capability(p_role,p_capability) OR CASE
  WHEN p_role='paraya_director' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.category.manage',
   'ai.recommendation.review'])
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

CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_table LIKE 'proposal_budget_%' OR p_table='budget_categories'
    OR p_table='budget_review_events' OR p_table LIKE 'program_budget_%'
    OR p_table LIKE 'program_financial_%' OR p_table='program_expenditures'
    OR p_table LIKE 'liquidation_%' OR p_table='program_finance_events' THEN 'budgets'
  WHEN p_table LIKE 'partner_contact%' OR p_table LIKE 'partnership_%'
    OR p_table LIKE 'partner_entit%' OR p_table='partner_type_policies'
    OR p_table='legacy_account_partner_mappings' THEN 'partnerships'
  WHEN p_table LIKE 'historical_program%' THEN 'historical_programs'
  WHEN p_table LIKE 'proposal%' OR p_table IN('project_proposals','project_templates') THEN 'proposals'
  WHEN p_table LIKE 'program%' OR p_table='activity_photos' THEN 'programs'
  WHEN p_table IN('phase2_component_runtime','phase2_release_attestations','phase2_cutover_state') THEN 'audit_logs'
  WHEN p_table='users' THEN 'user_management' WHEN p_table='audit_logs' THEN 'audit_logs'
  WHEN p_table IN('barangays','partnership_history') THEN 'partnerships'
  WHEN p_table LIKE 'volunteer%' THEN 'volunteers'
  WHEN p_table LIKE 'survey%' THEN 'surveys' WHEN p_table='community_needs' THEN 'community_needs'
  WHEN p_table='field_observations' THEN 'observations'
  WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets') THEN 'skills_assets'
  WHEN p_table='attendance' THEN 'attendance' WHEN p_table='activity_logs' THEN 'activity_logs'
  WHEN p_table LIKE 'donation%' THEN 'donations'
  WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' THEN 'impact'
  WHEN p_table LIKE 'analytics%' THEN 'analytics'
  WHEN p_table LIKE 'ai_recommendation%' THEN 'ai_assistance'
  WHEN p_table LIKE 'ai_report%' THEN 'reports'
  WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments') THEN 'communication'
  WHEN p_table='domain_correction_events' OR p_table LIKE 'phase2_storage_read_event%' THEN 'audit_logs'
  WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles','households','residents','household_memberships') THEN 'profiling'
  ELSE NULL
 END;
$function$;

CREATE OR REPLACE FUNCTION public.phase3_record_recommendation_review(
  p_need_id uuid,
  p_recommendation_fingerprint text,
  p_action text,
  p_reason_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  actor public.users;
  need public.community_needs;
  prior public.ai_recommendation_reviews;
  saved public.ai_recommendation_reviews;
BEGIN
  SELECT * INTO actor FROM public.users u WHERE u.id=auth.uid();
  IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE
     OR NOT public.phase2_current_has_capability('ai.recommendation.review') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_recommendation_fingerprint IS NULL OR p_recommendation_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_action NOT IN('endorsed','dismissed') THEN
    RAISE EXCEPTION 'invalid recommendation review' USING ERRCODE='22023';
  END IF;
  IF (p_action='endorsed' AND p_reason_code IS NOT NULL)
     OR (p_action='dismissed' AND (p_reason_code IS NULL OR p_reason_code NOT IN(
       'insufficient_evidence','duplicate_or_covered','outside_current_scope',
       'data_quality_concern','defer_until_next_cycle'))) THEN
    RAISE EXCEPTION 'invalid recommendation review reason' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ai-recommendation-review:'||p_need_id::text,0));
  SELECT * INTO need FROM public.community_needs n WHERE n.id=p_need_id FOR SHARE;
  IF need.id IS NULL THEN RAISE EXCEPTION 'approved need not found' USING ERRCODE='P0002'; END IF;
  IF need.approval_status<>'approved' OR need.status='addressed' THEN
    RAISE EXCEPTION 'only approved open needs can be reviewed' USING ERRCODE='23514';
  END IF;

  SELECT * INTO prior FROM public.ai_recommendation_reviews r
  WHERE r.need_id=p_need_id ORDER BY r.event_sequence DESC LIMIT 1;
  IF prior.id IS NOT NULL
     AND prior.recommendation_fingerprint=p_recommendation_fingerprint
     AND prior.action=p_action
     AND prior.reason_code IS NOT DISTINCT FROM p_reason_code THEN
    RETURN jsonb_build_object(
      'id',prior.id,'needId',prior.need_id,'recommendationFingerprint',prior.recommendation_fingerprint,
      'action',prior.action,'reasonCode',prior.reason_code,'reviewedAt',prior.created_at
    );
  END IF;

  INSERT INTO public.ai_recommendation_reviews(
    need_id,recommendation_fingerprint,action,reason_code,actor_id
  ) VALUES(
    p_need_id,p_recommendation_fingerprint,p_action,p_reason_code,actor.id
  ) RETURNING * INTO saved;

  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,metadata)
  VALUES(
    actor.id,actor.email,'ai.recommendation.'||p_action,'community_need',p_need_id::text,
    jsonb_build_object(
      'review_id',saved.id,
      'recommendation_schema',saved.recommendation_schema,
      'recommendation_fingerprint',saved.recommendation_fingerprint,
      'reason_code',saved.reason_code
    )
  );

  RETURN jsonb_build_object(
    'id',saved.id,'needId',saved.need_id,'recommendationFingerprint',saved.recommendation_fingerprint,
    'action',saved.action,'reasonCode',saved.reason_code,'reviewedAt',saved.created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_role_has_capability(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase3_record_recommendation_review(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase3_record_recommendation_review(uuid,text,text,text) TO authenticated;

COMMIT;
