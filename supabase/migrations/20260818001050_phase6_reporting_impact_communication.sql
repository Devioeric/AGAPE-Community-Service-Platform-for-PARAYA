-- Phase 6: governed reporting, aggregate impact, and notification delivery.
-- Existing in-app notifications remain available. External delivery is
-- provider-neutral, leased, audited, and disabled by default.
BEGIN;
SET LOCAL search_path=public,extensions,pg_catalog;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- These self-service preference fields existed in the legacy development
-- schema but were not represented by the canonical timestamped chain.
ALTER TABLE public.users
  ADD COLUMN phone text CHECK(phone IS NULL OR phone~'^(\\+?63|0)9[0-9]{9}$'),
  ADD COLUMN notification_prefs jsonb NOT NULL DEFAULT '{"in_app":true,"email":true,"sms":false}'::jsonb
    CHECK(jsonb_typeof(notification_prefs)='object');

ALTER TABLE public.ai_reports
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN approved_snapshot jsonb,
  ADD COLUMN approved_hash text CHECK(approved_hash IS NULL OR approved_hash~'^[0-9a-f]{64}$'),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN archive_reason text CHECK(archive_reason IS NULL OR length(archive_reason) BETWEEN 5 AND 1000);

CREATE TABLE public.report_lifecycle_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES public.ai_reports(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN('created','reviewed','returned','approved','archived')),
 from_status text, to_status text, report_version bigint NOT NULL CHECK(report_version>0), actor_id uuid NOT NULL REFERENCES public.users(id),
 reason text CHECK(reason IS NULL OR length(reason)<=2000), metadata jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER report_lifecycle_events_immutable BEFORE UPDATE OR DELETE ON public.report_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();
ALTER TABLE public.report_lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_lifecycle_events_rpc_only ON public.report_lifecycle_events AS RESTRICTIVE FOR ALL TO public USING(false) WITH CHECK(false);
REVOKE ALL ON public.report_lifecycle_events FROM PUBLIC,anon,authenticated;

CREATE TABLE public.phase6_delivery_runtime(
 channel text PRIMARY KEY CHECK(channel IN('email','sms')), mode text NOT NULL DEFAULT 'off' CHECK(mode IN('off','synthetic','live')),
 provider_key text NOT NULL DEFAULT 'unconfigured' CHECK(provider_key~'^[a-z][a-z0-9_-]{0,63}$'),
 synthetic_user_ids uuid[] NOT NULL DEFAULT '{}', row_version bigint NOT NULL DEFAULT 1,
 updated_by uuid REFERENCES public.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.phase6_delivery_runtime(channel) VALUES('email'),('sms') ON CONFLICT(channel) DO NOTHING;

CREATE TABLE public.notification_delivery_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT, channel text NOT NULL CHECK(channel IN('email','sms')),
 data_mode text NOT NULL CHECK(data_mode IN('synthetic','live')), status text NOT NULL CHECK(status IN('queued','suppressed','sending','sent','failed','cancelled')),
 idempotency_key text NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 16 AND 200), attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 next_attempt_at timestamptz, lease_until timestamptz, claim_token uuid, provider_message_id text CHECK(provider_message_id IS NULL OR length(provider_message_id)<=200),
 last_error_code text CHECK(last_error_code IS NULL OR last_error_code~'^[a-z][a-z0-9_]{0,79}$'), sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notification_id,channel), CHECK((status='sending')=(claim_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX notification_delivery_queue ON public.notification_delivery_outbox(channel,next_attempt_at,created_at) WHERE status IN('queued','failed');
CREATE TABLE public.notification_delivery_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_id uuid NOT NULL REFERENCES public.notification_delivery_outbox(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN('queued','suppressed','claimed','lease_recovered','sent','retry_scheduled','cancelled','requeued')),
 actor_id uuid REFERENCES public.users(id), metadata jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER notification_delivery_events_immutable BEFORE UPDATE OR DELETE ON public.notification_delivery_events
FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

ALTER TABLE public.phase6_delivery_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase6_delivery_runtime_rpc_only ON public.phase6_delivery_runtime AS RESTRICTIVE FOR ALL TO public USING(false) WITH CHECK(false);
CREATE POLICY notification_delivery_outbox_rpc_only ON public.notification_delivery_outbox AS RESTRICTIVE FOR ALL TO public USING(false) WITH CHECK(false);
CREATE POLICY notification_delivery_events_rpc_only ON public.notification_delivery_events AS RESTRICTIVE FOR ALL TO public USING(false) WITH CHECK(false);
REVOKE ALL ON public.phase6_delivery_runtime,public.notification_delivery_outbox,public.notification_delivery_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.phase2_permission_module(p_capability text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE WHEN p_capability LIKE 'integrity.%' THEN 'financial_integrity'
  WHEN p_capability='communication.provider.manage' THEN 'communication'
  WHEN p_capability LIKE 'partner.document.%' THEN 'partner_documents'
  WHEN p_capability LIKE 'partner.%' OR p_capability LIKE 'partnership.%' THEN 'partnerships'
  WHEN p_capability LIKE 'historical_program.%' THEN 'historical_programs'
  WHEN p_capability LIKE 'budget.%' THEN 'budgets' ELSE public.phase1_permission_module(p_capability) END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT public.phase1_role_has_capability(p_role,p_capability) OR CASE
  WHEN p_role='paraya_director' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.category.manage',
   'ai.recommendation.review','ai.recommendation.configure','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review',
   'integrity.finance.read','integrity.finance.request'])
  WHEN p_role='paraya_associate' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','proposal.submit','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='paraya_researcher' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'ai.recommendation.review','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='finance_officer' THEN p_capability=ANY(ARRAY['budget.read','budget.review','budget.liquidation.review','integrity.finance.read','integrity.finance.request'])
  WHEN p_role IN('barangay_captain','barangay_secretary') THEN p_capability='historical_program.read'
  WHEN p_role='volunteer' THEN p_capability='volunteer.preferences.manage'
  WHEN p_role='admin' THEN p_capability=ANY(ARRAY['integrity.provider.manage','communication.provider.manage'])
  ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase6_create_report(p_title text,p_period_start date,p_period_end date,p_narrative text,p_source_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE r public.ai_reports%ROWTYPE;
BEGIN
 IF NOT public.phase1_current_has_capability('report.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 3 AND 240 OR p_period_end<p_period_start OR length(trim(p_narrative)) NOT BETWEEN 20 AND 50000 THEN RAISE EXCEPTION 'invalid report' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_source_metadata)<>'object'
   OR p_source_metadata->>'schema'<>'agape.reporting.aggregate.v1'
   OR p_source_metadata->>'source'<>'approved_operational_records'
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_source_metadata) k)<>ARRAY['asOf','donations','needs','periodEnd','periodStart','programs','proposals','quality','schema','source','volunteers']::text[]
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_source_metadata->'programs') k)<>ARRAY['active','completed','total']::text[]
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_source_metadata->'volunteers') k)<>ARRAY['approvedServiceHours']::text[]
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_source_metadata->'donations') k)<>ARRAY['activeRecords','totalQuantity']::text[]
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_source_metadata->'needs') k)<>ARRAY['documented']::text[]
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_source_metadata->'proposals') k)<>ARRAY['created']::text[]
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_source_metadata->'quality') k)<>ARRAY['approvedActivityHoursOnly','archivedDonationsExcluded','residentDataIncluded','voidedImpactExcluded']::text[]
 THEN RAISE EXCEPTION 'invalid report provenance' USING ERRCODE='22023'; END IF;
 INSERT INTO public.ai_reports(report_type,title,period_start,period_end,narrative,content,status,generated_by,created_at,updated_at,row_version)
 VALUES('program',trim(p_title),p_period_start,p_period_end,trim(p_narrative),trim(p_narrative),'draft',auth.uid(),now(),now(),1) RETURNING * INTO r;
 INSERT INTO public.report_lifecycle_events(report_id,event_type,to_status,report_version,actor_id,metadata) VALUES(r.id,'created','draft',1,auth.uid(),jsonb_build_object('source',coalesce(p_source_metadata,'{}')));
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'report.created','ai_report',r.id::text,jsonb_build_object('periodStart',p_period_start,'periodEnd',p_period_end));
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rowVersion',r.row_version);
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_list_reports(p_include_archived boolean DEFAULT false)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NOT public.phase1_current_has_capability('report.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,
  'status',r.status,'rowVersion',r.row_version,'createdAt',r.created_at,'updatedAt',r.updated_at,'approvedAt',r.approved_at,
  'archivedAt',r.archived_at,'generatedBy',r.generated_by,'generatedByName',u.full_name,'approvedHash',r.approved_hash)
 FROM public.ai_reports r LEFT JOIN public.users u ON u.id=r.generated_by WHERE p_include_archived OR r.archived_at IS NULL ORDER BY r.created_at DESC;
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
 ELSIF p_action='return' AND r.status='reviewed' AND r.archived_at IS NULL AND length(trim(coalesce(p_reason,'')))>=5 THEN UPDATE public.ai_reports SET status='draft',reviewed_by=NULL,updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSIF p_action='approve' AND r.status='reviewed' AND r.archived_at IS NULL THEN
   snap:=jsonb_build_object('schema','agape.report.approved.v1','reportId',r.id,'title',r.title,'periodStart',r.period_start,'periodEnd',r.period_end,'narrative',r.narrative,'generatedBy',r.generated_by,'reportVersion',r.row_version+1);
   UPDATE public.ai_reports SET status='approved',approved_by=auth.uid(),approved_at=now(),approved_snapshot=snap,approved_hash=encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex'),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSIF p_action='archive' AND r.archived_at IS NULL AND length(trim(coalesce(p_reason,'')))>=5 THEN UPDATE public.ai_reports SET archived_at=now(),archived_by=auth.uid(),archive_reason=trim(p_reason),updated_at=now(),row_version=row_version+1 WHERE id=r.id RETURNING * INTO r;
 ELSE RAISE EXCEPTION 'invalid report transition' USING ERRCODE='23514'; END IF;
 INSERT INTO public.report_lifecycle_events(report_id,event_type,from_status,to_status,report_version,actor_id,reason,metadata)
 VALUES(r.id,CASE p_action WHEN 'review' THEN 'reviewed' WHEN 'return' THEN 'returned' WHEN 'approve' THEN 'approved' WHEN 'archive' THEN 'archived' END,old_status,r.status,r.row_version,auth.uid(),nullif(trim(coalesce(p_reason,'')),''),jsonb_build_object('approvedHash',r.approved_hash));
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'report.'||p_action,'ai_report',r.id::text,jsonb_build_object('version',r.row_version));
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rowVersion',r.row_version,'archivedAt',r.archived_at,'approvedAt',r.approved_at,'approvedHash',r.approved_hash);
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_reporting_aggregate(p_period_start date,p_period_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT public.phase1_current_has_capability('report.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_period_end<p_period_start OR p_period_end-p_period_start>730 THEN RAISE EXCEPTION 'invalid reporting period' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object(
  'schema','agape.reporting.aggregate.v1','periodStart',p_period_start,'periodEnd',p_period_end,'asOf',CURRENT_DATE,'source','approved_operational_records',
  'programs',jsonb_build_object('total',(SELECT count(*) FROM public.programs WHERE start_date<=p_period_end AND end_date>=p_period_start),
    'active',(SELECT count(*) FROM public.programs WHERE status='active' AND start_date<=p_period_end AND end_date>=p_period_start),
    'completed',(SELECT count(*) FROM public.programs WHERE status='completed' AND start_date<=p_period_end AND end_date>=p_period_start)),
  'volunteers',jsonb_build_object('approvedServiceHours',coalesce((SELECT round(sum(hours)::numeric,2) FROM public.activity_logs WHERE status='approved' AND date BETWEEN p_period_start AND p_period_end),0)),
  'donations',jsonb_build_object('activeRecords',(SELECT count(*) FROM public.donations WHERE archived_at IS NULL AND received_date BETWEEN p_period_start AND p_period_end),'totalQuantity',coalesce((SELECT round(sum(quantity)::numeric,2) FROM public.donations WHERE archived_at IS NULL AND received_date BETWEEN p_period_start AND p_period_end),0)),
  'needs',jsonb_build_object('documented',(SELECT count(*) FROM public.community_needs WHERE created_at::date BETWEEN p_period_start AND p_period_end)),
  'proposals',jsonb_build_object('created',(SELECT count(*) FROM public.project_proposals WHERE created_at::date BETWEEN p_period_start AND p_period_end)),
  'quality',jsonb_build_object('approvedActivityHoursOnly',true,'archivedDonationsExcluded',true,'voidedImpactExcluded',true,'residentDataIncluded',false)) INTO result;
 RETURN result;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_impact_aggregate(p_program_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NOT public.phase1_current_has_capability('impact.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('schema','agape.impact.aggregate.v1','programId',p_program_id,'asOf',CURRENT_DATE,
  'indicators',coalesce((SELECT jsonb_object_agg(indicator_type,total) FROM(SELECT indicator_type,round(sum(value)::numeric,2) total FROM public.impact_indicators WHERE voided_at IS NULL AND (p_program_id IS NULL OR program_id=p_program_id) GROUP BY indicator_type)s),'{}'::jsonb),
  'qualitativeCounts',coalesce((SELECT jsonb_object_agg(type,total) FROM(SELECT type,count(*) total FROM public.impact_qualitative WHERE voided_at IS NULL AND (p_program_id IS NULL OR program_id=p_program_id) GROUP BY type)s),'{}'::jsonb),
  'followUps',coalesce((SELECT jsonb_object_agg(status,total) FROM(SELECT status,count(*) total FROM public.follow_up_records WHERE voided_at IS NULL AND (p_program_id IS NULL OR program_id=p_program_id) GROUP BY status)s),'{}'::jsonb),
  'privacy',jsonb_build_object('namedSubjectsExcluded',true,'narrativesExcluded',true,'notesExcluded',true));
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_enqueue_notification_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE u public.users%ROWTYPE; runtime public.phase6_delivery_runtime%ROWTYPE; ch text; enabled boolean; destination_ready boolean; delivery_status text; delivery_mode text; out_id uuid;
BEGIN
 IF NEW.channel<>'in_app' THEN RETURN NEW; END IF;
 SELECT * INTO u FROM public.users WHERE id=NEW.user_id;
 FOREACH ch IN ARRAY ARRAY['email','sms'] LOOP
  enabled:=CASE WHEN ch='email' THEN coalesce((u.notification_prefs->>'email')::boolean,true) ELSE coalesce((u.notification_prefs->>'sms')::boolean,false) END;
  destination_ready:=CASE WHEN ch='email' THEN u.email IS NOT NULL ELSE u.phone IS NOT NULL END;
  SELECT * INTO runtime FROM public.phase6_delivery_runtime WHERE channel=ch;
  delivery_status:=CASE WHEN enabled AND destination_ready AND (runtime.mode='live' OR (runtime.mode='synthetic' AND NEW.user_id=ANY(runtime.synthetic_user_ids))) THEN 'queued' ELSE 'suppressed' END;
  delivery_mode:=CASE WHEN runtime.mode='live' THEN 'live' ELSE 'synthetic' END;
  INSERT INTO public.notification_delivery_outbox(notification_id,user_id,channel,data_mode,status,idempotency_key,next_attempt_at)
  VALUES(NEW.id,NEW.user_id,ch,delivery_mode,delivery_status,'notification:'||NEW.id::text||':'||ch,CASE WHEN delivery_status='queued' THEN now() END)
  ON CONFLICT(notification_id,channel) DO NOTHING RETURNING id INTO out_id;
  IF out_id IS NOT NULL THEN INSERT INTO public.notification_delivery_events(outbox_id,event_type,metadata) VALUES(out_id,CASE WHEN delivery_status='queued' THEN 'queued' ELSE 'suppressed' END,jsonb_build_object('reason',CASE WHEN NOT enabled THEN 'preference_off' WHEN NOT destination_ready THEN 'destination_missing' WHEN runtime.mode='synthetic' AND NOT NEW.user_id=ANY(runtime.synthetic_user_ids) THEN 'actor_not_allowlisted' ELSE 'runtime_off' END)); END IF;
 END LOOP; RETURN NEW;
END;$function$;
DROP TRIGGER IF EXISTS phase6_notification_delivery_enqueue ON public.notifications;
CREATE TRIGGER phase6_notification_delivery_enqueue AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.phase6_enqueue_notification_delivery();

CREATE OR REPLACE FUNCTION public.phase6_configure_delivery(p_channel text,p_mode text,p_provider_key text,p_synthetic_user_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE r public.phase6_delivery_runtime%ROWTYPE;
BEGIN
 IF NOT public.phase2_current_has_capability('communication.provider.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_channel NOT IN('email','sms') OR p_mode NOT IN('off','synthetic','live') OR p_provider_key !~ '^[a-z][a-z0-9_-]{0,63}$' THEN RAISE EXCEPTION 'invalid delivery runtime' USING ERRCODE='22023'; END IF;
 IF p_mode='live' AND p_provider_key IN('disabled','unconfigured','synthetic') THEN RAISE EXCEPTION 'live provider required' USING ERRCODE='23514'; END IF;
 UPDATE public.phase6_delivery_runtime SET mode=p_mode,provider_key=p_provider_key,synthetic_user_ids=coalesce(p_synthetic_user_ids,'{}'),row_version=row_version+1,updated_by=auth.uid(),updated_at=now() WHERE channel=p_channel RETURNING * INTO r;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'communication.runtime.configured','notification_delivery',p_channel,jsonb_build_object('mode',p_mode,'provider',p_provider_key));
 RETURN jsonb_build_object('channel',r.channel,'mode',r.mode,'providerKey',r.provider_key,'rowVersion',r.row_version,'syntheticUserCount',cardinality(r.synthetic_user_ids));
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_get_delivery_runtime()
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NOT public.phase2_current_has_capability('communication.provider.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT jsonb_build_object('channel',r.channel,'mode',r.mode,'providerKey',r.provider_key,'rowVersion',r.row_version,'syntheticUserCount',cardinality(r.synthetic_user_ids),
  'queuedCount',(SELECT count(*) FROM public.notification_delivery_outbox o WHERE o.channel=r.channel AND o.status='queued'),
  'failedCount',(SELECT count(*) FROM public.notification_delivery_outbox o WHERE o.channel=r.channel AND o.status='failed'),
  'suppressedCount',(SELECT count(*) FROM public.notification_delivery_outbox o WHERE o.channel=r.channel AND o.status='suppressed')) FROM public.phase6_delivery_runtime r ORDER BY r.channel;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_claim_notification_deliveries(p_limit integer DEFAULT 20,p_lease_seconds integer DEFAULT 300)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 60 AND 900 THEN RAISE EXCEPTION 'invalid claim bounds' USING ERRCODE='22023'; END IF;
 WITH recovered AS(
  UPDATE public.notification_delivery_outbox SET status='failed',claim_token=NULL,lease_until=NULL,next_attempt_at=now(),last_error_code='lease_expired',updated_at=now()
  WHERE status='sending' AND lease_until<now() RETURNING id)
 INSERT INTO public.notification_delivery_events(outbox_id,event_type,metadata)
 SELECT id,'lease_recovered',jsonb_build_object('reason','lease_expired') FROM recovered;
 RETURN QUERY WITH candidates AS(
  SELECT o.id FROM public.notification_delivery_outbox o JOIN public.phase6_delivery_runtime r ON r.channel=o.channel JOIN public.users u ON u.id=o.user_id
  WHERE o.status IN('queued','failed') AND coalesce(o.next_attempt_at,now())<=now() AND r.mode<>'off' AND o.data_mode=r.mode
    AND (r.mode='live' OR o.user_id=ANY(r.synthetic_user_ids)) AND u.status='active' AND u.is_active IS TRUE
  ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT p_limit), claimed AS(
   UPDATE public.notification_delivery_outbox o SET status='sending',attempt_count=attempt_count+1,claim_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
   FROM candidates c WHERE o.id=c.id RETURNING o.*)
 SELECT jsonb_build_object('id',c.id,'claimToken',c.claim_token,'channel',c.channel,'dataMode',c.data_mode,'providerKey',r.provider_key,
  'destination',CASE WHEN c.channel='email' THEN u.email ELSE u.phone END,'title',n.title,'message',n.message,'actionUrl',n.action_url,'attemptNumber',c.attempt_count)
 FROM claimed c JOIN public.notifications n ON n.id=c.notification_id JOIN public.users u ON u.id=c.user_id JOIN public.phase6_delivery_runtime r ON r.channel=c.channel;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_requeue_suppressed_deliveries(p_channel text,p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE affected integer;
BEGIN
 IF NOT public.phase2_current_has_capability('communication.provider.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_channel NOT IN('email','sms') OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid requeue request' USING ERRCODE='22023'; END IF;
 WITH candidates AS(
  SELECT o.id FROM public.notification_delivery_outbox o
  JOIN public.phase6_delivery_runtime r ON r.channel=o.channel
  JOIN public.users u ON u.id=o.user_id
  WHERE o.channel=p_channel AND o.status='suppressed' AND r.mode<>'off'
    AND (r.mode='live' OR o.user_id=ANY(r.synthetic_user_ids))
    AND u.status='active' AND u.is_active IS TRUE
    AND CASE WHEN p_channel='email' THEN u.email IS NOT NULL AND coalesce((u.notification_prefs->>'email')::boolean,true)
             ELSE u.phone IS NOT NULL AND coalesce((u.notification_prefs->>'sms')::boolean,false) END
  ORDER BY o.created_at LIMIT p_limit FOR UPDATE OF o SKIP LOCKED), changed AS(
  UPDATE public.notification_delivery_outbox o SET status='queued',data_mode=r.mode,next_attempt_at=now(),updated_at=now()
  FROM candidates c, public.phase6_delivery_runtime r WHERE o.id=c.id AND r.channel=p_channel RETURNING o.id)
 INSERT INTO public.notification_delivery_events(outbox_id,event_type,actor_id,metadata)
 SELECT id,'requeued',auth.uid(),jsonb_build_object('channel',p_channel) FROM changed;
 GET DIAGNOSTICS affected=ROW_COUNT;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'communication.delivery.requeued','notification_delivery',p_channel,jsonb_build_object('count',affected));
 RETURN affected;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase6_finalize_notification_delivery(p_outbox_id uuid,p_claim_token uuid,p_result text,p_provider_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE o public.notification_delivery_outbox%ROWTYPE; next_time timestamptz;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.notification_delivery_outbox WHERE id=p_outbox_id FOR UPDATE;
 IF o.id IS NULL OR o.status<>'sending' OR o.claim_token<>p_claim_token OR o.lease_until<now() THEN RAISE EXCEPTION 'invalid delivery claim' USING ERRCODE='40001'; END IF;
 IF p_result='sent' THEN
  UPDATE public.notification_delivery_outbox SET status='sent',provider_message_id=left(p_provider_message_id,200),sent_at=now(),claim_token=NULL,lease_until=NULL,next_attempt_at=NULL,last_error_code=NULL,updated_at=now() WHERE id=o.id;
  INSERT INTO public.notification_delivery_events(outbox_id,event_type,metadata) VALUES(o.id,'sent',jsonb_build_object('attempt',o.attempt_count));
 ELSIF p_result='failed' AND p_error_code~'^[a-z][a-z0-9_]{0,79}$' THEN
  next_time:=CASE WHEN o.attempt_count>=5 THEN NULL ELSE now()+make_interval(secs=>least(3600,30*(2^least(o.attempt_count,6))::integer)) END;
  UPDATE public.notification_delivery_outbox SET status=CASE WHEN o.attempt_count>=5 THEN 'cancelled' ELSE 'failed' END,last_error_code=p_error_code,next_attempt_at=next_time,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=o.id;
  INSERT INTO public.notification_delivery_events(outbox_id,event_type,metadata) VALUES(o.id,CASE WHEN o.attempt_count>=5 THEN 'cancelled' ELSE 'retry_scheduled' END,jsonb_build_object('attempt',o.attempt_count,'errorCode',p_error_code));
 ELSE RAISE EXCEPTION 'invalid delivery result' USING ERRCODE='22023'; END IF;
END;$function$;

CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE WHEN p_table IN('report_lifecycle_events','phase6_delivery_runtime','notification_delivery_events') THEN 'audit_logs'
  WHEN p_table='notification_delivery_outbox' THEN 'communication'
  WHEN p_table='phase5_integrity_runtime' OR p_table='finance_integrity_events' THEN 'audit_logs'
  WHEN p_table='finance_integrity_proofs' THEN 'financial_integrity'
  WHEN p_table='phase4_component_runtime' OR p_table='volunteer_invitation_events' THEN 'audit_logs'
  WHEN p_table LIKE 'volunteer_%' THEN 'volunteers'
  WHEN p_table LIKE 'proposal_budget_%' OR p_table='budget_categories' OR p_table='budget_review_events' OR p_table LIKE 'program_budget_%' OR p_table LIKE 'program_financial_%' OR p_table='program_expenditures' OR p_table LIKE 'liquidation_%' OR p_table='program_finance_events' THEN 'budgets'
  WHEN p_table LIKE 'partner_contact%' OR p_table LIKE 'partnership_%' OR p_table LIKE 'partner_entit%' OR p_table='partner_type_policies' OR p_table='legacy_account_partner_mappings' THEN 'partnerships'
  WHEN p_table LIKE 'historical_program%' THEN 'historical_programs'
  WHEN p_table LIKE 'proposal%' OR p_table IN('project_proposals','project_templates') THEN 'proposals'
  WHEN p_table LIKE 'program%' OR p_table='activity_photos' THEN 'programs'
  WHEN p_table IN('phase2_component_runtime','phase2_release_attestations','phase2_cutover_state') THEN 'audit_logs'
  WHEN p_table='users' THEN 'user_management' WHEN p_table='audit_logs' THEN 'audit_logs'
  WHEN p_table IN('barangays','partnership_history') THEN 'partnerships' WHEN p_table LIKE 'survey%' THEN 'surveys'
  WHEN p_table='community_needs' THEN 'community_needs' WHEN p_table='field_observations' THEN 'observations'
  WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets') THEN 'skills_assets'
  WHEN p_table='attendance' THEN 'attendance' WHEN p_table='activity_logs' THEN 'activity_logs' WHEN p_table LIKE 'donation%' THEN 'donations'
  WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' THEN 'impact'
  WHEN p_table LIKE 'analytics%' THEN 'analytics' WHEN p_table LIKE 'ai_recommendation%' THEN 'ai_assistance' WHEN p_table LIKE 'ai_report%' THEN 'reports'
  WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments') THEN 'communication'
  WHEN p_table='domain_correction_events' OR p_table LIKE 'phase2_storage_read_event%' THEN 'audit_logs'
  WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles','households','residents','household_memberships') THEN 'profiling' ELSE NULL END;
$function$;

REVOKE INSERT,UPDATE,DELETE ON public.ai_reports FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.phase6_create_report(text,date,date,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase6_list_reports(boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase6_transition_report(uuid,bigint,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase6_reporting_aggregate(date,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase6_impact_aggregate(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase6_enqueue_notification_delivery() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase6_configure_delivery(text,text,text,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase6_get_delivery_runtime() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase6_claim_notification_deliveries(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase6_finalize_notification_delivery(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase6_requeue_suppressed_deliveries(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase6_create_report(text,date,date,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase6_list_reports(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase6_transition_report(uuid,bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase6_reporting_aggregate(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase6_impact_aggregate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase6_configure_delivery(text,text,text,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase6_get_delivery_runtime() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase6_claim_notification_deliveries(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase6_finalize_notification_delivery(uuid,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase6_requeue_suppressed_deliveries(text,integer) TO authenticated;
COMMIT;
