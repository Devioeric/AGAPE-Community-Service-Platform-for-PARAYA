-- Keep report list/detail/print authorization consistent for inactive accounts.
-- Forward-only follow-up to the additive structured reporting migration.
BEGIN;
SET LOCAL search_path=pg_catalog,public;

CREATE OR REPLACE FUNCTION public.phase6_list_reports(p_include_archived boolean DEFAULT false)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('report.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'reportDocument',r.report_document,'status',r.status,'rowVersion',r.row_version,'createdAt',r.created_at,'updatedAt',r.updated_at,'approvedAt',r.approved_at,'archivedAt',r.archived_at,'generatedBy',r.generated_by,'generatedByName',u.full_name,'approvedHash',r.approved_hash)
 FROM public.ai_reports r LEFT JOIN public.users u ON u.id=r.generated_by WHERE p_include_archived OR r.archived_at IS NULL ORDER BY r.created_at DESC;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_get_report_document(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE r public.ai_reports%ROWTYPE; history jsonb; events jsonb;
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('report.read') THEN RAISE EXCEPTION 'report access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.ai_reports WHERE id=p_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'report not available' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',report_version,'snapshot',snapshot,'actorId',actor_id,'reason',reason,'recordedAt',recorded_at) ORDER BY report_version DESC),'[]'::jsonb) INTO history FROM public.report_content_versions WHERE report_id=p_report_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('event',event_type,'version',report_version,'actorId',actor_id,'reason',reason,'occurredAt',occurred_at) ORDER BY report_version DESC),'[]'::jsonb) INTO events FROM public.report_lifecycle_events WHERE report_id=p_report_id;
 RETURN jsonb_build_object('report',jsonb_build_object('id',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'reportDocument',r.report_document,'status',r.status,'rowVersion',r.row_version,'createdAt',r.created_at,'updatedAt',r.updated_at,'approvedAt',r.approved_at,'generatedBy',r.generated_by,'generatedByName',(SELECT full_name FROM public.users WHERE id=r.generated_by),'approvedHash',r.approved_hash),'versions',history,'events',events);
END;$function$;

REVOKE ALL ON FUNCTION public.phase6_list_reports(boolean),public.phase6_get_report_document(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase6_list_reports(boolean),public.phase6_get_report_document(uuid) TO authenticated;
COMMIT;
