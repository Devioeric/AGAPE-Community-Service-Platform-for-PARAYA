-- Expand phase for the 2026-09-03 confirmed Barangay role consolidation.
-- This migration is additive: historical role values and Captain endorsement
-- fields remain intact while the neutral PARAYA-review and Secretary-
-- acknowledgment contracts are introduced.
BEGIN;

SET LOCAL search_path = public, extensions, pg_catalog;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE public.community_needs
  DROP CONSTRAINT IF EXISTS community_needs_approval_status_check;
ALTER TABLE public.community_needs
  ADD CONSTRAINT community_needs_approval_status_check
  CHECK (approval_status IN (
    'pending_captain', 'pending_paraya_review', 'approved', 'rejected', 'needs_revision'
  ));

CREATE TABLE IF NOT EXISTS public.community_need_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_need_id uuid NOT NULL REFERENCES public.community_needs(id) ON DELETE RESTRICT,
  previous_status text NOT NULL,
  resulting_status text NOT NULL CHECK (resulting_status IN ('approved','rejected','needs_revision')),
  reviewer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (notes IS NULL OR char_length(btrim(notes)) BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS community_need_review_events_need_created_idx
  ON public.community_need_review_events(community_need_id, created_at DESC);

ALTER TABLE public.community_need_review_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_need_review_events_read ON public.community_need_review_events;
CREATE POLICY community_need_review_events_read
  ON public.community_need_review_events
  FOR SELECT TO authenticated
  USING (
    public.phase0_current_account_is_active()
    AND EXISTS (
      SELECT 1
      FROM public.users actor
      JOIN public.community_needs need ON need.id = community_need_review_events.community_need_id
      WHERE actor.id = auth.uid()
        AND (
          actor.role IN ('paraya_director','paraya_associate','paraya_researcher')
          OR (actor.role = 'barangay_secretary' AND actor.barangay_id = need.barangay_id)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_community_need_review_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
  RAISE EXCEPTION 'community need review events are append-only' USING ERRCODE='42501';
END;
$function$;
DROP TRIGGER IF EXISTS community_need_review_events_append_only ON public.community_need_review_events;
CREATE TRIGGER community_need_review_events_append_only
BEFORE UPDATE OR DELETE ON public.community_need_review_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_community_need_review_event_mutation();
REVOKE ALL ON FUNCTION public.prevent_community_need_review_event_mutation() FROM PUBLIC,anon,authenticated;

ALTER TABLE public.profiling_cycles
  ADD COLUMN IF NOT EXISTS barangay_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS barangay_acknowledged_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS barangay_acknowledgment_note text;
ALTER TABLE public.profiling_cycles
  DROP CONSTRAINT IF EXISTS profiling_cycles_barangay_acknowledgment_note_check;
ALTER TABLE public.profiling_cycles
  ADD CONSTRAINT profiling_cycles_barangay_acknowledgment_note_check
  CHECK (
    barangay_acknowledgment_note IS NULL
    OR char_length(btrim(barangay_acknowledgment_note)) BETWEEN 1 AND 500
  );
ALTER TABLE public.profiling_cycles
  DROP CONSTRAINT IF EXISTS profiling_cycles_barangay_acknowledgment_pair_check;
ALTER TABLE public.profiling_cycles
  ADD CONSTRAINT profiling_cycles_barangay_acknowledgment_pair_check
  CHECK (
    (barangay_acknowledged_at IS NULL AND barangay_acknowledged_by IS NULL
      AND barangay_acknowledgment_note IS NULL)
    OR (barangay_acknowledged_at IS NOT NULL AND barangay_acknowledged_by IS NOT NULL)
  );

ALTER TABLE public.profiling_submissions
  ADD COLUMN IF NOT EXISTS current_editor_id uuid REFERENCES public.users(id) ON DELETE RESTRICT;

-- A null actor is reserved for explicit system-attributed cutover events.
ALTER TABLE public.profiling_events
  ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.profiling_events
  DROP CONSTRAINT IF EXISTS profiling_events_actor_or_system_check;
ALTER TABLE public.profiling_events
  ADD CONSTRAINT profiling_events_actor_or_system_check
  CHECK (actor_id IS NOT NULL OR metadata @> '{"system_attributed":true}'::jsonb);

UPDATE public.profiling_submissions submission
SET current_editor_id = submission.created_by
WHERE submission.current_editor_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.users creator
    WHERE creator.id = submission.created_by
      AND creator.status = 'active'
      AND creator.is_active IS TRUE
      AND creator.role NOT IN ('barangay_captain','barangay_mother_leader','barangay_official')
  );

CREATE OR REPLACE FUNCTION public.set_profiling_submission_current_editor()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
  NEW.current_editor_id := coalesce(NEW.current_editor_id, NEW.created_by);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS profiling_submission_current_editor_default ON public.profiling_submissions;
CREATE TRIGGER profiling_submission_current_editor_default
BEFORE INSERT ON public.profiling_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_profiling_submission_current_editor();
REVOKE ALL ON FUNCTION public.set_profiling_submission_current_editor() FROM PUBLIC,anon,authenticated;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_retired_barangay_role_inactive_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_retired_barangay_role_inactive_check
  CHECK (
    role NOT IN ('barangay_captain','barangay_mother_leader','barangay_official')
    OR (status = 'suspended' AND is_active IS FALSE)
  ) NOT VALID;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_active_secretary_barangay_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_active_secretary_barangay_check
  CHECK (
    role <> 'barangay_secretary'
    OR status <> 'active'
    OR is_active IS FALSE
    OR barangay_id IS NOT NULL
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.phase1_claim_profiling_submission(
  p_submission_id uuid,
  p_expected_version integer,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  submission public.profiling_submissions%ROWTYPE;
  cycle public.profiling_cycles%ROWTYPE;
  previous_editor uuid;
  new_version integer;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions
  WHERE id=p_submission_id FOR UPDATE;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,submission.sitio_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id=auth.uid() AND role='barangay_secretary'
      AND status='active' AND is_active IS TRUE
  ) THEN RAISE EXCEPTION 'only an active Barangay Secretary may claim a package' USING ERRCODE='42501'; END IF;
  IF submission.status NOT IN ('draft','returned') OR submission.row_version<>p_expected_version THEN
    RAISE EXCEPTION 'stale or invalid submission state' USING ERRCODE='40001';
  END IF;
  IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'handoff reason must contain 3 to 500 characters' USING ERRCODE='22023';
  END IF;
  IF submission.current_editor_id=auth.uid() THEN RETURN submission.row_version; END IF;
  IF submission.current_editor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users current_editor
    WHERE current_editor.id=submission.current_editor_id
      AND current_editor.status='active' AND current_editor.is_active IS TRUE
      AND current_editor.role NOT IN ('barangay_captain','barangay_mother_leader','barangay_official')
  ) THEN RAISE EXCEPTION 'package already has an active editor' USING ERRCODE='42501'; END IF;
  previous_editor:=submission.current_editor_id;
  UPDATE public.profiling_submissions
  SET current_editor_id=auth.uid(),row_version=row_version+1,updated_at=now()
  WHERE id=p_submission_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(
    cycle_id,submission_id,household_id,event_type,reason,metadata,actor_id
  ) VALUES(
    submission.cycle_id,submission.id,submission.household_id,'submission_editor_handoff',
    btrim(p_reason),jsonb_build_object('previous_editor_id',previous_editor,'new_editor_id',auth.uid()),auth.uid()
  );
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_acknowledge_profiling_cycle(
  p_cycle_id uuid,
  p_expected_version integer,
  p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; new_version integer;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.acknowledge',cycle.barangay_id,NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id=auth.uid() AND role='barangay_secretary'
      AND status='active' AND is_active IS TRUE
  ) THEN RAISE EXCEPTION 'only an active Barangay Secretary may acknowledge a cycle' USING ERRCODE='42501'; END IF;
  IF cycle.status NOT IN ('completed','archived')
     OR cycle.row_version<>p_expected_version
     OR cycle.barangay_acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'cycle cannot be acknowledged' USING ERRCODE='40001';
  END IF;
  IF p_note IS NOT NULL AND char_length(btrim(p_note)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'acknowledgment note must contain 1 to 500 characters' USING ERRCODE='22023';
  END IF;
  UPDATE public.profiling_cycles
  SET barangay_acknowledged_at=now(),barangay_acknowledged_by=auth.uid(),
      barangay_acknowledgment_note=nullif(btrim(p_note),''),
      row_version=row_version+1,updated_at=now()
  WHERE id=p_cycle_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,event_type,metadata,actor_id)
  VALUES(p_cycle_id,'barangay_acknowledged',jsonb_build_object('non_blocking',true),auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_decide_community_need(
  p_community_need_id uuid,
  p_decision text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE actor public.users%ROWTYPE; need public.community_needs%ROWTYPE; next_status text;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.role<>'paraya_researcher'
     OR actor.status<>'active' OR actor.is_active IS NOT TRUE
     OR NOT public.phase1_current_has_capability('community_need.validate') THEN
    RAISE EXCEPTION 'only an active PARAYA Researcher may review a community need' USING ERRCODE='42501';
  END IF;
  SELECT * INTO need FROM public.community_needs WHERE id=p_community_need_id FOR UPDATE;
  IF need.id IS NULL THEN RAISE EXCEPTION 'community need not found' USING ERRCODE='P0002'; END IF;
  IF need.approval_status<>'pending_paraya_review' THEN
    RAISE EXCEPTION 'community need is not awaiting PARAYA review' USING ERRCODE='40001';
  END IF;
  IF need.submitted_by=auth.uid() THEN
    RAISE EXCEPTION 'a submitter cannot review their own community need' USING ERRCODE='42501';
  END IF;
  IF p_decision NOT IN ('approve','needs_revision','reject') THEN
    RAISE EXCEPTION 'invalid community need decision' USING ERRCODE='22023';
  END IF;
  IF p_decision IN ('needs_revision','reject')
     AND char_length(btrim(coalesce(p_notes,''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'review notes are required' USING ERRCODE='22023';
  END IF;
  IF p_notes IS NOT NULL AND char_length(btrim(p_notes))>1000 THEN
    RAISE EXCEPTION 'review notes exceed 1000 characters' USING ERRCODE='22023';
  END IF;
  next_status:=CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'needs_revision' THEN 'needs_revision' ELSE 'rejected' END;
  UPDATE public.community_needs
  SET approval_status=next_status,
      approved_by=CASE WHEN next_status='approved' THEN auth.uid() ELSE NULL END,
      approved_at=CASE WHEN next_status='approved' THEN now() ELSE NULL END,
      approval_notes=nullif(btrim(p_notes),''),updated_at=now()
  WHERE id=need.id;
  INSERT INTO public.community_need_review_events(
    community_need_id,previous_status,resulting_status,reviewer_id,notes
  ) VALUES(need.id,need.approval_status,next_status,auth.uid(),nullif(btrim(p_notes),''));
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  VALUES(actor.id,actor.email,'Community need reviewed','community_needs',need.id::text,'info',
    jsonb_build_object('from',need.approval_status,'to',next_status));
  RETURN jsonb_build_object('id',need.id,'status',next_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_resubmit_community_need(
  p_community_need_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE actor public.users%ROWTYPE; need public.community_needs%ROWTYPE;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.role<>'barangay_secretary'
     OR actor.status<>'active' OR actor.is_active IS NOT TRUE
     OR actor.barangay_id IS NULL
     OR NOT public.phase1_current_has_capability('community_need.submit') THEN
    RAISE EXCEPTION 'only an active Barangay Secretary may resubmit a community need' USING ERRCODE='42501';
  END IF;
  SELECT * INTO need FROM public.community_needs WHERE id=p_community_need_id FOR UPDATE;
  IF need.id IS NULL THEN RAISE EXCEPTION 'community need not found' USING ERRCODE='P0002'; END IF;
  IF need.barangay_id IS DISTINCT FROM actor.barangay_id OR need.submitted_by IS DISTINCT FROM actor.id THEN
    RAISE EXCEPTION 'community need is outside the Secretary submission scope' USING ERRCODE='42501';
  END IF;
  IF need.approval_status<>'needs_revision' OR need.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'stale or invalid community need state' USING ERRCODE='40001';
  END IF;
  IF NOT public.phase1_json_object_has_only(
       p_payload,ARRAY['category','title','description','priority','affected_count','sitio']
     )
     OR coalesce(p_payload->>'category','') NOT IN ('health','livelihood','education','infrastructure','environment')
     OR char_length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 3 AND 180
     OR char_length(btrim(coalesce(p_payload->>'description',''))) NOT BETWEEN 10 AND 2000
     OR coalesce(p_payload->>'priority','') NOT IN ('low','medium','high','critical')
     OR (p_payload ? 'affected_count' AND p_payload->'affected_count'<>'null'::jsonb AND (
       jsonb_typeof(p_payload->'affected_count')<>'number'
       OR (p_payload->>'affected_count')!~'^[0-9]+$'
       OR (p_payload->>'affected_count')::numeric>1000000
     ))
     OR char_length(btrim(coalesce(p_payload->>'sitio',''))) > 120 THEN
    RAISE EXCEPTION 'invalid community need revision' USING ERRCODE='22023';
  END IF;
  UPDATE public.community_needs SET
    category=btrim(p_payload->>'category'),
    title=btrim(p_payload->>'title'),
    description=nullif(btrim(p_payload->>'description'),''),
    priority=p_payload->>'priority',
    affected_count=CASE WHEN p_payload ? 'affected_count' AND p_payload->'affected_count'<>'null'::jsonb THEN (p_payload->>'affected_count')::integer ELSE NULL END,
    sitio=nullif(btrim(p_payload->>'sitio'),''),
    approval_status='pending_paraya_review',
    approved_by=NULL,approved_at=NULL,approval_notes=NULL,updated_at=now()
  WHERE id=need.id;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  VALUES(actor.id,actor.email,'Community need revised and resubmitted','community_needs',need.id::text,'info',
    jsonb_build_object('from','needs_revision','to','pending_paraya_review'));
  RETURN jsonb_build_object('id',need.id,'status','pending_paraya_review');
END;
$function$;

REVOKE ALL ON FUNCTION public.phase1_claim_profiling_submission(uuid,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_acknowledge_profiling_cycle(uuid,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_decide_community_need(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_resubmit_community_need(uuid,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase1_claim_profiling_submission(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_acknowledge_profiling_cycle(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_decide_community_need(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_resubmit_community_need(uuid,timestamptz,jsonb) TO authenticated;

COMMIT;
