-- Retain template versions and human report corrections. Forward-only; no live cutover.
BEGIN;
SET LOCAL search_path=pg_catalog,public,extensions;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE public.survey_templates
 ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
 ADD COLUMN archived_at timestamptz,
 ADD COLUMN archived_by uuid REFERENCES public.users(id),
 ADD COLUMN archive_reason text CHECK(archive_reason IS NULL OR length(archive_reason) BETWEEN 5 AND 1000),
 ADD COLUMN supersedes_id uuid REFERENCES public.survey_templates(id) ON DELETE RESTRICT;

CREATE TABLE public.survey_template_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 template_id uuid NOT NULL REFERENCES public.survey_templates(id) ON DELETE RESTRICT,
 replacement_id uuid REFERENCES public.survey_templates(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN('created','superseded','archived','legacy_superseded')),
 template_version bigint NOT NULL CHECK(template_version>0),
 actor_id uuid REFERENCES public.users(id),
 reason text CHECK(reason IS NULL OR length(reason) BETWEEN 5 AND 1000),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 CHECK(actor_id IS NOT NULL OR event_type='legacy_superseded')
);
CREATE TRIGGER survey_template_events_immutable BEFORE UPDATE OR DELETE ON public.survey_template_events
 FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
ALTER TABLE public.survey_template_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY survey_template_events_rpc_only ON public.survey_template_events AS RESTRICTIVE FOR ALL TO public USING(false) WITH CHECK(false);
CREATE POLICY phase0_active_account_guard ON public.survey_template_events AS RESTRICTIVE FOR ALL TO authenticated
 USING((SELECT public.phase0_current_account_is_active())) WITH CHECK((SELECT public.phase0_current_account_is_active()));
REVOKE ALL ON public.survey_template_events FROM PUBLIC,anon,authenticated;

-- A legacy race may have produced multiple current rows. Keep the newest as current,
-- retaining every older payload and attribution, with a system-attributed repair event.
WITH ranked AS (
 SELECT id,first_value(id) OVER w AS replacement_id,row_number() OVER w AS position
 FROM public.survey_templates WHERE created_by IS NOT NULL
 WINDOW w AS(PARTITION BY created_by,lower(regexp_replace(btrim(name),'\s+',' ','g')) ORDER BY created_at DESC,id DESC)
), retired AS (
 UPDATE public.survey_templates t SET archived_at=now(),archive_reason='Retained older duplicate during template versioning migration',row_version=t.row_version+1
 FROM ranked r WHERE t.id=r.id AND r.position>1 RETURNING t.id,t.row_version,r.replacement_id
)
INSERT INTO public.survey_template_events(template_id,replacement_id,event_type,template_version,reason)
 SELECT id,replacement_id,'legacy_superseded',row_version,'Retained older duplicate during template versioning migration' FROM retired;
CREATE UNIQUE INDEX survey_templates_one_current_name ON public.survey_templates
 (created_by,lower(regexp_replace(btrim(name),'\s+',' ','g'))) WHERE archived_at IS NULL;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.survey_templates FROM PUBLIC,anon,authenticated;
REVOKE SELECT ON public.survey_templates FROM PUBLIC,anon;
CREATE POLICY survey_templates_capability_guard ON public.survey_templates AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.phase0_current_account_is_active() AND public.phase1_current_has_capability('survey.manage'))
 WITH CHECK(public.phase0_current_account_is_active() AND public.phase1_current_has_capability('survey.manage'));

CREATE FUNCTION public.phase2_guard_template_retention() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'templates must be retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['archived_at','archived_by','archive_reason','row_version','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['archived_at','archived_by','archive_reason','row_version','updated_at'])
    OR OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL OR NEW.row_version<>OLD.row_version+1 THEN
   RAISE EXCEPTION 'template payload is immutable; create a superseding version' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER survey_templates_retained BEFORE UPDATE OR DELETE ON public.survey_templates FOR EACH ROW EXECUTE FUNCTION public.phase2_guard_template_retention();

CREATE FUNCTION public.phase2_list_survey_templates(p_include_archived boolean DEFAULT false)
 RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('survey.manage') THEN RAISE EXCEPTION 'template access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT to_jsonb(t)||jsonb_build_object('can_manage',t.created_by=auth.uid() AND t.archived_at IS NULL)
 FROM public.survey_templates t WHERE p_include_archived OR t.archived_at IS NULL ORDER BY t.created_at DESC,t.id;
END; $$;

CREATE FUNCTION public.phase2_save_survey_template(p_name text,p_description text,p_sections jsonb,p_questions jsonb,
 p_expected_template_id uuid DEFAULT NULL,p_expected_version bigint DEFAULT NULL,p_reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE prior public.survey_templates%ROWTYPE; saved public.survey_templates%ROWTYPE; name_key text;
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('survey.manage') THEN RAISE EXCEPTION 'template access denied' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR length(coalesce(p_description,''))>1000
 OR jsonb_typeof(p_sections) IS DISTINCT FROM 'array' OR jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'invalid template' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_sections)>100 OR jsonb_array_length(p_questions)>500
 OR octet_length(p_sections::text)+octet_length(p_questions::text)>5000000 THEN RAISE EXCEPTION 'invalid template' USING ERRCODE='22023'; END IF;
 IF (p_expected_template_id IS NULL)<>(p_expected_version IS NULL) THEN RAISE EXCEPTION 'template version required' USING ERRCODE='22023'; END IF;
 name_key:=lower(regexp_replace(btrim(p_name),'\s+',' ','g'));
 -- Every save/archive locks the actor/name before inspecting the current version.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||name_key,0));
 SELECT * INTO prior FROM public.survey_templates WHERE created_by=auth.uid() AND archived_at IS NULL
 AND lower(regexp_replace(btrim(name),'\s+',' ','g'))=name_key FOR UPDATE;
 IF prior.id IS NULL THEN
   IF p_expected_template_id IS NOT NULL THEN RAISE EXCEPTION 'template version changed' USING ERRCODE='40001'; END IF;
 ELSE
   IF p_expected_template_id IS DISTINCT FROM prior.id OR p_expected_version IS DISTINCT FROM prior.row_version THEN RAISE EXCEPTION 'template version changed' USING ERRCODE='40001'; END IF;
   IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'superseding reason required' USING ERRCODE='22023'; END IF;
   UPDATE public.survey_templates SET archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(p_reason),row_version=row_version+1,updated_at=now()
   WHERE id=prior.id;
 END IF;
 -- Archive+insert+events commit together. A failed insert rolls back the archive.
 INSERT INTO public.survey_templates(name,description,sections,questions,created_by,supersedes_id)
 VALUES(btrim(p_name),nullif(btrim(p_description),''),p_sections,p_questions,auth.uid(),prior.id) RETURNING * INTO saved;
 IF prior.id IS NOT NULL THEN
   INSERT INTO public.survey_template_events(template_id,replacement_id,event_type,template_version,actor_id,reason)
   VALUES(prior.id,saved.id,'superseded',prior.row_version+1,auth.uid(),btrim(p_reason));
 END IF;
 INSERT INTO public.survey_template_events(template_id,event_type,template_version,actor_id) VALUES(saved.id,'created',saved.row_version,auth.uid());
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details)
 VALUES(auth.uid(),'survey.template.saved','survey_template',saved.id::text,jsonb_build_object('supersedesId',prior.id,'version',saved.row_version));
 RETURN to_jsonb(saved)||jsonb_build_object('can_manage',true);
END; $$;

CREATE FUNCTION public.phase2_archive_survey_template(p_template_id uuid,p_expected_version bigint,p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.survey_templates%ROWTYPE;
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('survey.manage') THEN RAISE EXCEPTION 'template access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.survey_templates WHERE id=p_template_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'template not available' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||lower(regexp_replace(btrim(r.name),'\s+',' ','g')),0));
 SELECT * INTO r FROM public.survey_templates WHERE id=p_template_id AND created_by=auth.uid() FOR UPDATE;
 IF p_expected_version IS DISTINCT FROM r.row_version THEN RAISE EXCEPTION 'template version changed' USING ERRCODE='40001'; END IF;
 IF r.archived_at IS NOT NULL THEN RAISE EXCEPTION 'template already archived' USING ERRCODE='23514'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'archive reason required' USING ERRCODE='22023'; END IF;
 UPDATE public.survey_templates SET archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(p_reason),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.survey_template_events(template_id,event_type,template_version,actor_id,reason) VALUES(r.id,'archived',r.row_version,auth.uid(),btrim(p_reason));
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'survey.template.archived','survey_template',r.id::text,jsonb_build_object('version',r.row_version));
 RETURN to_jsonb(r)||jsonb_build_object('can_manage',false);
END; $$;

ALTER TABLE public.report_lifecycle_events DROP CONSTRAINT report_lifecycle_events_event_type_check;
ALTER TABLE public.report_lifecycle_events ADD CONSTRAINT report_lifecycle_events_event_type_check CHECK(event_type IN('created','corrected','reviewed','returned','approved','archived'));
CREATE TABLE public.report_content_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES public.ai_reports(id) ON DELETE RESTRICT,
 report_version bigint NOT NULL CHECK(report_version>0),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 actor_id uuid REFERENCES public.users(id),reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 2000),
 recorded_at timestamptz NOT NULL DEFAULT now(),UNIQUE(report_id,report_version)
);
CREATE TRIGGER report_content_versions_immutable BEFORE UPDATE OR DELETE ON public.report_content_versions FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
ALTER TABLE public.report_content_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_content_versions_rpc_only ON public.report_content_versions AS RESTRICTIVE FOR ALL TO public USING(false) WITH CHECK(false);
CREATE POLICY phase0_active_account_guard ON public.report_content_versions AS RESTRICTIVE FOR ALL TO authenticated
 USING((SELECT public.phase0_current_account_is_active())) WITH CHECK((SELECT public.phase0_current_account_is_active()));
REVOKE ALL ON public.report_content_versions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.phase6_guard_report_retention() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reports must be retained' USING ERRCODE='23514'; END IF;
 IF OLD.archived_at IS NOT NULL THEN RAISE EXCEPTION 'archived report is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status='approved' AND (to_jsonb(NEW)-ARRAY['archived_at','archived_by','archive_reason','updated_at','row_version']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['archived_at','archived_by','archive_reason','updated_at','row_version']) THEN
   RAISE EXCEPTION 'approved report is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status='reviewed' AND (NEW.narrative IS DISTINCT FROM OLD.narrative OR NEW.content IS DISTINCT FROM OLD.content) THEN
   RAISE EXCEPTION 'return the report before correcting its content' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER ai_reports_retained BEFORE UPDATE OR DELETE ON public.ai_reports FOR EACH ROW EXECUTE FUNCTION public.phase6_guard_report_retention();

CREATE FUNCTION public.phase6_correct_report(p_report_id uuid,p_expected_version bigint,p_narrative text,p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.ai_reports%ROWTYPE;
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('report.manage') THEN RAISE EXCEPTION 'report management denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.ai_reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'report not available' USING ERRCODE='P0002'; END IF;
 IF p_expected_version IS DISTINCT FROM r.row_version THEN RAISE EXCEPTION 'report version changed' USING ERRCODE='40001'; END IF;
 IF r.status<>'draft' OR r.archived_at IS NOT NULL THEN RAISE EXCEPTION 'only an active draft can be corrected' USING ERRCODE='23514'; END IF;
 IF length(btrim(coalesce(p_narrative,''))) NOT BETWEEN 20 AND 50000 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN
   RAISE EXCEPTION 'correction content and reason required' USING ERRCODE='22023'; END IF;
 IF btrim(p_narrative)=r.narrative THEN RAISE EXCEPTION 'correction must change the narrative' USING ERRCODE='22023'; END IF;
 -- Capture the prior content without attributing it to the correcting actor.
 INSERT INTO public.report_content_versions(report_id,report_version,snapshot,actor_id,reason)
 VALUES(r.id,r.row_version,jsonb_build_object('title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'generatedBy',r.generated_by),
 (SELECT actor_id FROM public.report_lifecycle_events WHERE report_id=r.id AND report_version=r.row_version ORDER BY occurred_at DESC,id DESC LIMIT 1),
 'Retained content before a human correction') ON CONFLICT(report_id,report_version) DO NOTHING;
 UPDATE public.ai_reports SET narrative=btrim(p_narrative),content=btrim(p_narrative),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.report_content_versions(report_id,report_version,snapshot,actor_id,reason)
 VALUES(r.id,r.row_version,jsonb_build_object('title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'generatedBy',r.generated_by),auth.uid(),btrim(p_reason));
 INSERT INTO public.report_lifecycle_events(report_id,event_type,from_status,to_status,report_version,actor_id,reason)
 VALUES(r.id,'corrected','draft','draft',r.row_version,auth.uid(),btrim(p_reason));
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details)
 VALUES(auth.uid(),'report.corrected','ai_report',r.id::text,jsonb_build_object('version',r.row_version));
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rowVersion',r.row_version,'narrative',r.narrative);
END; $$;

CREATE OR REPLACE FUNCTION public.phase6_transition_report(p_report_id uuid,p_expected_version bigint,p_action text,p_reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $$
DECLARE r public.ai_reports%ROWTYPE; old_status text; snap jsonb;
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('report.manage') THEN RAISE EXCEPTION 'report management denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.ai_reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'report not found' USING ERRCODE='P0002'; END IF;
 IF p_expected_version IS DISTINCT FROM r.row_version THEN RAISE EXCEPTION 'report version conflict' USING ERRCODE='40001'; END IF;
 old_status:=r.status;
 IF p_action='review' AND r.status='draft' AND r.archived_at IS NULL THEN
   UPDATE public.ai_reports SET status='reviewed',reviewed_by=auth.uid(),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSIF p_action='return' AND r.status='reviewed' AND r.archived_at IS NULL AND length(btrim(coalesce(p_reason,''))) BETWEEN 5 AND 2000 THEN
   UPDATE public.ai_reports SET status='draft',reviewed_by=NULL,updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSIF p_action='approve' AND r.status='reviewed' AND r.archived_at IS NULL THEN
   snap:=jsonb_build_object('schema','agape.report.approved.v1','reportId',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'generatedBy',r.generated_by,'reportVersion',r.row_version+1);
   UPDATE public.ai_reports SET status='approved',approved_by=auth.uid(),approved_at=now(),approved_snapshot=snap,
   approved_hash=encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex'),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSIF p_action='archive' AND r.archived_at IS NULL AND length(btrim(coalesce(p_reason,''))) BETWEEN 5 AND 1000 THEN
   UPDATE public.ai_reports SET archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(p_reason),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSE RAISE EXCEPTION 'invalid report transition or reason' USING ERRCODE='23514'; END IF;
 INSERT INTO public.report_lifecycle_events(report_id,event_type,from_status,to_status,report_version,actor_id,reason,metadata)
 VALUES(r.id,CASE p_action WHEN 'review' THEN 'reviewed' WHEN 'return' THEN 'returned' WHEN 'approve' THEN 'approved' ELSE 'archived' END,
 old_status,r.status,r.row_version,auth.uid(),nullif(btrim(p_reason),''),jsonb_build_object('approvedHash',r.approved_hash));
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'report.'||p_action,'ai_report',r.id::text,jsonb_build_object('version',r.row_version));
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rowVersion',r.row_version,'archivedAt',r.archived_at,'approvedAt',r.approved_at,'approvedHash',r.approved_hash);
END; $$;

CREATE FUNCTION public.phase6_get_report_history(p_report_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('report.read') THEN RAISE EXCEPTION 'report access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_reports WHERE id=p_report_id) THEN RAISE EXCEPTION 'report not available' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object(
 'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('version',report_version,'snapshot',snapshot,'actorId',actor_id,'reason',reason,'recordedAt',recorded_at) ORDER BY report_version DESC) FROM public.report_content_versions WHERE report_id=p_report_id),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('event',event_type,'version',report_version,'actorId',actor_id,'reason',reason,'occurredAt',occurred_at) ORDER BY report_version DESC) FROM public.report_lifecycle_events WHERE report_id=p_report_id),'[]'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.phase2_guard_template_retention(),public.phase6_guard_report_retention() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase2_list_survey_templates(boolean),public.phase2_save_survey_template(text,text,jsonb,jsonb,uuid,bigint,text),public.phase2_archive_survey_template(uuid,bigint,text),
 public.phase6_correct_report(uuid,bigint,text,text),public.phase6_transition_report(uuid,bigint,text,text),public.phase6_get_report_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase2_list_survey_templates(boolean),public.phase2_save_survey_template(text,text,jsonb,jsonb,uuid,bigint,text),public.phase2_archive_survey_template(uuid,bigint,text),
 public.phase6_correct_report(uuid,bigint,text,text),public.phase6_transition_report(uuid,bigint,text,text),public.phase6_get_report_history(uuid) TO authenticated;
COMMIT;
