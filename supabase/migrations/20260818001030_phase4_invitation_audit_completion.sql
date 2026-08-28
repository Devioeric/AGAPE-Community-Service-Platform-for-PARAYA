BEGIN;

CREATE OR REPLACE FUNCTION public.phase4_consume_invitation_for_new_user(
  p_token_hash text,
  p_user_id uuid,
  p_email_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  invitation public.volunteer_invitation_links;
  result jsonb;
BEGIN
  SELECT * INTO invitation
  FROM public.volunteer_invitation_links
  WHERE token_hash=p_token_hash;

  IF invitation.id IS NULL THEN
    RAISE EXCEPTION 'invitation unavailable' USING ERRCODE='23514';
  END IF;

  result:=public.phase4_consume_invitation_for_user(p_token_hash,p_user_id,p_email_hash);

  INSERT INTO public.volunteer_invitation_events(
    invitation_id,program_id,event_type,actor_id,volunteer_id,recipient_email_hash,reason_code
  ) VALUES(
    invitation.id,invitation.program_id,'registered',p_user_id,p_user_id,p_email_hash,'invited_account_created'
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_record_invitation_failure(
  p_token_hash text,
  p_user_id uuid,
  p_email_hash text,
  p_reason_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  invitation public.volunteer_invitation_links;
  program_row public.programs;
  runtime public.phase4_component_runtime;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_email_hash !~ '^[0-9a-f]{64}$'
    OR p_reason_code NOT IN(
      'invitation_unavailable','email_ineligible','runtime_denied',
      'stale_conflict','invalid_request','registration_profile_failed','join_failed'
    ) THEN
    RETURN false;
  END IF;

  SELECT * INTO invitation
  FROM public.volunteer_invitation_links
  WHERE token_hash=p_token_hash;
  IF invitation.id IS NULL THEN RETURN false; END IF;

  SELECT * INTO program_row FROM public.programs WHERE id=invitation.program_id;
  SELECT * INTO runtime FROM public.phase4_component_runtime WHERE component='program_invitations';
  IF runtime.mode IS NULL OR runtime.mode='off' OR program_row.phase2_data_mode<>runtime.mode THEN
    RETURN false;
  END IF;
  IF runtime.mode='synthetic' AND (
    NOT program_row.id=ANY(runtime.synthetic_program_ids)
    OR p_user_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.users actor
      WHERE actor.id=p_user_id AND actor.is_synthetic_test AND actor.id=ANY(runtime.synthetic_user_ids)
    )
  ) THEN
    RETURN false;
  END IF;
  IF p_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users actor WHERE actor.id=p_user_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.volunteer_invitation_events(
    invitation_id,program_id,event_type,actor_id,volunteer_id,recipient_email_hash,reason_code
  ) VALUES(
    invitation.id,invitation.program_id,'failed',p_user_id,p_user_id,p_email_hash,p_reason_code
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase4_consume_invitation_for_new_user(text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase4_record_invitation_failure(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_consume_invitation_for_new_user(text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase4_record_invitation_failure(text,uuid,text,text) TO service_role;

COMMIT;
