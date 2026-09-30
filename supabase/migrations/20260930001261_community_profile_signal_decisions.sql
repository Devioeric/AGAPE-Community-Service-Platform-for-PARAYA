ALTER TABLE public.community_needs DROP CONSTRAINT community_needs_source_check;
ALTER TABLE public.community_needs ADD CONSTRAINT community_needs_source_check
  CHECK (source IN ('survey', 'assembly', 'household_profile', 'community_profile'));

CREATE TABLE public.community_profile_signal_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.barangay_community_profiles(id) ON DELETE RESTRICT,
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  profile_updated_at timestamptz NOT NULL,
  rule_code text NOT NULL CHECK (rule_code ~ '^[a-z_]{2,60}$'),
  policy text NOT NULL CHECK (policy = 'cna.profile-signals.v1'),
  decision text NOT NULL CHECK (decision IN ('accept', 'dismiss')),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 1000),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  need_id uuid REFERENCES public.community_needs(id) ON DELETE RESTRICT,
  decided_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, profile_updated_at, rule_code),
  CHECK ((decision = 'accept' AND need_id IS NOT NULL AND reason IS NULL)
      OR (decision = 'dismiss' AND need_id IS NULL AND reason IS NOT NULL))
);

ALTER TABLE public.community_profile_signal_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phase0_active_account_guard ON public.community_profile_signal_decisions;
CREATE POLICY phase0_active_account_guard ON public.community_profile_signal_decisions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.phase0_current_account_is_active())) WITH CHECK ((SELECT public.phase0_current_account_is_active()));
DROP POLICY IF EXISTS phase1_rpc_only ON public.community_profile_signal_decisions;
CREATE POLICY phase1_rpc_only ON public.community_profile_signal_decisions FOR ALL TO authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.community_profile_signal_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.community_profile_signal_decisions TO service_role;

CREATE OR REPLACE FUNCTION public.cna_record_profile_signal_decision(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE profile public.barangay_community_profiles%ROWTYPE; decision_value text := p_payload->>'decision'; new_need_id uuid; new_decision_id uuid;
BEGIN
  SELECT * INTO profile FROM public.barangay_community_profiles WHERE id = (p_payload->>'profile_id')::uuid FOR SHARE;
  IF NOT FOUND OR profile.updated_at IS DISTINCT FROM (p_payload->>'profile_updated_at')::timestamptz THEN RAISE EXCEPTION 'community profile changed' USING ERRCODE = '40001'; END IF;
  IF decision_value = 'accept' THEN
    INSERT INTO public.community_needs(submitted_by, barangay_id, need_description, title, description, category, priority, affected_count, assessment_date, identified_date, resolved, status, approval_status, approved_by, approved_at, source)
    VALUES ((p_payload->>'decided_by')::uuid, profile.barangay_id, p_payload->>'description', p_payload->>'title', p_payload->>'description', p_payload->>'category', p_payload->>'priority', nullif(p_payload->>'affected_count', '')::integer, current_date, current_date, false, 'identified', 'pending_paraya_review', NULL, NULL, 'community_profile') RETURNING id INTO new_need_id;
  END IF;
  INSERT INTO public.community_profile_signal_decisions(profile_id, barangay_id, profile_updated_at, rule_code, policy, decision, reason, evidence, need_id, decided_by)
  VALUES (profile.id, profile.barangay_id, profile.updated_at, p_payload->>'rule_code', 'cna.profile-signals.v1', decision_value, CASE WHEN decision_value = 'dismiss' THEN btrim(p_payload->>'reason') END, p_payload->'evidence', new_need_id, (p_payload->>'decided_by')::uuid) RETURNING id INTO new_decision_id;
  RETURN jsonb_build_object('decision_id', new_decision_id, 'need_id', new_need_id);
END; $$;
REVOKE ALL ON FUNCTION public.cna_record_profile_signal_decision(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cna_record_profile_signal_decision(jsonb) TO service_role;
