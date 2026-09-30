BEGIN;

-- Forward-only recruitment/attendance safety. Existing signup identities and
-- attribution survive withdrawal/rejoin. No program-completion gate is added.
ALTER TABLE public.programs ADD COLUMN enrollment_version bigint NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.programs.enrollment_version IS 'Internal enrollment serialization counter; protects capacity under repeatable-read as well as read-committed transactions.';

-- Invoker security deliberately distinguishes direct PostgREST writes from
-- reviewed SECURITY DEFINER workflows; a request-set GUC is never a bypass.
CREATE OR REPLACE FUNCTION public.guard_phase0_program_signup_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF current_user::text NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF NOT public.phase0_current_account_is_active_volunteer()
    OR NOT public.phase1_current_has_capability('volunteer.self') THEN
  RAISE EXCEPTION 'Only an active Volunteer may mutate a signup directly' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.volunteer_id IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'A Volunteer may create only their own signup' USING ERRCODE='42501';
  END IF;
  NEW.status:='pending'; NEW.approval_status:='approved'; NEW.added_by:=NULL;
  NEW.confirmed_at:=NULL; NEW.approved_by:=NULL; NEW.approved_at:=NULL;
  NEW.approval_notes:=NULL; NEW.signed_up_at:=now();
 ELSIF OLD.volunteer_id IS DISTINCT FROM auth.uid() OR NEW.volunteer_id IS DISTINCT FROM auth.uid()
       OR OLD.status NOT IN('pending','confirmed') OR NEW.status<>'withdrawn' THEN
  RAISE EXCEPTION 'A Volunteer may only withdraw their own active signup' USING ERRCODE='42501';
 ELSIF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
  RAISE EXCEPTION 'Signup ownership, approval, confirmation, and audit fields are immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$function$;

CREATE FUNCTION public.phase8_assert_program_signup_eligible(p_program_id uuid,p_volunteer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE p public.programs; u public.users; v public.volunteers; r public.volunteer_program_requirements;
 cfg public.phase4_component_runtime; has_requirements boolean:=false; reviewed_exception boolean;
BEGIN
 -- Every enrollment entry point locks the SAME parent before capacity reads.
 SELECT * INTO p FROM public.programs WHERE id=p_program_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Program not found' USING ERRCODE='P0002'; END IF;
 IF p.status NOT IN('planning','upcoming','active') THEN
  RAISE EXCEPTION 'Program is not open for enrollment' USING ERRCODE='23514';
 END IF;
 SELECT * INTO u FROM public.users WHERE id=p_volunteer_id FOR SHARE;
 IF u.id IS NULL OR u.role<>'volunteer' OR u.status<>'active' OR u.is_active IS NOT TRUE THEN
  RAISE EXCEPTION 'Target user is not an active Volunteer' USING ERRCODE='23514';
 END IF;
 -- V1 remains usable with Phase 4 off. Apply configured course/year/deadline
 -- eligibility only to programs inside an enabled component's data mode.
 FOR cfg IN SELECT * FROM public.phase4_component_runtime
  WHERE mode<>'off' AND mode=p.phase2_data_mode
    AND (mode='live' OR p.id=ANY(synthetic_program_ids)) LOOP
  has_requirements:=true;
  IF cfg.mode='synthetic' AND (u.is_synthetic_test IS NOT TRUE OR NOT u.id=ANY(cfg.synthetic_user_ids)
    OR (auth.uid() IS NOT NULL AND NOT auth.uid()=ANY(cfg.synthetic_user_ids))) THEN
   RAISE EXCEPTION 'Volunteer or actor is outside the active data mode' USING ERRCODE='42501';
  END IF;
 END LOOP;
 IF NOT has_requirements THEN RETURN; END IF;
 -- An explicit PARAYA waitlist approval retains its existing exception
 -- semantics; it never overrides active-account, lifecycle, or capacity checks.
 SELECT EXISTS(SELECT 1 FROM public.volunteer_program_waitlist w
  WHERE w.program_id=p.id AND w.volunteer_id=u.id AND w.state='approved'
    AND w.reviewed_by IS NOT NULL) INTO reviewed_exception;
 IF reviewed_exception THEN RETURN; END IF;
 SELECT * INTO v FROM public.volunteers WHERE user_id=u.id;
 SELECT * INTO r FROM public.volunteer_program_requirements WHERE program_id=p.id;
 IF v.user_id IS NULL
   OR (cardinality(coalesce(r.allowed_courses,'{}'))>0 AND (v.course IS NULL OR NOT v.course=ANY(r.allowed_courses)))
   OR (r.minimum_year_level IS NOT NULL AND (v.year_level IS NULL OR v.year_level<r.minimum_year_level))
   OR (r.maximum_year_level IS NOT NULL AND (v.year_level IS NULL OR v.year_level>r.maximum_year_level))
   OR (r.signup_deadline IS NOT NULL AND r.signup_deadline<=now()) THEN
  RAISE EXCEPTION 'Volunteer does not meet program eligibility' USING ERRCODE='23514';
 END IF;
 -- Skills, schedule suitability, and distance remain ranking factors.
END;
$function$;

CREATE FUNCTION public.phase8_guard_program_signup_invariants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE p public.programs; enrolled bigint; entering boolean;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.program_id IS DISTINCT FROM OLD.program_id
    OR NEW.volunteer_id IS DISTINCT FROM OLD.volunteer_id THEN
   RAISE EXCEPTION 'Signup identity is immutable' USING ERRCODE='42501';
  END IF;
  NEW.signed_up_at:=OLD.signed_up_at;
 END IF;
 SELECT * INTO p FROM public.programs WHERE id=NEW.program_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Program not found' USING ERRCODE='P0002'; END IF;
 -- A real parent write also forces stale repeatable-read snapshots to fail
 -- with 40001 instead of counting a pre-concurrent-enrollment snapshot.
 UPDATE public.programs SET enrollment_version=enrollment_version+1 WHERE id=p.id;
 entering:=NEW.status<>'withdrawn' AND (TG_OP='INSERT' OR OLD.status='withdrawn');
 IF entering THEN
  PERFORM public.phase8_assert_program_signup_eligible(NEW.program_id,NEW.volunteer_id);
  -- Exclude the same unique signup during legacy ON CONFLICT reactivation.
  SELECT count(*) INTO enrolled FROM public.program_signups s
   WHERE s.program_id=NEW.program_id AND s.status<>'withdrawn' AND s.volunteer_id<>NEW.volunteer_id;
  IF p.max_volunteers IS NOT NULL AND enrolled>=p.max_volunteers THEN
   RAISE EXCEPTION 'Program is full' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;

CREATE TRIGGER phase8_program_signup_invariants BEFORE INSERT OR UPDATE ON public.program_signups
 FOR EACH ROW EXECUTE FUNCTION public.phase8_guard_program_signup_invariants();

CREATE FUNCTION public.phase8_audit_program_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
  VALUES(coalesce(auth.uid(),NEW.added_by),'program.signup.'||CASE WHEN TG_OP='INSERT' THEN 'created'
    WHEN NEW.status='withdrawn' THEN 'withdrawn' ELSE 'reactivated' END,'program_signups',NEW.id::text,
   jsonb_build_object('programId',NEW.program_id,'volunteerId',NEW.volunteer_id,
    'previousStatus',CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,'status',NEW.status,
    'originalSignedUpAt',NEW.signed_up_at));
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER phase8_program_signup_audit AFTER INSERT OR UPDATE ON public.program_signups
 FOR EACH ROW EXECUTE FUNCTION public.phase8_audit_program_signup();

CREATE FUNCTION public.phase8_guard_program_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF NEW.max_volunteers IS NOT NULL AND (NEW.max_volunteers<0 OR
   NEW.max_volunteers<(SELECT count(*) FROM public.program_signups WHERE program_id=NEW.id AND status<>'withdrawn')) THEN
  RAISE EXCEPTION 'Capacity cannot be below the enrolled volunteer count' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER phase8_program_capacity_guard BEFORE INSERT OR UPDATE OF max_volunteers ON public.programs
 FOR EACH ROW EXECUTE FUNCTION public.phase8_guard_program_capacity();

CREATE FUNCTION public.phase8_set_program_signup(p_program_id uuid,p_volunteer_id uuid DEFAULT NULL,p_action text DEFAULT 'join')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE target uuid:=coalesce(p_volunteer_id,auth.uid()); p public.programs; existing public.program_signups;
 saved public.program_signups; manager boolean;
BEGIN
 IF NOT public.phase0_current_account_is_active() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 manager:=target IS DISTINCT FROM auth.uid();
 IF (manager AND NOT public.phase1_current_has_capability('volunteer.manage'))
   OR (NOT manager AND NOT public.phase1_current_has_capability('volunteer.self')) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 IF p_action NOT IN('join','withdraw') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid signup action' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.programs WHERE id=p_program_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Program not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO existing FROM public.program_signups WHERE program_id=p.id AND volunteer_id=target FOR UPDATE;
 IF p_action='withdraw' THEN
  IF existing.id IS NULL OR existing.status='withdrawn' THEN RETURN jsonb_build_object('changed',false); END IF;
  UPDATE public.program_signups SET status='withdrawn' WHERE id=existing.id RETURNING * INTO saved;
 ELSE
  PERFORM public.phase8_assert_program_signup_eligible(p.id,target);
  IF existing.id IS NOT NULL AND existing.status<>'withdrawn' THEN
   RETURN jsonb_build_object('signup',to_jsonb(existing),'changed',false,'programTitle',p.title);
  END IF;
  IF existing.id IS NULL THEN
   INSERT INTO public.program_signups(program_id,volunteer_id,status,approval_status,added_by,confirmed_at,approved_by,approved_at)
   VALUES(p.id,target,CASE WHEN manager THEN 'confirmed' ELSE 'pending' END,'approved',
    CASE WHEN manager THEN auth.uid() END,CASE WHEN manager THEN now() END,
    CASE WHEN manager THEN auth.uid() END,CASE WHEN manager THEN now() END) RETURNING * INTO saved;
  ELSE
   UPDATE public.program_signups SET status=CASE WHEN manager THEN 'confirmed' ELSE 'pending' END,
    approval_status='approved',added_by=CASE WHEN manager THEN auth.uid() END,
    confirmed_at=CASE WHEN manager THEN now() END,approved_by=CASE WHEN manager THEN auth.uid() END,
    approved_at=CASE WHEN manager THEN now() END,approval_notes=NULL
   WHERE id=existing.id RETURNING * INTO saved;
  END IF;
 END IF;
 RETURN jsonb_build_object('signup',to_jsonb(saved),'changed',true,'programTitle',p.title);
END;
$function$;

-- Invitation registration may activate a pending account; it must never revive
-- a suspended/inactive existing identity or enroll into closed recruitment.
CREATE OR REPLACE FUNCTION public.phase4_consume_invitation_for_user(p_token_hash text,p_user_id uuid,p_email_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE i public.volunteer_invitation_links; p public.programs; cfg public.phase4_component_runtime; u public.users;
 v public.volunteers; r public.volunteer_program_requirements; existing public.program_signups;
 existing_waitlist public.volunteer_program_waitlist; enrolled integer; eligible boolean; w uuid; signup_id uuid;
BEGIN
 IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_email_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid invitation request' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM public.volunteer_invitation_links WHERE token_hash=p_token_hash FOR UPDATE;
 IF i.id IS NULL OR i.state<>'active' OR i.expires_at<=now() OR i.use_count>=i.max_uses THEN RAISE EXCEPTION 'invitation unavailable' USING ERRCODE='23514'; END IF;
 SELECT * INTO cfg FROM public.phase4_component_runtime WHERE component='program_invitations';
 SELECT * INTO p FROM public.programs WHERE id=i.program_id FOR UPDATE;
 SELECT * INTO u FROM public.users WHERE id=p_user_id FOR UPDATE;
 SELECT * INTO v FROM public.volunteers WHERE user_id=p_user_id;
 SELECT * INTO r FROM public.volunteer_program_requirements WHERE program_id=p.id;
 IF cfg.mode='off' OR p.phase2_data_mode<>cfg.mode OR cfg.mode='synthetic' AND
  (u.is_synthetic_test IS NOT TRUE OR NOT u.id=ANY(cfg.synthetic_user_ids) OR NOT p.id=ANY(cfg.synthetic_program_ids))
 THEN RAISE EXCEPTION 'invitation outside active mode' USING ERRCODE='42501'; END IF;
 IF u.id IS NULL OR u.status NOT IN('active','pending') OR (u.status='active' AND u.is_active IS NOT TRUE) THEN
  RAISE EXCEPTION 'invitation account is inactive' USING ERRCODE='42501';
 END IF;
 IF p.status NOT IN('planning','upcoming','active') OR (r.signup_deadline IS NOT NULL AND r.signup_deadline<=now()) THEN
  RAISE EXCEPTION 'program is not open for enrollment' USING ERRCODE='23514';
 END IF;
 IF u.role<>'volunteer' OR u.email IS NULL OR NOT i.allow_external_email AND split_part(lower(u.email),'@',2)<>i.allowed_email_domain
 THEN RAISE EXCEPTION 'volunteer email is ineligible' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.program_signups WHERE program_id=p.id AND volunteer_id=u.id FOR UPDATE;
 IF existing.id IS NOT NULL AND existing.status<>'withdrawn' THEN
  RETURN jsonb_build_object('state','joined','programId',p.id,'signupId',existing.id,'idempotent',true);
 END IF;
 eligible:=v.user_id IS NOT NULL AND (cardinality(coalesce(r.allowed_courses,'{}'))=0 OR v.course=ANY(r.allowed_courses))
  AND (r.minimum_year_level IS NULL OR v.year_level>=r.minimum_year_level)
  AND (r.maximum_year_level IS NULL OR v.year_level<=r.maximum_year_level);
 SELECT count(*) INTO enrolled FROM public.program_signups s WHERE s.program_id=p.id AND s.status<>'withdrawn';
 UPDATE public.users SET status='active',is_active=true,updated_at=now() WHERE id=u.id;
 IF eligible AND (p.max_volunteers IS NULL OR enrolled<p.max_volunteers) THEN
  INSERT INTO public.program_signups(program_id,volunteer_id,status,approval_status,added_by,confirmed_at,approved_by,approved_at)
  VALUES(p.id,u.id,'confirmed','approved',i.created_by,now(),i.created_by,now())
  ON CONFLICT(program_id,volunteer_id) DO UPDATE SET status='confirmed',approval_status='approved',added_by=i.created_by,
   confirmed_at=now(),approved_by=i.created_by,approved_at=now(),approval_notes=NULL,signed_up_at=now()
  RETURNING id INTO signup_id;
  UPDATE public.volunteer_invitation_links SET use_count=use_count+1,
   state=CASE WHEN use_count+1>=max_uses THEN 'exhausted' ELSE state END,row_version=row_version+1
   WHERE id=i.id RETURNING * INTO i;
  INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,volunteer_id,recipient_email_hash)
  VALUES(i.id,p.id,'joined',u.id,u.id,p_email_hash);
  IF i.state='exhausted' THEN
    INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,reason_code)
    VALUES(i.id,p.id,'exhausted',u.id,'maximum_uses_reached');
  END IF;
  RETURN jsonb_build_object('state','joined','programId',p.id,'signupId',signup_id,'idempotent',false);
 END IF;
 SELECT * INTO existing_waitlist FROM public.volunteer_program_waitlist
 WHERE program_id=p.id AND volunteer_id=u.id AND state='pending' FOR UPDATE;
 IF existing_waitlist.id IS NOT NULL THEN
   RETURN jsonb_build_object('state','waitlisted','programId',p.id,'waitlistId',existing_waitlist.id,'idempotent',true);
 END IF;
 INSERT INTO public.volunteer_program_waitlist(invitation_id,program_id,volunteer_id,reason)
 VALUES(i.id,p.id,u.id,CASE WHEN eligible THEN 'capacity_full' ELSE 'eligibility_review' END)
 RETURNING id INTO w;
 UPDATE public.volunteer_invitation_links SET use_count=use_count+1,
  state=CASE WHEN use_count+1>=max_uses THEN 'exhausted' ELSE state END,row_version=row_version+1
  WHERE id=i.id RETURNING * INTO i;
 INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,volunteer_id,recipient_email_hash,reason_code)
 VALUES(i.id,p.id,'waitlisted',u.id,u.id,p_email_hash,CASE WHEN eligible THEN 'capacity_full' ELSE 'eligibility_review' END);
 IF i.state='exhausted' THEN
   INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,reason_code)
   VALUES(i.id,p.id,'exhausted',u.id,'maximum_uses_reached');
 END IF;
 RETURN jsonb_build_object('state','waitlisted','programId',p.id,'waitlistId',w,'idempotent',false);
END;
$function$;

-- Keep the existing human-reviewed eligibility exception, but record it in
-- the same transaction BEFORE enrollment so invariant checks can verify it.
CREATE OR REPLACE FUNCTION public.phase4_review_waitlist(p_waitlist_id uuid,p_action text,p_expected_version bigint,p_remarks text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE w public.volunteer_program_waitlist; p public.programs;
BEGIN
 SELECT * INTO w FROM public.volunteer_program_waitlist WHERE id=p_waitlist_id FOR UPDATE;
 IF w.id IS NULL THEN RAISE EXCEPTION 'waitlist request not found' USING ERRCODE='P0002'; END IF;
 PERFORM public.phase4_assert_actor_runtime('program_invitations',w.program_id);
 IF NOT public.phase2_current_has_capability('volunteer.waitlist.review') THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF w.state<>'pending' OR p_expected_version IS NULL OR w.row_version<>p_expected_version
  OR p_action IS NULL OR p_action NOT IN('approve','decline') THEN
  RAISE EXCEPTION 'forbidden or stale waitlist decision' USING ERRCODE='40001';
 END IF;
 SELECT * INTO p FROM public.programs WHERE id=w.program_id FOR UPDATE;
 UPDATE public.volunteer_program_waitlist SET state=CASE WHEN p_action='approve' THEN 'approved' ELSE 'declined' END,
  reviewed_by=auth.uid(),reviewed_at=now(),review_remarks=left(nullif(btrim(p_remarks),''),500),row_version=row_version+1
 WHERE id=w.id RETURNING * INTO w;
 IF p_action='approve' THEN
  PERFORM public.phase8_assert_program_signup_eligible(p.id,w.volunteer_id);
  INSERT INTO public.program_signups(program_id,volunteer_id,status,approval_status,added_by,confirmed_at,approved_by,approved_at)
  VALUES(p.id,w.volunteer_id,'confirmed','approved',auth.uid(),now(),auth.uid(),now())
  ON CONFLICT(program_id,volunteer_id) DO UPDATE SET status='confirmed',approval_status='approved',
   added_by=auth.uid(),confirmed_at=now(),approved_by=auth.uid(),approved_at=now(),approval_notes=NULL;
 END IF;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'program.waitlist.'||p_action,'volunteer_program_waitlist',w.id::text,
  jsonb_build_object('programId',w.program_id,'rowVersion',w.row_version));
 INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,volunteer_id,reason_code)
 VALUES(w.invitation_id,w.program_id,CASE WHEN p_action='approve' THEN 'waitlist_approved' ELSE 'waitlist_declined' END,
  auth.uid(),w.volunteer_id,'manual_review');
 RETURN jsonb_build_object('id',w.id,'state',w.state,'rowVersion',w.row_version);
END;
$function$;

ALTER TABLE public.attendance ADD COLUMN recorded_by uuid REFERENCES public.users(id);
COMMENT ON COLUMN public.attendance.recorded_by IS 'Verified check-in or manual-entry actor; null only for pre-migration historical records.';

CREATE FUNCTION public.phase8_guard_attendance_invariants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE a public.program_activities; p public.programs; u public.users; signup public.program_signups;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.activity_id IS DISTINCT FROM OLD.activity_id
  OR NEW.volunteer_id IS DISTINCT FROM OLD.volunteer_id OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by) THEN
  RAISE EXCEPTION 'Attendance identity is immutable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO a FROM public.program_activities WHERE id=NEW.activity_id;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Activity not found' USING ERRCODE='P0002'; END IF;
 -- Lock parent before signup to serialize check-in with withdrawal.
 SELECT * INTO p FROM public.programs WHERE id=a.program_id FOR UPDATE;
 SELECT * INTO a FROM public.program_activities WHERE id=NEW.activity_id FOR SHARE;
 IF a.program_id IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'Activity parent changed' USING ERRCODE='40001'; END IF;
 IF a.status='cancelled' OR a.approval_status<>'approved' OR p.status IN('draft','cancelled') THEN
  RAISE EXCEPTION 'Activity is not available for attendance' USING ERRCODE='23514';
 END IF;
 SELECT * INTO u FROM public.users WHERE id=NEW.volunteer_id FOR SHARE;
 IF u.id IS NULL OR u.role<>'volunteer' OR u.status<>'active' OR u.is_active IS NOT TRUE THEN
  RAISE EXCEPTION 'Target user is not an active Volunteer' USING ERRCODE='23514';
 END IF;
 SELECT * INTO signup FROM public.program_signups WHERE program_id=p.id AND volunteer_id=u.id FOR SHARE;
 IF signup.id IS NULL OR signup.status='withdrawn' OR signup.approval_status<>'approved' THEN
  RAISE EXCEPTION 'An approved program assignment is required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  NEW.recorded_by:=coalesce(auth.uid(),NEW.recorded_by);
  IF NEW.recorded_by IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.recorded_by AND status='active' AND is_active
    AND role IN('paraya_director','paraya_associate','paraya_researcher','volunteer')) THEN
   RAISE EXCEPTION 'A verified attendance actor is required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER phase8_attendance_invariants BEFORE INSERT OR UPDATE ON public.attendance
 FOR EACH ROW EXECUTE FUNCTION public.phase8_guard_attendance_invariants();

CREATE FUNCTION public.phase8_record_manual_attendance(p_program_id uuid,p_activity_id uuid,p_volunteer_id uuid,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE saved uuid;
BEGIN
 IF NOT public.phase0_current_account_is_active() OR NOT public.phase1_current_has_capability('attendance.manage') THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.programs WHERE id=p_program_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.program_activities WHERE id=p_activity_id AND program_id=p_program_id) THEN
  RAISE EXCEPTION 'Activity not found' USING ERRCODE='P0002';
 END IF;
 IF length(coalesce(p_notes,''))>500 THEN RAISE EXCEPTION 'Attendance note is too long' USING ERRCODE='22023'; END IF;
 INSERT INTO public.attendance(activity_id,volunteer_id,method,notes,recorded_by)
 VALUES(p_activity_id,p_volunteer_id,'manual',nullif(btrim(p_notes),''),auth.uid()) RETURNING id INTO saved;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'program.attendance.manual','attendance',saved::text,
  jsonb_build_object('programId',p_program_id,'activityId',p_activity_id,'volunteerId',p_volunteer_id,'method','manual'));
 RETURN saved;
END;
$function$;

CREATE FUNCTION public.phase8_check_in_attendance(p_otp text,p_method text DEFAULT 'otp',p_ip_address text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE a public.program_activities; p public.programs; matches integer; saved uuid;
BEGIN
 IF NOT public.phase0_current_account_is_active_volunteer() OR NOT public.phase1_current_has_capability('attendance.self') THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 IF p_otp IS NULL OR upper(btrim(p_otp)) !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'
   OR p_method IS NULL OR p_method NOT IN('otp','qr') THEN
  RAISE EXCEPTION 'Invalid attendance request' USING ERRCODE='22023';
 END IF;
 SELECT count(*) INTO matches FROM public.program_activities
  WHERE upper(attendance_otp)=upper(btrim(p_otp)) AND attendance_otp_expires_at>now();
 IF matches>1 THEN RAISE EXCEPTION 'Attendance code must be rotated' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM public.program_activities WHERE upper(attendance_otp)=upper(btrim(p_otp))
  ORDER BY attendance_otp_expires_at DESC NULLS LAST,attendance_otp_issued_at DESC LIMIT 1;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Invalid attendance code' USING ERRCODE='P0002'; END IF;
 SELECT * INTO p FROM public.programs WHERE id=a.program_id FOR UPDATE;
 -- Re-read and lock after acquiring the parent: rotation or withdrawal cannot
 -- race a stale code into an accepted check-in.
 SELECT * INTO a FROM public.program_activities WHERE id=a.id FOR SHARE;
 IF upper(a.attendance_otp) IS DISTINCT FROM upper(btrim(p_otp)) THEN
  RAISE EXCEPTION 'Invalid attendance code' USING ERRCODE='P0002';
 END IF;
 IF a.attendance_otp_expires_at IS NULL OR a.attendance_otp_expires_at<=now() THEN
  RAISE EXCEPTION 'Attendance code expired' USING ERRCODE='P0003';
 END IF;
 INSERT INTO public.attendance(activity_id,volunteer_id,method,ip_address,recorded_by)
 VALUES(a.id,auth.uid(),p_method,left(p_ip_address,64),auth.uid()) RETURNING id INTO saved;
 RETURN jsonb_build_object('activity',jsonb_build_object('id',a.id,'title',a.title,'date',a.date),
  'program',jsonb_build_object('id',p.id,'title',p.title));
END;
$function$;

-- Direct insert previously allowed bypassing the OTP merely by choosing self.
-- Both manual and self attendance now cross authenticated, atomic RPCs.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.attendance FROM anon,authenticated;
CREATE POLICY phase8_attendance_insert_guard ON public.attendance AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false);
CREATE POLICY phase8_attendance_update_guard ON public.attendance AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY phase8_attendance_delete_guard ON public.attendance AS RESTRICTIVE FOR DELETE TO authenticated USING(false);

REVOKE ALL ON FUNCTION public.phase8_assert_program_signup_eligible(uuid,uuid),public.phase8_guard_program_signup_invariants(),
 public.phase8_audit_program_signup(),public.phase8_guard_program_capacity(),public.phase8_guard_attendance_invariants()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.phase8_set_program_signup(uuid,uuid,text),public.phase8_record_manual_attendance(uuid,uuid,uuid,text),
 public.phase8_check_in_attendance(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase8_set_program_signup(uuid,uuid,text),public.phase8_record_manual_attendance(uuid,uuid,uuid,text),
 public.phase8_check_in_attendance(text,text,text) TO authenticated;

COMMIT;
