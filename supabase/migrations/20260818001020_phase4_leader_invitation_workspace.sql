BEGIN;

CREATE OR REPLACE FUNCTION public.phase4_list_my_leader_programs()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  result jsonb;
BEGIN
  PERFORM public.phase4_assert_actor_runtime('program_invitations');
  IF NOT public.phase2_current_has_capability('volunteer.self') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'title',p.title,
    'status',p.status,
    'barangay',b.name,
    'signupDeadline',r.signup_deadline,
    'maxVolunteers',p.max_volunteers,
    'signupCount',counts.signup_count,
    'remainingCapacity',CASE WHEN p.max_volunteers IS NULL THEN NULL ELSE greatest(0,p.max_volunteers-counts.signup_count) END,
    'activeInvitationCount',counts.active_invitation_count
  ) ORDER BY p.start_date NULLS LAST,p.title,p.id),'[]'::jsonb)
  INTO result
  FROM public.volunteer_program_leaders leader
  JOIN public.programs p ON p.id=leader.program_id
  JOIN public.volunteer_program_requirements r ON r.program_id=p.id
  LEFT JOIN public.barangays b ON b.id=p.barangay_id
  JOIN public.phase4_component_runtime runtime ON runtime.component='program_invitations'
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*)::integer FROM public.program_signups signup
       WHERE signup.program_id=p.id AND signup.status<>'withdrawn') AS signup_count,
      (SELECT count(*)::integer FROM public.volunteer_invitation_links invitation
       WHERE invitation.program_id=p.id AND invitation.state='active' AND invitation.expires_at>now()) AS active_invitation_count
  ) counts
  WHERE leader.volunteer_id=auth.uid()
    AND leader.active
    AND p.status IN('planning','upcoming','active')
    AND p.phase2_data_mode=runtime.mode
    AND (runtime.mode<>'synthetic' OR p.id=ANY(runtime.synthetic_program_ids));

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase4_list_my_leader_programs() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase4_list_my_leader_programs() TO authenticated;

COMMIT;
