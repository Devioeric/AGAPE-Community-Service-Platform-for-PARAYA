-- Structured period-report documents. Additive and forward-only: legacy
-- narrative rows, lifecycle history, approval snapshots and hashes remain.
BEGIN;
SET LOCAL search_path=pg_catalog,public,extensions;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE public.ai_reports
  ADD COLUMN IF NOT EXISTS report_document jsonb,
  ADD CONSTRAINT ai_reports_report_document_object_check
    CHECK (report_document IS NULL OR jsonb_typeof(report_document)='object');

CREATE OR REPLACE FUNCTION public.phase6_reporting_aggregate_v2(p_period_start date,p_period_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; as_of date:=current_date; quality_flags text[]:='{}';
BEGIN
 IF NOT public.phase1_current_has_capability('report.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_period_end<p_period_start OR p_period_end-p_period_start>730 THEN RAISE EXCEPTION 'invalid reporting period' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object(
  'schema','agape.reporting.aggregate.v2','periodStart',p_period_start,'periodEnd',p_period_end,'asOf',as_of,
  'source','approved_and_status_explicit_operational_records',
  'programs',jsonb_build_object(
    'total',(SELECT count(*) FROM public.programs WHERE coalesce(start_date,created_at::date)<=p_period_end AND coalesce(end_date,created_at::date)>=p_period_start),
    'active',(SELECT count(*) FROM public.programs WHERE status='active' AND coalesce(start_date,created_at::date)<=p_period_end AND coalesce(end_date,created_at::date)>=p_period_start),
    'completed',(SELECT count(*) FROM public.programs WHERE status='completed' AND coalesce(start_date,created_at::date)<=p_period_end AND coalesce(end_date,created_at::date)>=p_period_start),
    'statusBreakdown',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM public.programs WHERE coalesce(start_date,created_at::date)<=p_period_end AND coalesce(end_date,created_at::date)>=p_period_start GROUP BY status)s),'{}'::jsonb)),
  'volunteers',jsonb_build_object(
    'approvedServiceHours',coalesce((SELECT round(sum(hours)::numeric,2) FROM public.activity_logs WHERE status='approved' AND date BETWEEN p_period_start AND p_period_end),0),
    'participants',(SELECT count(DISTINCT volunteer_id) FROM public.activity_logs WHERE status='approved' AND date BETWEEN p_period_start AND p_period_end)),
  'donations',jsonb_build_object(
    'activeRecords',(SELECT count(*) FROM public.donations WHERE archived_at IS NULL AND received_date BETWEEN p_period_start AND p_period_end),
    'totalQuantity',NULL,
    'byType',coalesce((SELECT jsonb_object_agg(item_type,n) FROM (SELECT item_type,count(*) n FROM public.donations WHERE archived_at IS NULL AND received_date BETWEEN p_period_start AND p_period_end GROUP BY item_type)s),'{}'::jsonb)),
  'needs',jsonb_build_object(
    'approved',(SELECT count(*) FROM public.community_needs WHERE approval_status='approved' AND created_at::date BETWEEN p_period_start AND p_period_end),
    'documented',(SELECT count(*) FROM public.community_needs WHERE created_at::date BETWEEN p_period_start AND p_period_end),
    'statusBreakdown',coalesce((SELECT jsonb_object_agg(approval_status,n) FROM (SELECT approval_status,count(*) n FROM public.community_needs WHERE created_at::date BETWEEN p_period_start AND p_period_end GROUP BY approval_status)s),'{}'::jsonb)),
  'proposals',jsonb_build_object(
    'created',(SELECT count(*) FROM public.project_proposals WHERE created_at::date BETWEEN p_period_start AND p_period_end),
    'statusBreakdown',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM public.project_proposals WHERE created_at::date BETWEEN p_period_start AND p_period_end GROUP BY status)s),'{}'::jsonb)),
  'profiling',jsonb_build_object(
    'cycleCount',(SELECT count(*) FROM public.profiling_cycles WHERE collection_starts_on<=p_period_end AND collection_ends_on>=p_period_start),
    'sampleSize',(SELECT count(*) FROM public.profiling_sample_units su JOIN public.profiling_cycles pc ON pc.id=su.cycle_id WHERE pc.collection_starts_on<=p_period_end AND pc.collection_ends_on>=p_period_start),
    'coveredAreas',(SELECT count(DISTINCT barangay_id) FROM public.profiling_cycles WHERE collection_starts_on<=p_period_end AND collection_ends_on>=p_period_start)),
  'partnerships',jsonb_build_object(
    'active',(SELECT count(*) FROM public.partnership_terms WHERE status='active' AND starts_on<=p_period_end AND (coalesce(ends_on,expires_on) IS NULL OR coalesce(ends_on,expires_on)>=p_period_start)),
    'unexpired',(SELECT count(*) FROM public.partnership_terms WHERE status='active' AND starts_on<=as_of AND (coalesce(ends_on,expires_on) IS NULL OR coalesce(ends_on,expires_on)>=as_of))),
  'historicalPrograms',jsonb_build_object(
    'verified',(SELECT count(*) FROM public.historical_programs WHERE status='accepted' AND quality IN('complete','partial_verified') AND coalesce(starts_on,created_at::date)<=p_period_end AND coalesce(ends_on,created_at::date)>=p_period_start),
    'partial',(SELECT count(*) FROM public.historical_programs WHERE status='accepted' AND quality='partial_verified' AND coalesce(starts_on,created_at::date)<=p_period_end AND coalesce(ends_on,created_at::date)>=p_period_start),
    'unverified',(SELECT count(*) FROM public.historical_programs WHERE quality IN('unverified','partial_unverified') AND coalesce(starts_on,created_at::date)<=p_period_end AND coalesce(ends_on,created_at::date)>=p_period_start)),
  'finance',jsonb_build_object(
    'allocated',(SELECT round(sum(budget_allocated)::numeric,2) FROM public.programs WHERE coalesce(start_date,created_at::date)<=p_period_end AND coalesce(end_date,created_at::date)>=p_period_start),
    'spent',(SELECT round(sum(budget_spent)::numeric,2) FROM public.programs WHERE coalesce(start_date,created_at::date)<=p_period_end AND coalesce(end_date,created_at::date)>=p_period_start),
    'variance',(SELECT round(sum(budget_allocated-budget_spent)::numeric,2) FROM public.programs WHERE coalesce(start_date,created_at::date)<=p_period_end AND coalesce(end_date,created_at::date)>=p_period_start)),
  'sdg',jsonb_build_object(
    '4',(SELECT count(*) FROM public.proposal_sdg_alignment s JOIN public.project_proposals q ON q.id=s.proposal_id WHERE s.sdg_number=4 AND q.created_at::date BETWEEN p_period_start AND p_period_end),
    '9',(SELECT count(*) FROM public.proposal_sdg_alignment s JOIN public.project_proposals q ON q.id=s.proposal_id WHERE s.sdg_number=9 AND q.created_at::date BETWEEN p_period_start AND p_period_end),
    '11',(SELECT count(*) FROM public.proposal_sdg_alignment s JOIN public.project_proposals q ON q.id=s.proposal_id WHERE s.sdg_number=11 AND q.created_at::date BETWEEN p_period_start AND p_period_end),
    '17',(SELECT count(*) FROM public.proposal_sdg_alignment s JOIN public.project_proposals q ON q.id=s.proposal_id WHERE s.sdg_number=17 AND q.created_at::date BETWEEN p_period_start AND p_period_end)),
  'impact',jsonb_build_object(
    'indicators',(SELECT count(*) FROM public.impact_indicators WHERE voided_at IS NULL AND recorded_date BETWEEN p_period_start AND p_period_end),
    'qualitativeRecords',(SELECT count(*) FROM public.impact_qualitative WHERE voided_at IS NULL AND recorded_date BETWEEN p_period_start AND p_period_end),
    'followUpOpen',(SELECT count(*) FROM public.follow_up_records WHERE voided_at IS NULL AND scheduled_date BETWEEN p_period_start AND p_period_end AND status<>'completed')),
  'quality',jsonb_build_object(
    'flags',to_jsonb(quality_flags || CASE WHEN (SELECT count(*) FROM public.donations WHERE archived_at IS NULL AND received_date BETWEEN p_period_start AND p_period_end)>0 THEN ARRAY['Donation quantities are not combined because units may differ.']::text[] ELSE '{}'::text[] END),
    'domainStatuses',jsonb_build_object('program_portfolio','available','community_needs','available','profiling_coverage','available','volunteer_engagement','available','partnerships_and_history','available','finance_and_resources','available','sdg_contributions','available','impact_and_outcomes','available'))
 ) INTO result;
 RETURN result;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_create_report_v2(p_title text,p_period_start date,p_period_end date,p_narrative text,p_report_document jsonb,p_source_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE r public.ai_reports%ROWTYPE;
BEGIN
 IF NOT public.phase1_current_has_capability('report.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 240 OR p_period_end<p_period_start OR p_period_end-p_period_start>730 OR length(btrim(coalesce(p_narrative,''))) NOT BETWEEN 20 AND 50000 THEN RAISE EXCEPTION 'invalid report' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_report_document)<>'object' OR p_report_document->>'schema'<>'agape.reporting.document.v2' OR p_report_document->>'reportType'<>'period_accomplishment' OR p_report_document->'statusNotes'->>'reviewRequired' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'invalid report document' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_source_metadata)<>'object' OR p_source_metadata->>'schema'<>'agape.reporting.aggregate.v2' OR p_source_metadata->>'source'<>'approved_and_status_explicit_operational_records' THEN RAISE EXCEPTION 'invalid report provenance' USING ERRCODE='22023'; END IF;
 INSERT INTO public.ai_reports(report_type,title,period_start,period_end,narrative,content,report_document,status,generated_by,created_at,updated_at,row_version)
 VALUES('program',btrim(p_title),p_period_start,p_period_end,btrim(p_narrative),btrim(p_narrative),p_report_document,'draft',auth.uid(),now(),now(),1) RETURNING * INTO r;
 INSERT INTO public.report_lifecycle_events(report_id,event_type,to_status,report_version,actor_id,metadata) VALUES(r.id,'created','draft',1,auth.uid(),jsonb_build_object('source',p_source_metadata,'documentSchema',p_report_document->>'schema'));
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'report.created','ai_report',r.id::text,jsonb_build_object('periodStart',p_period_start,'periodEnd',p_period_end,'generationMode',p_report_document->'generation'->>'mode'));
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rowVersion',r.row_version,'reportDocument',r.report_document);
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_list_reports(p_include_archived boolean DEFAULT false)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NOT public.phase1_current_has_capability('report.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'reportDocument',r.report_document,'status',r.status,'rowVersion',r.row_version,'createdAt',r.created_at,'updatedAt',r.updated_at,'approvedAt',r.approved_at,'archivedAt',r.archived_at,'generatedBy',r.generated_by,'generatedByName',u.full_name,'approvedHash',r.approved_hash)
 FROM public.ai_reports r LEFT JOIN public.users u ON u.id=r.generated_by WHERE p_include_archived OR r.archived_at IS NULL ORDER BY r.created_at DESC;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_get_report_document(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE r public.ai_reports%ROWTYPE; history jsonb; events jsonb;
BEGIN
 IF NOT public.phase1_current_has_capability('report.read') THEN RAISE EXCEPTION 'report access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.ai_reports WHERE id=p_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'report not available' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',report_version,'snapshot',snapshot,'actorId',actor_id,'reason',reason,'recordedAt',recorded_at) ORDER BY report_version DESC),'[]'::jsonb) INTO history FROM public.report_content_versions WHERE report_id=p_report_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('event',event_type,'version',report_version,'actorId',actor_id,'reason',reason,'occurredAt',occurred_at) ORDER BY report_version DESC),'[]'::jsonb) INTO events FROM public.report_lifecycle_events WHERE report_id=p_report_id;
 RETURN jsonb_build_object('report',jsonb_build_object('id',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'reportDocument',r.report_document,'status',r.status,'rowVersion',r.row_version,'createdAt',r.created_at,'updatedAt',r.updated_at,'approvedAt',r.approved_at,'generatedBy',r.generated_by,'generatedByName',(SELECT full_name FROM public.users WHERE id=r.generated_by),'approvedHash',r.approved_hash),'versions',history,'events',events);
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_transition_report(p_report_id uuid,p_expected_version bigint,p_action text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE r public.ai_reports%ROWTYPE; old_status text; snap jsonb;
BEGIN
 IF NOT public.phase1_current_has_capability('report.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.ai_reports WHERE id=p_report_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'report not found' USING ERRCODE='P0002'; END IF;
 IF r.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale report version' USING ERRCODE='40001'; END IF;
 old_status:=r.status;
 IF p_action='review' AND r.status='draft' AND r.archived_at IS NULL THEN UPDATE public.ai_reports SET status='reviewed',reviewed_by=auth.uid(),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSIF p_action='return' AND r.status='reviewed' AND r.archived_at IS NULL AND length(btrim(coalesce(p_reason,''))) BETWEEN 5 AND 2000 THEN UPDATE public.ai_reports SET status='draft',reviewed_by=NULL,updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSIF p_action='approve' AND r.status='reviewed' AND r.archived_at IS NULL THEN
   snap:=jsonb_build_object('schema','agape.report.approved.v2','reportId',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'reportDocument',r.report_document,'generatedBy',r.generated_by,'reportVersion',r.row_version+1);
   UPDATE public.ai_reports SET status='approved',approved_by=auth.uid(),approved_at=now(),approved_snapshot=snap,approved_hash=encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex'),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSIF p_action='archive' AND r.archived_at IS NULL AND length(btrim(coalesce(p_reason,''))) BETWEEN 5 AND 1000 THEN UPDATE public.ai_reports SET archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(p_reason),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSE RAISE EXCEPTION 'invalid report transition' USING ERRCODE='23514'; END IF;
 INSERT INTO public.report_lifecycle_events(report_id,event_type,from_status,to_status,report_version,actor_id,reason,metadata) VALUES(r.id,CASE p_action WHEN 'review' THEN 'reviewed' WHEN 'return' THEN 'returned' WHEN 'approve' THEN 'approved' ELSE 'archived' END,old_status,r.status,r.row_version,auth.uid(),nullif(btrim(p_reason),''),jsonb_build_object('approvedHash',r.approved_hash,'documentSchema',r.report_document->>'schema'));
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'report.'||p_action,'ai_report',r.id::text,jsonb_build_object('version',r.row_version));
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rowVersion',r.row_version,'archivedAt',r.archived_at,'approvedAt',r.approved_at,'approvedHash',r.approved_hash,'reportDocument',r.report_document);
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_correct_report_v2(p_report_id uuid,p_expected_version bigint,p_narrative text,p_report_document jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE r public.ai_reports%ROWTYPE;
BEGIN
 IF NOT public.phase1_current_has_capability('report.manage') THEN RAISE EXCEPTION 'report management denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.ai_reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'draft' OR r.archived_at IS NOT NULL OR r.row_version<>p_expected_version THEN RAISE EXCEPTION 'report version or state changed' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(p_report_document)<>'object' OR p_report_document->>'schema'<>'agape.reporting.document.v2' OR length(btrim(coalesce(p_narrative,''))) NOT BETWEEN 20 AND 50000 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'invalid report correction' USING ERRCODE='22023'; END IF;
 INSERT INTO public.report_content_versions(report_id,report_version,snapshot,actor_id,reason) VALUES(r.id,r.row_version,jsonb_build_object('title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'reportDocument',r.report_document),auth.uid(),'Retained content before a human correction') ON CONFLICT(report_id,report_version) DO NOTHING;
 UPDATE public.ai_reports SET narrative=btrim(p_narrative),content=btrim(p_narrative),report_document=p_report_document,updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.report_content_versions(report_id,report_version,snapshot,actor_id,reason) VALUES(r.id,r.row_version,jsonb_build_object('title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'reportDocument',r.report_document),auth.uid(),btrim(p_reason));
 INSERT INTO public.report_lifecycle_events(report_id,event_type,from_status,to_status,report_version,actor_id,reason) VALUES(r.id,'corrected','draft','draft',r.row_version,auth.uid(),btrim(p_reason));
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rowVersion',r.row_version,'narrative',r.narrative,'reportDocument',r.report_document);
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_guard_report_retention() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reports must be retained' USING ERRCODE='23514'; END IF;
 IF OLD.archived_at IS NOT NULL THEN RAISE EXCEPTION 'archived report is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status='approved' AND (to_jsonb(NEW)-ARRAY['archived_at','archived_by','archive_reason','updated_at','row_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['archived_at','archived_by','archive_reason','updated_at','row_version']) THEN RAISE EXCEPTION 'approved report is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status='reviewed' AND (NEW.narrative IS DISTINCT FROM OLD.narrative OR NEW.content IS DISTINCT FROM OLD.content OR NEW.report_document IS DISTINCT FROM OLD.report_document) THEN RAISE EXCEPTION 'return the report before correcting its content' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$function$;

REVOKE ALL ON FUNCTION public.phase6_reporting_aggregate_v2(date,date),public.phase6_create_report_v2(text,date,date,text,jsonb,jsonb),public.phase6_get_report_document(uuid),public.phase6_correct_report_v2(uuid,bigint,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase6_reporting_aggregate_v2(date,date),public.phase6_create_report_v2(text,date,date,text,jsonb,jsonb),public.phase6_get_report_document(uuid),public.phase6_correct_report_v2(uuid,bigint,text,jsonb,text) TO authenticated;
COMMIT;
