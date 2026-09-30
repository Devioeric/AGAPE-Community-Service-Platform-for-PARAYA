-- Consolidate each active dashboard onto one permission-aware aggregate KPI
-- contract. This migration changes no stored records and preserves the v2 wire
-- shape introduced by the barangay-role consolidation contract.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase7_get_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  actor public.users%ROWTYPE;
  cards jsonb := '[]'::jsonb;
  unread_count bigint;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF actor.id IS NULL
     OR actor.status<>'active'
     OR actor.is_active IS NOT TRUE
     OR NOT actor.role=ANY(ARRAY[
       'paraya_director','paraya_associate','paraya_researcher',
       'finance_officer','barangay_secretary','volunteer','admin'
     ]) THEN
    RAISE EXCEPTION 'dashboard unavailable for this account' USING ERRCODE='42501';
  END IF;

  SELECT count(*) INTO unread_count
  FROM public.notifications
  WHERE user_id=actor.id AND is_read=false;

  IF actor.role='admin' THEN
    IF public.phase1_current_has_capability('admin.users.manage') THEN
      cards:=cards||jsonb_build_array(
        jsonb_build_object(
          'key','active_users','label','Active accounts',
          'value',(SELECT count(*) FROM public.users
                   WHERE status='active' AND is_active=true
                     AND role=ANY(ARRAY[
                       'paraya_director','paraya_associate','paraya_researcher',
                       'finance_officer','barangay_secretary','volunteer','admin'
                     ])),
          'href','/admin/users','tone','neutral'
        ),
        jsonb_build_object(
          'key','pending_users','label','Pending accounts',
          'value',(SELECT count(*) FROM public.users
                   WHERE status='pending'
                     AND role=ANY(ARRAY[
                       'paraya_director','paraya_associate','paraya_researcher',
                       'finance_officer','barangay_secretary','volunteer','admin'
                     ])),
          'href','/admin/users','tone','warning'
        )
      );
    END IF;
    IF public.phase1_current_has_capability('admin.audit.read') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','security_events','label','Audit events (30 days)',
        'value',(SELECT count(*) FROM public.audit_logs WHERE created_at>=now()-interval '30 days'),
        'href','/admin/audit-logs','tone','info'
      ));
    END IF;

  ELSIF actor.role='finance_officer' THEN
    IF public.phase1_current_has_capability('proposal.finance') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','finance_queue','label','Proposals for Finance',
        'value',(SELECT count(*) FROM public.project_proposals WHERE status='finance_review'),
        'href','/officer/finance','tone','warning'
      ));
    END IF;
    IF public.phase2_current_has_capability('budget.review') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','budget_queue','label','Submitted budgets',
        'value',(SELECT count(*) FROM public.proposal_budget_revisions WHERE status='submitted'),
        'href','/officer/phase-2','tone','info'
      ));
    END IF;
    IF public.phase2_current_has_capability('budget.liquidation.review') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','liquidation_queue','label','Submitted liquidations',
        'value',(SELECT count(*) FROM public.liquidation_submissions WHERE status='submitted'),
        'href','/officer/phase-2','tone','warning'
      ));
    END IF;

  ELSIF actor.role IN('paraya_director','paraya_associate') THEN
    IF public.phase1_current_has_capability('program.read') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','programs','label','Operational programs',
        'value',(SELECT count(*) FROM public.programs WHERE status<>'cancelled'),
        'href','/officer/programs','tone','info'
      ));
    END IF;
    IF public.phase1_current_has_capability('proposal.read') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','proposal_queue','label','Open proposals',
        'value',(SELECT count(*) FROM public.project_proposals WHERE status NOT IN('approved','rejected')),
        'href','/officer/proposals','tone','warning'
      ));
    END IF;
    IF public.phase1_current_has_capability('partnership.read') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','active_partnerships','label','Active partnerships',
        'value',(SELECT count(*) FROM public.partnership_terms
                 WHERE status='active' AND (expires_on IS NULL OR expires_on>=CURRENT_DATE)),
        'href','/officer/partnerships','tone','success'
      ));
    END IF;

  ELSIF actor.role='paraya_researcher' THEN
    IF public.phase1_current_has_capability('profiling.validate') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','profiling_reviews','label','Profiling packages awaiting review',
        'value',(SELECT count(*) FROM public.profiling_submissions WHERE status='pending'),
        'href','/officer/profiling','tone','warning'
      ));
    END IF;
    IF public.phase1_current_has_capability('community_need.validate') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','needs_reviews','label','Community needs awaiting review',
        'value',(SELECT count(*) FROM public.community_needs WHERE approval_status='pending_paraya_review'),
        'href','/officer/community-needs/review','tone','warning'
      ));
    END IF;
    IF public.phase1_current_has_capability('program.read') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','programs','label','Operational programs',
        'value',(SELECT count(*) FROM public.programs WHERE status<>'cancelled'),
        'href','/officer/programs','tone','info'
      ));
    END IF;

  ELSIF actor.role='barangay_secretary' THEN
    IF actor.barangay_id IS NULL THEN
      RAISE EXCEPTION 'barangay scope missing' USING ERRCODE='42501';
    END IF;
    IF public.phase1_current_has_capability('partnership.read') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','partnership','label','Active barangay partnerships',
        'value',(SELECT count(*)
                 FROM public.partner_entities entity
                 JOIN public.partnership_terms term ON term.partner_id=entity.id
                 WHERE entity.barangay_id=actor.barangay_id
                   AND term.status='active'
                   AND (term.expires_on IS NULL OR term.expires_on>=CURRENT_DATE)),
        'href','/barangay/partnership','tone','info'
      ));
    END IF;
    IF public.phase1_current_has_capability('community_need.read') THEN
      cards:=cards||jsonb_build_array(
        jsonb_build_object(
          'key','needs_review','label','Needs awaiting PARAYA review',
          'value',(SELECT count(*) FROM public.community_needs
                   WHERE barangay_id=actor.barangay_id AND approval_status='pending_paraya_review'),
          'href','/barangay/submit-needs','tone','warning'
        ),
        jsonb_build_object(
          'key','needs_revision','label','Needs requiring revision',
          'value',(SELECT count(*) FROM public.community_needs
                   WHERE barangay_id=actor.barangay_id AND approval_status='needs_revision'),
          'href','/barangay/submit-needs','tone','warning'
        )
      );
    END IF;
    IF public.phase1_current_has_capability('profiling.aggregate.read') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','approved_profiles','label','Approved sample packages',
        'value',(SELECT count(*)
                 FROM public.profiling_submissions submission
                 JOIN public.profiling_cycles cycle ON cycle.id=submission.cycle_id
                 WHERE cycle.barangay_id=actor.barangay_id AND submission.status='approved'),
        'href','/barangay/profiling','tone','success'
      ));
    END IF;
    IF public.phase1_current_has_capability('profiling.acknowledge') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','profiling_acknowledgments','label','Validated cycles awaiting acknowledgment',
        'value',(SELECT count(*) FROM public.profiling_cycles cycle
                 WHERE cycle.barangay_id=actor.barangay_id
                   AND cycle.status IN('completed','archived')
                   AND cycle.barangay_acknowledged_at IS NULL
                   AND cycle.completed_at>='2026-09-03'::date),
        'href','/barangay/profiling','tone','neutral'
      ));
    END IF;
    IF public.phase1_current_has_capability('skill_asset.read') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','skills_assets','label','Skills and assets',
        'value',(SELECT count(*) FROM public.barangay_skills WHERE barangay_id=actor.barangay_id)
                +(SELECT count(*) FROM public.barangay_assets WHERE barangay_id=actor.barangay_id),
        'href','/barangay/skills-assets','tone','neutral'
      ));
    END IF;

  ELSIF actor.role='volunteer' THEN
    IF public.phase1_current_has_capability('volunteer.self') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','joined_programs','label','Programs joined',
        'value',(SELECT count(*) FROM public.program_signups
                 WHERE volunteer_id=actor.id AND status<>'withdrawn' AND approval_status='approved'),
        'href','/volunteer/programs','tone','info'
      ));
    END IF;
    IF public.phase1_current_has_capability('activity_log.self') THEN
      cards:=cards||jsonb_build_array(jsonb_build_object(
        'key','approved_hours','label','Approved service hours',
        'value',coalesce((SELECT round(sum(hours)::numeric,2) FROM public.activity_logs
                          WHERE volunteer_id=actor.id AND status='approved'),0),
        'href','/volunteer/hours','tone','success'
      ));
    END IF;
  END IF;

  -- Notifications are always actor-scoped and are available to every approved
  -- active login role independently of broader communication permissions.
  cards:=cards||jsonb_build_array(jsonb_build_object(
    'key','unread_notifications','label','Unread notifications','value',unread_count,
    'href',CASE actor.role
      WHEN 'admin' THEN '/admin/notifications'
      WHEN 'barangay_secretary' THEN '/barangay/notifications'
      WHEN 'volunteer' THEN '/volunteer/notifications'
      ELSE '/officer/notifications'
    END,
    'tone','neutral'
  ));

  RETURN jsonb_build_object(
    'schema','agape.dashboard.summary.v2',
    'role',actor.role,
    'asOf',now(),
    'cards',cards
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase7_get_dashboard_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase7_get_dashboard_summary() TO authenticated;

COMMIT;
