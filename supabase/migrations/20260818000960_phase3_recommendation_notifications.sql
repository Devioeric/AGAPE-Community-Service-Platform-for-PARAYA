-- Disabled-by-default, in-app-only delivery boundary for advisory recommendations.
-- The server computes recommendations; this function validates their material
-- identifiers, derives current human review state, and inserts notices atomically.
BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- The compatibility UI and existing notification callers already use this
-- field. Add it forward-only because the reconciled baseline did not contain it.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS action_url text;

CREATE TABLE public.ai_recommendation_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id uuid NOT NULL REFERENCES public.community_needs(id) ON DELETE RESTRICT,
  recommendation_schema text NOT NULL DEFAULT 'agape.ai.need-recommendations.v2',
  recommendation_fingerprint text NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_recommendation_notification_schema_check
    CHECK (recommendation_schema='agape.ai.need-recommendations.v2'),
  CONSTRAINT ai_recommendation_notification_fingerprint_check
    CHECK (recommendation_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_recommendation_notification_delivery_unique
    UNIQUE(need_id,recommendation_fingerprint,recipient_user_id)
);

CREATE INDEX ai_recommendation_notification_need_idx
  ON public.ai_recommendation_notification_deliveries(need_id,created_at DESC);
CREATE INDEX ai_recommendation_notification_recipient_idx
  ON public.ai_recommendation_notification_deliveries(recipient_user_id,created_at DESC);

CREATE TRIGGER ai_recommendation_notification_deliveries_immutable
  BEFORE UPDATE OR DELETE ON public.ai_recommendation_notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

ALTER TABLE public.ai_recommendation_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendation_notification_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_recommendation_notification_deliveries FROM anon,authenticated;
CREATE POLICY ai_recommendation_notification_deliveries_service_only
  ON public.ai_recommendation_notification_deliveries AS RESTRICTIVE
  FOR ALL TO authenticated USING(false) WITH CHECK(false);

CREATE OR REPLACE FUNCTION public.phase3_sync_recommendation_notifications(
  p_mode text,
  p_recommendations jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  item jsonb;
  need public.community_needs;
  barangay public.barangays;
  review public.ai_recommendation_reviews;
  recipient public.users;
  notification_id uuid;
  expected_priority text;
  current_review_action text;
  created_count integer:=0;
  eligible_count integer:=0;
  dismissed_count integer:=0;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_mode NOT IN('synthetic','live') OR jsonb_typeof(p_recommendations)<>'array'
     OR jsonb_array_length(p_recommendations)>100 THEN
    RAISE EXCEPTION 'invalid recommendation notification batch' USING ERRCODE='22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_recommendations)
  LOOP
    IF jsonb_typeof(item)<>'object'
       OR (SELECT count(*) FROM jsonb_object_keys(item))<>3
       OR EXISTS(
         SELECT 1 FROM jsonb_object_keys(item) key
         WHERE key NOT IN('needId','recommendationFingerprint','priorityLabel')
       )
       OR coalesce(item->>'needId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR coalesce(item->>'recommendationFingerprint','') !~ '^[0-9a-f]{64}$'
       OR coalesce(item->>'priorityLabel','') NOT IN('critical','high','medium','low') THEN
      RAISE EXCEPTION 'invalid recommendation notification item' USING ERRCODE='22023';
    END IF;

    SELECT n.* INTO need FROM public.community_needs n
    WHERE n.id=(item->>'needId')::uuid FOR SHARE;
    IF need.id IS NULL OR need.approval_status<>'approved' OR need.status='addressed' THEN
      RAISE EXCEPTION 'approved open need not found' USING ERRCODE='23514';
    END IF;
    SELECT b.* INTO barangay FROM public.barangays b WHERE b.id=need.barangay_id FOR SHARE;
    IF barangay.id IS NULL OR barangay.is_synthetic_test IS DISTINCT FROM (p_mode='synthetic') THEN
      RAISE EXCEPTION 'recommendation need is outside the active mode' USING ERRCODE='42501';
    END IF;

    expected_priority:=CASE
      WHEN coalesce(need.priority_score,3)>=5 THEN 'critical'
      WHEN coalesce(need.priority_score,3)>=4 THEN 'high'
      WHEN coalesce(need.priority_score,3)>=3 THEN 'medium'
      ELSE 'low'
    END;
    IF item->>'priorityLabel'<>expected_priority THEN
      RAISE EXCEPTION 'recommendation priority is stale or invalid' USING ERRCODE='40001';
    END IF;

    SELECT r.* INTO review FROM public.ai_recommendation_reviews r
    WHERE r.need_id=need.id ORDER BY r.event_sequence DESC LIMIT 1;
    current_review_action:=CASE
      WHEN review.id IS NOT NULL
       AND review.recommendation_fingerprint=item->>'recommendationFingerprint'
      THEN review.action ELSE NULL END;
    IF current_review_action='dismissed' THEN
      dismissed_count:=dismissed_count+1;
      CONTINUE;
    END IF;
    eligible_count:=eligible_count+1;

    FOR recipient IN
      SELECT u.* FROM public.users u
      WHERE u.status='active' AND u.is_active IS TRUE
        AND u.is_synthetic_test IS NOT DISTINCT FROM (p_mode='synthetic')
        AND (
          u.role IN('paraya_researcher','paraya_associate')
          OR (u.role='paraya_director' AND (expected_priority='critical' OR current_review_action='endorsed'))
        )
        AND public.phase2_role_has_capability(u.role,'ai.assist')
        AND coalesce((u.permissions->>'ai_assistance')::boolean,true) IS NOT FALSE
      ORDER BY u.id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'ai-recommendation-notification:'||need.id::text||':'||(item->>'recommendationFingerprint')||':'||recipient.id::text,
        0
      ));
      IF EXISTS(
        SELECT 1 FROM public.ai_recommendation_notification_deliveries d
        WHERE d.need_id=need.id
          AND d.recommendation_fingerprint=item->>'recommendationFingerprint'
          AND d.recipient_user_id=recipient.id
      ) THEN CONTINUE; END IF;

      INSERT INTO public.notifications(user_id,title,message,type,is_read,channel,action_url)
      VALUES(
        recipient.id,
        'Community need recommendation ready',
        initcap(expected_priority)||' '||replace(need.category,'_',' ')||
          ' recommendation for '||barangay.name||' is ready for human review.',
        'alert',false,'in_app','/officer/analytics/recommendations'
      ) RETURNING id INTO notification_id;
      INSERT INTO public.ai_recommendation_notification_deliveries(
        need_id,recommendation_fingerprint,recipient_user_id,notification_id
      ) VALUES(
        need.id,item->>'recommendationFingerprint',recipient.id,notification_id
      );
      created_count:=created_count+1;
    END LOOP;
  END LOOP;

  IF created_count>0 THEN
    INSERT INTO public.audit_logs(action,resource_type,metadata)
    VALUES(
      'ai.recommendation.notifications.sync','community_need_aggregate',
      jsonb_build_object('mode',p_mode,'created',created_count,'eligible_recommendations',eligible_count,'dismissed',dismissed_count)
    );
  END IF;
  RETURN jsonb_build_object(
    'created',created_count,
    'eligibleRecommendations',eligible_count,
    'skippedDismissed',dismissed_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase3_sync_recommendation_notifications(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase3_sync_recommendation_notifications(text,jsonb) TO service_role;

COMMIT;
