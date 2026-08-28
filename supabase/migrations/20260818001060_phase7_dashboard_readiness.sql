-- Phase 7: one role-scoped dashboard contract and an Admin-only readiness view.
-- The functions expose counts and runtime states only; they never expose PII,
-- financial documents, resident records, secrets, or operational payloads.
BEGIN;
SET LOCAL search_path=public,extensions,pg_catalog;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.phase7_get_dashboard_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; cards jsonb:='[]'::jsonb; unread_count bigint;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE THEN RAISE EXCEPTION 'inactive actor' USING ERRCODE='42501'; END IF;
 IF actor.role IN('office','student_org','department','paraya_officer','barangay_official') THEN RAISE EXCEPTION 'historical account only' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO unread_count FROM public.notifications WHERE user_id=actor.id AND is_read=false;

 IF actor.role='admin' THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','active_users','label','Active accounts','value',(SELECT count(*) FROM public.users WHERE status='active' AND is_active=true),'href','/admin/users','tone','neutral'),
   jsonb_build_object('key','pending_users','label','Pending accounts','value',(SELECT count(*) FROM public.users WHERE status='pending'),'href','/admin/users','tone','warning'),
   jsonb_build_object('key','security_events','label','Audit events (30 days)','value',(SELECT count(*) FROM public.audit_logs WHERE created_at>=now()-interval '30 days'),'href','/admin/audit-logs','tone','info'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/admin/notifications','tone','neutral'));
 ELSIF actor.role='finance_officer' THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','finance_queue','label','Proposals for Finance','value',(SELECT count(*) FROM public.project_proposals WHERE status='finance_review'),'href','/officer/finance','tone','warning'),
   jsonb_build_object('key','budget_queue','label','Submitted budgets','value',(SELECT count(*) FROM public.proposal_budget_revisions WHERE status='submitted'),'href','/officer/phase-2','tone','info'),
   jsonb_build_object('key','liquidation_queue','label','Submitted liquidations','value',(SELECT count(*) FROM public.liquidation_submissions WHERE status='submitted'),'href','/officer/phase-2','tone','warning'),
   jsonb_build_object('key','integrity_queue','label','Integrity proofs queued','value',(SELECT count(*) FROM public.finance_integrity_proofs WHERE anchor_status IN('queued','failed')),'href','/officer/integrity','tone','neutral'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/officer/notifications','tone','neutral'));
 ELSIF actor.role IN('paraya_director','paraya_associate','paraya_researcher') THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','programs','label','Operational programs','value',(SELECT count(*) FROM public.programs WHERE status<>'cancelled'),'href','/officer/programs','tone','info'),
   jsonb_build_object('key','proposal_queue','label','Open proposals','value',(SELECT count(*) FROM public.project_proposals WHERE status NOT IN('approved','rejected')),'href','/officer/proposals','tone','warning'),
   jsonb_build_object('key','active_partnerships','label','Active partnerships','value',(SELECT count(*) FROM public.partnership_terms WHERE status='active' AND (expires_on IS NULL OR expires_on>=CURRENT_DATE)),'href','/officer/partnerships','tone','success'),
   jsonb_build_object('key','report_queue','label','Reports awaiting completion','value',(SELECT count(*) FROM public.ai_reports WHERE status IN('draft','reviewed') AND archived_at IS NULL),'href','/officer/reports','tone','neutral'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/officer/notifications','tone','neutral'));
 ELSIF actor.role IN('barangay_captain','barangay_secretary','barangay_mother_leader') THEN
  IF actor.barangay_id IS NULL THEN RAISE EXCEPTION 'barangay scope missing' USING ERRCODE='42501'; END IF;
  cards:=jsonb_build_array(
   jsonb_build_object('key','programs','label','Barangay programs','value',(SELECT count(*) FROM public.programs WHERE barangay_id=actor.barangay_id AND status<>'cancelled'),'href','/barangay/programs','tone','info'),
   jsonb_build_object('key','needs','label','Community needs','value',(SELECT count(*) FROM public.community_needs WHERE barangay_id=actor.barangay_id),'href','/barangay/community-needs','tone','warning'),
   jsonb_build_object('key','approved_profiles','label','Approved sample packages','value',(SELECT count(*) FROM public.profiling_submissions s JOIN public.profiling_cycles c ON c.id=s.cycle_id WHERE c.barangay_id=actor.barangay_id AND s.status='approved'),'href','/barangay/profiling','tone','success'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/barangay/notifications','tone','neutral'));
 ELSIF actor.role='volunteer' THEN
  cards:=jsonb_build_array(
   jsonb_build_object('key','joined_programs','label','Programs joined','value',(SELECT count(*) FROM public.program_signups WHERE volunteer_id=actor.id AND status<>'withdrawn' AND approval_status='approved'),'href','/volunteer/programs','tone','info'),
   jsonb_build_object('key','approved_hours','label','Approved service hours','value',coalesce((SELECT round(sum(hours)::numeric,2) FROM public.activity_logs WHERE volunteer_id=actor.id AND status='approved'),0),'href','/volunteer/activity-log','tone','success'),
   jsonb_build_object('key','active_assignments','label','Active assignments','value',(SELECT count(*) FROM public.volunteer_assignments WHERE volunteer_id=actor.id AND status IN('assigned','ongoing')),'href','/volunteer/programs','tone','warning'),
   jsonb_build_object('key','unread_notifications','label','Unread notifications','value',unread_count,'href','/volunteer/notifications','tone','neutral'));
 ELSE RAISE EXCEPTION 'unsupported role' USING ERRCODE='42501'; END IF;

 RETURN jsonb_build_object('schema','agape.dashboard.summary.v1','role',actor.role,'asOf',now(),'cards',cards);
END;$function$;

CREATE OR REPLACE FUNCTION public.phase7_get_system_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NOT public.phase1_current_has_capability('admin.audit.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'schema','agape.system.readiness.v1','asOf',now(),
  'databaseModes',jsonb_build_object(
   'profiling',coalesce((SELECT mode FROM public.profiling_runtime_settings WHERE id=true),'missing'),
   'phase2',coalesce((SELECT jsonb_object_agg(component,mode) FROM public.phase2_component_runtime),'{}'::jsonb),
   'phase4',coalesce((SELECT jsonb_object_agg(component,mode) FROM public.phase4_component_runtime),'{}'::jsonb),
   'financeIntegrity',coalesce((SELECT mode FROM public.phase5_integrity_runtime WHERE component='finance_integrity'),'missing'),
   'communication',coalesce((SELECT jsonb_object_agg(channel,mode) FROM public.phase6_delivery_runtime),'{}'::jsonb)),
  'mutationAuthority',coalesce((SELECT jsonb_object_agg(component,write_authority) FROM public.phase2_cutover_state),'{}'::jsonb),
  'accountHealth',jsonb_build_object(
   'active',(SELECT count(*) FROM public.users WHERE status='active' AND is_active=true),
   'pending',(SELECT count(*) FROM public.users WHERE status='pending'),
   'suspended',(SELECT count(*) FROM public.users WHERE status='suspended' OR is_active=false),
   'unmappedLegacy',(SELECT count(*) FROM public.users WHERE role IN('paraya_officer','barangay_official') AND status='active' AND is_active=true)),
  'queues',jsonb_build_object(
   'notificationDelivery',(SELECT count(*) FROM public.notification_delivery_outbox WHERE status IN('queued','failed','sending')),
   'financeIntegrity',(SELECT count(*) FROM public.finance_integrity_proofs WHERE anchor_status IN('queued','failed','submitting')),
   'partnerEmail',(SELECT count(*) FROM public.partner_contact_email_outbox WHERE status IN('queued','failed','sending'))));
END;$function$;

REVOKE ALL ON FUNCTION public.phase7_get_dashboard_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase7_get_system_readiness() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase7_get_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase7_get_system_readiness() TO authenticated;
COMMIT;
