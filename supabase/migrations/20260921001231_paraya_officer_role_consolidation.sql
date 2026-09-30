-- PARAYA Officer consolidation. This is additive and forward-only. Historical
-- role values remain valid for attribution, but only paraya_officer is active.

CREATE TABLE IF NOT EXISTS public.role_change_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_role text NOT NULL,
  canonical_user_id uuid NOT NULL REFERENCES public.users(id),
  source_roles text[] NOT NULL,
  source_account_ids uuid[] NOT NULL,
  backup_manifest_hash text NOT NULL,
  migration_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('started','completed','rolled_back','failed')),
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.role_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  previous_role text,
  new_role text,
  effective_start timestamptz NOT NULL DEFAULT now(),
  effective_end timestamptz,
  change_reason text NOT NULL,
  cutover_batch_id uuid REFERENCES public.role_change_batches(id),
  actor_id uuid REFERENCES public.users(id),
  source_status text,
  target_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS role_history_user_idx ON public.role_history(user_id, effective_start);
CREATE INDEX IF NOT EXISTS role_history_batch_idx ON public.role_history(cutover_batch_id);

ALTER TABLE public.role_change_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.phase0_current_account_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT EXISTS (SELECT 1 FROM public.users account WHERE account.id=auth.uid() AND account.status='active' AND account.is_active IS TRUE
   AND account.role IN ('paraya_officer','finance_officer','barangay_secretary','volunteer','admin'));
$function$;

CREATE OR REPLACE FUNCTION public.phase1_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_role='paraya_officer' THEN p_capability IN (
   'partnership.read','partnership.manage','partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.read','proposal.create','proposal.review','proposal.validation.record','proposal.decide','proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff',
   'program.read','program.manage','budget.read','budget.prepare','budget.actual.record','budget.category.manage','integrity.finance.read','integrity.finance.request',
   'volunteer.directory.read','volunteer.manage','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review',
   'survey.read','survey.manage','survey.analyze','community_need.read','community_need.submit','community_need.validate','community_need.manage','observation.read','observation.manage','skill_asset.read','skill_asset.manage','attendance.manage','activity_log.manage','donation.read','donation.manage','impact.read','impact.manage','analytics.aggregate.read','report.read','report.manage','communication.read','communication.write','communication.manage','communication.moderate','ai.assist','ai.recommendation.review','ai.recommendation.configure',
   'profiling.cycle.manage','profiling.collect','profiling.validate','profiling.acknowledge','profiling.endorse','profiling.detail.read','profiling.aggregate.read','profiling.privacy.configure')
  WHEN p_role='finance_officer' THEN p_capability IN('proposal.read','proposal.finance','budget.read','budget.review','budget.liquidation.review','integrity.finance.read','integrity.finance.request')
  WHEN p_role='volunteer' THEN p_capability IN('program.read','volunteer.self','volunteer.preferences.manage','survey.read','survey.respond','attendance.self','activity_log.self','communication.read','communication.write','ai.assist')
  WHEN p_role='barangay_secretary' THEN p_capability IN('partnership.read','historical_program.read','proposal.validation.record','survey.read','survey.respond','community_need.read','community_need.submit','observation.read','skill_asset.read','skill_asset.manage','report.read','communication.read','communication.write','ai.assist','profiling.collect','profiling.detail.read','profiling.aggregate.read','profiling.acknowledge')
  WHEN p_role='admin' THEN p_capability IN('admin.users.manage','admin.audit.read','admin.recovery.read','integrity.provider.manage','communication.provider.manage')
  WHEN p_role IN('office','student_org','department') THEN p_capability='legacy_partner.history.read'
  ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT public.phase1_role_has_capability(p_role,p_capability) OR (p_role='paraya_officer' AND p_capability IN('partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage','historical_program.read','historical_program.create','historical_program.import','historical_program.review','proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.actual.record','budget.category.manage','ai.recommendation.review','ai.recommendation.configure','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review','integrity.finance.read','integrity.finance.request'));
$function$;

CREATE OR REPLACE FUNCTION public.phase1_current_has_capability(p_capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT public.phase0_current_account_is_active() AND EXISTS (SELECT 1 FROM public.users actor WHERE actor.id=auth.uid() AND public.phase1_role_has_capability(actor.role,p_capability) AND coalesce((actor.permissions->>public.phase1_permission_module(p_capability))::boolean,true) IS NOT FALSE);
$function$;

DO $phase2_guard$
BEGIN
 IF to_regprocedure('public.phase2_current_has_capability(text)') IS NOT NULL THEN
  EXECUTE $definition$ CREATE OR REPLACE FUNCTION public.phase2_current_has_capability(p_capability text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$ SELECT public.phase0_current_account_is_active() AND EXISTS (SELECT 1 FROM public.users actor WHERE actor.id=auth.uid() AND public.phase2_role_has_capability(actor.role,p_capability) AND coalesce((actor.permissions->>public.phase2_permission_module(p_capability))::boolean,true) IS NOT FALSE); $fn$; $definition$;
 END IF;
END;
$phase2_guard$;

CREATE OR REPLACE FUNCTION public.phase_role_cutover(
  p_canonical_user_id uuid,
  p_source_account_ids uuid[],
  p_backup_manifest_hash text,
  p_verification jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch_id uuid; source_id uuid; canonical public.users%ROWTYPE; source public.users%ROWTYPE;
BEGIN
  SELECT * INTO canonical FROM public.users WHERE id=p_canonical_user_id FOR UPDATE;
  IF canonical.id IS NULL OR canonical.role<>'paraya_officer' OR canonical.status<>'active' OR canonical.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'canonical PARAYA Officer must be active' USING ERRCODE='42501';
  END IF;
  IF coalesce(array_length(p_source_account_ids,1),0) <> 3 OR nullif(btrim(coalesce(p_backup_manifest_hash,'')),'') IS NULL THEN
    RAISE EXCEPTION 'role cutover requires three source accounts and a backup manifest' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.role_change_batches(target_role,canonical_user_id,source_roles,source_account_ids,backup_manifest_hash,migration_version,status,verification)
  VALUES('paraya_officer',canonical.id,ARRAY['paraya_director','paraya_associate','paraya_researcher'],p_source_account_ids,'20260921001231','20260921001231','started',coalesce(p_verification,'{}'::jsonb))
  RETURNING id INTO batch_id;
  FOREACH source_id IN ARRAY p_source_account_ids LOOP
    SELECT * INTO source FROM public.users WHERE id=source_id FOR UPDATE;
    IF source.id IS NULL OR source.role NOT IN ('paraya_director','paraya_associate','paraya_researcher') THEN
      RAISE EXCEPTION 'source account is not a former PARAYA role' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.role_history(user_id,previous_role,new_role,effective_start,effective_end,change_reason,cutover_batch_id,actor_id,source_status,target_status)
    VALUES(source.id,source.role,'paraya_officer',now(),now(),'PARAYA role consolidation',batch_id,auth.uid(),source.status,'suspended');
    UPDATE public.users SET status='suspended',is_active=false,updated_at=now() WHERE id=source.id;
  END LOOP;
  INSERT INTO public.role_history(user_id,previous_role,new_role,change_reason,cutover_batch_id,actor_id,source_status,target_status)
  VALUES(canonical.id,NULL,'paraya_officer','PARAYA role consolidation canonical account',batch_id,auth.uid(),canonical.status,'active');
  UPDATE public.role_change_batches SET status='completed',completed_at=now() WHERE id=batch_id;
  RETURN batch_id;
END;
$function$;

-- Consolidated Officer review is intentionally allowed to review records that
-- the same Officer submitted. All lifecycle, consent, reason, and row-version
-- checks remain enforced.
CREATE OR REPLACE FUNCTION public.phase1_decide_community_need(p_community_need_id uuid,p_decision text,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; need public.community_needs%ROWTYPE; next_status text;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL OR actor.role<>'paraya_officer' OR actor.status<>'active' OR actor.is_active IS NOT TRUE
     OR NOT public.phase1_current_has_capability('community_need.validate') THEN
    RAISE EXCEPTION 'only an active PARAYA Officer may review a community need' USING ERRCODE='42501';
  END IF;
  SELECT * INTO need FROM public.community_needs WHERE id=p_community_need_id FOR UPDATE;
  IF need.id IS NULL THEN RAISE EXCEPTION 'community need not found' USING ERRCODE='P0002'; END IF;
  IF need.approval_status<>'pending_paraya_review' THEN RAISE EXCEPTION 'community need is not awaiting PARAYA review' USING ERRCODE='40001'; END IF;
  IF p_decision NOT IN ('approve','needs_revision','reject') THEN RAISE EXCEPTION 'invalid community need decision' USING ERRCODE='22023'; END IF;
  IF p_decision IN ('needs_revision','reject') AND char_length(btrim(coalesce(p_notes,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'review notes are required' USING ERRCODE='22023'; END IF;
  next_status:=CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'needs_revision' THEN 'needs_revision' ELSE 'rejected' END;
  UPDATE public.community_needs SET approval_status=next_status,approved_by=CASE WHEN next_status='approved' THEN auth.uid() ELSE NULL END,approved_at=CASE WHEN next_status='approved' THEN now() ELSE NULL END,approval_notes=nullif(btrim(p_notes),''),updated_at=now() WHERE id=need.id;
  INSERT INTO public.community_need_review_events(community_need_id,previous_status,resulting_status,reviewer_id,notes) VALUES(need.id,need.approval_status,next_status,auth.uid(),nullif(btrim(p_notes),''));
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(actor.id,actor.email,'Community need reviewed','community_needs',need.id::text,'info',jsonb_build_object('from',need.approval_status,'to',next_status,'self_review',need.submitted_by=auth.uid()));
  RETURN jsonb_build_object('id',need.id,'status',next_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_decide_profiling_submission(p_submission_id uuid,p_expected_version integer,p_decision text,p_reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; next_status text; new_version integer;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,submission.sitio_id);
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='paraya_officer' AND status='active' AND is_active) THEN
    RAISE EXCEPTION 'only an active PARAYA Officer may validate a package' USING ERRCODE='42501';
  END IF;
  IF submission.status<>'pending' OR submission.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or invalid submission state' USING ERRCODE='40001'; END IF;
  IF p_decision NOT IN('approve','return') OR (p_decision='return' AND char_length(btrim(coalesce(p_reason,'')))<3) THEN RAISE EXCEPTION 'invalid decision' USING ERRCODE='22023'; END IF;
  next_status:=CASE WHEN p_decision='approve' THEN 'approved' ELSE 'returned' END;
  IF p_decision='approve' AND submission.supersedes_submission_id IS NOT NULL THEN UPDATE public.profiling_submissions SET status='superseded',row_version=row_version+1,updated_at=now() WHERE id=submission.supersedes_submission_id AND cycle_id=submission.cycle_id AND household_id=submission.household_id AND status='approved'; END IF;
  UPDATE public.profiling_submissions SET status=next_status,row_version=row_version+1,updated_at=now(),approved_at=CASE WHEN p_decision='approve' THEN now() END,approved_by=CASE WHEN p_decision='approve' THEN auth.uid() END,returned_at=CASE WHEN p_decision='return' THEN now() END,returned_by=CASE WHEN p_decision='return' THEN auth.uid() END,return_reason=CASE WHEN p_decision='return' THEN btrim(p_reason) END,current_editor_id=CASE WHEN p_decision='return' THEN current_editor_id ELSE NULL END WHERE id=p_submission_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,reason,actor_id) VALUES(submission.cycle_id,p_submission_id,submission.household_id,'submission_'||next_status,'pending',next_status,nullif(btrim(p_reason),''),auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_submissions(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF actor.role='barangay_secretary' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,NULL);
  ELSE
    PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,NULL);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'household_id',s.household_id,'household_code',h.household_code,
    'sitio_id',s.sitio_id,'sitio_name',si.name,'status',s.status,
    'row_version',s.row_version,'submission_version',s.submission_version,
    'source_type',s.source_type,'created_by',s.created_by,'current_editor_id',s.current_editor_id,
    'resident_count',(SELECT count(*) FROM public.profiling_resident_versions rv WHERE rv.submission_id=s.id),
    'submitted_at',s.submitted_at,'updated_at',s.updated_at,'return_reason',s.return_reason
  ) ORDER BY s.updated_at DESC),'[]'::jsonb) INTO result
  FROM public.profiling_submissions s
  JOIN public.profiling_households h ON h.id=s.household_id
  JOIN public.barangay_sitios si ON si.id=s.sitio_id
  WHERE s.cycle_id=p_cycle_id;
  RETURN result;
END;
$function$;

-- Preserve the complete latest detail payload while changing only its former
-- Researcher role predicate. Using the catalog definition avoids duplicating
-- the privacy-sensitive payload in another migration.
DO $detail_guard$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.phase1_get_profiling_submission(uuid)'::regprocedure) INTO definition;
  IF definition IS NOT NULL THEN
    definition := replace(definition, $$actor.role='paraya_researcher'$$, $$actor.role='paraya_officer'$$);
    EXECUTE definition;
  END IF;
END;
$detail_guard$;

DO $dashboard_guard$
DECLARE definition text;
BEGIN
  IF to_regprocedure('public.phase7_get_dashboard_summary()') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.phase7_get_dashboard_summary()'::regprocedure) INTO definition;
    definition := replace(definition, $$actor.role IN('paraya_director','paraya_associate')$$, $$actor.role='paraya_officer'$$);
    EXECUTE definition;
  END IF;
END;
$dashboard_guard$;

REVOKE ALL ON FUNCTION public.phase_role_cutover(uuid,uuid[],text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase_role_cutover(uuid,uuid[],text,jsonb) TO authenticated;
REVOKE ALL ON TABLE public.role_change_batches, public.role_history FROM PUBLIC,anon,authenticated;

