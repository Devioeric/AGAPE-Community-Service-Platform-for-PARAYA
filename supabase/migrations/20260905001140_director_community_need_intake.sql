BEGIN;

-- All human intake, including PARAYA-managed intake, awaits independent review.
-- Optional observation promotion is one atomic transaction, never two UI writes.
CREATE OR REPLACE FUNCTION public.phase1_create_community_need(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; observation public.field_observations%ROWTYPE;
  v_barangay_id uuid; observation_id uuid; need_id uuid; affected integer;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF NOT public.phase0_current_account_is_active()
     OR NOT (public.phase1_current_has_capability('community_need.submit')
       OR public.phase1_current_has_capability('community_need.manage')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'invalid need' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN
    ('barangay_id','category','title','description','priority','affected_count','sitio','observation_id'))
    OR char_length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 3 AND 180
    OR coalesce(p_payload->>'category','') NOT IN('health','livelihood','education','infrastructure','environment')
    OR coalesce(p_payload->>'priority','medium') NOT IN('low','medium','high','critical')
    OR char_length(coalesce(p_payload->>'description',''))>2000
    OR char_length(coalesce(p_payload->>'sitio',''))>120 THEN
    RAISE EXCEPTION 'invalid need fields' USING ERRCODE='22023';
  END IF;
  IF actor.role='barangay_secretary' THEN
    v_barangay_id:=actor.barangay_id;
    IF nullif(p_payload->>'barangay_id','')::uuid IS NOT NULL
       AND (p_payload->>'barangay_id')::uuid IS DISTINCT FROM v_barangay_id THEN
      RAISE EXCEPTION 'cross-barangay intake denied' USING ERRCODE='42501';
    END IF;
  ELSE
    v_barangay_id:=nullif(p_payload->>'barangay_id','')::uuid;
  END IF;
  IF v_barangay_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=v_barangay_id AND b.is_active IS TRUE) THEN
    RAISE EXCEPTION 'active barangay required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.barangay_id=v_barangay_id
      AND u.role='barangay_secretary' AND u.status='active' AND u.is_active IS TRUE) THEN
    RAISE EXCEPTION 'barangay requires an active Secretary' USING ERRCODE='23514';
  END IF;
  IF p_payload->>'affected_count' IS NOT NULL THEN
    IF (p_payload->>'affected_count') !~ '^\d+$' OR char_length(p_payload->>'affected_count')>7 THEN RAISE EXCEPTION 'invalid affected count' USING ERRCODE='22023'; END IF;
    affected:=(p_payload->>'affected_count')::integer;
    IF affected>1000000 THEN RAISE EXCEPTION 'invalid affected count' USING ERRCODE='22023'; END IF;
  END IF;
  observation_id:=nullif(p_payload->>'observation_id','')::uuid;
  IF observation_id IS NOT NULL THEN
    IF NOT public.phase1_current_has_capability('observation.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
    SELECT * INTO observation FROM public.field_observations WHERE id=observation_id FOR UPDATE;
    IF observation.id IS NULL OR observation.barangay_id IS DISTINCT FROM v_barangay_id THEN
      RAISE EXCEPTION 'observation target mismatch' USING ERRCODE='22023';
    END IF;
    IF observation.promoted_to_need_id IS NOT NULL THEN
      RAISE EXCEPTION 'observation already promoted' USING ERRCODE='40001';
    END IF;
  END IF;
  INSERT INTO public.community_needs(submitted_by,barangay_id,category,title,description,priority,affected_count,sitio,approval_status,approved_by,approved_at)
    VALUES(actor.id,v_barangay_id,p_payload->>'category',btrim(p_payload->>'title'),p_payload->>'description',
      coalesce(p_payload->>'priority','medium'),affected,nullif(btrim(p_payload->>'sitio'),''),'pending_paraya_review',NULL,NULL)
    RETURNING id INTO need_id;
  IF observation_id IS NOT NULL THEN
    UPDATE public.field_observations SET promoted_to_need_id=need_id,updated_at=now() WHERE id=observation_id;
  END IF;
  INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
    VALUES(actor.id,'community_need.submitted','community_need',need_id::text,
      jsonb_build_object('status','pending_paraya_review','observation_id',observation_id));
  RETURN need_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.phase1_create_community_need(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase1_create_community_need(jsonb) TO authenticated;

-- Existing promotion links are historical evidence, not arbitrary editable IDs.
CREATE OR REPLACE FUNCTION public.phase1_guard_observation_need_link()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
  IF OLD.promoted_to_need_id IS NOT NULL AND
    (NEW.promoted_to_need_id IS DISTINCT FROM OLD.promoted_to_need_id OR NEW.barangay_id IS DISTINCT FROM OLD.barangay_id) THEN
    RAISE EXCEPTION 'linked observation attribution is retained' USING ERRCODE='23514';
  END IF;
  IF NEW.promoted_to_need_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.community_needs n WHERE n.id=NEW.promoted_to_need_id AND n.barangay_id=NEW.barangay_id
  ) THEN RAISE EXCEPTION 'observation need target mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER phase1_observation_need_link_guard BEFORE UPDATE ON public.field_observations
  FOR EACH ROW EXECUTE FUNCTION public.phase1_guard_observation_need_link();
COMMIT;
