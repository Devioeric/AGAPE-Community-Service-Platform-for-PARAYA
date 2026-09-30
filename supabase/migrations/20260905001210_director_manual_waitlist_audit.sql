-- Manual waitlist requests legitimately have no invitation. Preserve their
-- decision events using the actual waitlist identity, never a fabricated link.
BEGIN;

ALTER TABLE public.volunteer_invitation_events
 ADD COLUMN waitlist_id uuid REFERENCES public.volunteer_program_waitlist(id) ON DELETE RESTRICT;
ALTER TABLE public.volunteer_invitation_events ALTER COLUMN invitation_id DROP NOT NULL;
ALTER TABLE public.volunteer_invitation_events ADD CONSTRAINT volunteer_event_source_required CHECK (
 invitation_id IS NOT NULL OR (
  waitlist_id IS NOT NULL AND event_type IN ('waitlist_approved','waitlist_declined')
  AND actor_id IS NOT NULL AND volunteer_id IS NOT NULL
 )
);
COMMENT ON COLUMN public.volunteer_invitation_events.waitlist_id IS
 'Actual reviewed waitlist request. Manual requests have no invitation; historical invitation-linked events remain unchanged.';

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
 INSERT INTO public.volunteer_invitation_events(invitation_id,waitlist_id,program_id,event_type,actor_id,volunteer_id,reason_code)
 VALUES(w.invitation_id,w.id,w.program_id,CASE WHEN p_action='approve' THEN 'waitlist_approved' ELSE 'waitlist_declined' END,
  auth.uid(),w.volunteer_id,'manual_review');
 RETURN jsonb_build_object('id',w.id,'state',w.state,'rowVersion',w.row_version);
END;
$function$;

-- CREATE OR REPLACE retains grants; repeat the public boundary explicitly.
REVOKE ALL ON FUNCTION public.phase4_review_waitlist(uuid,text,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase4_review_waitlist(uuid,text,bigint,text) TO authenticated;

COMMIT;
