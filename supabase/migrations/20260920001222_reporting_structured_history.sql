-- Return structured documents in retained report history without rewriting old snapshots.
BEGIN;
SET LOCAL search_path=pg_catalog,public;

CREATE OR REPLACE FUNCTION public.phase6_get_report_history(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE r public.ai_reports%ROWTYPE;
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('report.read') THEN RAISE EXCEPTION 'report access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.ai_reports WHERE id=p_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'report not available' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object(
  'report',jsonb_build_object('id',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'reportDocument',r.report_document,'status',r.status,'rowVersion',r.row_version,'createdAt',r.created_at,'updatedAt',r.updated_at,'approvedAt',r.approved_at,'approvedHash',r.approved_hash),
  'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('version',report_version,'snapshot',snapshot,'actorId',actor_id,'reason',reason,'recordedAt',recorded_at) ORDER BY report_version DESC) FROM public.report_content_versions WHERE report_id=p_report_id),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('event',event_type,'version',report_version,'actorId',actor_id,'reason',reason,'occurredAt',occurred_at) ORDER BY report_version DESC) FROM public.report_lifecycle_events WHERE report_id=p_report_id),'[]'::jsonb));
END; $function$;

REVOKE ALL ON FUNCTION public.phase6_get_report_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase6_get_report_history(uuid) TO authenticated;
COMMIT;
