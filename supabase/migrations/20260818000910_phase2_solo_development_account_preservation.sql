-- Phase 2 solo-development account preservation.
-- Real/staging legacy identities remain historical-read-only and are never
-- suspended by the automated finalizer during development gate execution.

BEGIN;

CREATE OR REPLACE FUNCTION public.phase2_finalize_legacy_auth_suspension(
  p_actor_id uuid,
  p_legacy_user_id uuid,
  p_request_id uuid,
  p_succeeded boolean,
  p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  item public.legacy_account_partner_mappings;
  partner_mode text;
  runtime_mode text;
  actor public.users;
  legacy_user public.users;
  allowed_users uuid[];
  allowed_entities uuid[];
  actor_email text;
  new_version integer;
BEGIN
  SELECT * INTO item
  FROM public.legacy_account_partner_mappings
  WHERE legacy_user_id=p_legacy_user_id
  FOR UPDATE;

  IF item.legacy_user_id IS NULL
     OR item.auth_suspension_request_id IS DISTINCT FROM p_request_id
     OR item.reconciliation_status<>'signed_off'
     OR item.auth_suspension_status NOT IN('requested','failed') THEN
    RAISE EXCEPTION 'stale suspension request' USING ERRCODE='40001';
  END IF;

  SELECT data_mode INTO partner_mode FROM public.partner_entities WHERE id=item.partner_id;
  SELECT mode,synthetic_user_ids,synthetic_entity_ids
    INTO runtime_mode,allowed_users,allowed_entities
  FROM public.phase2_component_runtime
  WHERE component='partners';
  SELECT * INTO actor FROM public.users WHERE id=p_actor_id;
  SELECT * INTO legacy_user FROM public.users WHERE id=p_legacy_user_id;

  IF runtime_mode IS NULL
     OR runtime_mode<>'synthetic'
     OR partner_mode<>'synthetic'
     OR actor.id IS NULL
     OR actor.status<>'active'
     OR actor.is_active IS NOT TRUE
     OR actor.is_synthetic_test IS NOT TRUE
     OR legacy_user.id IS NULL
     OR legacy_user.is_synthetic_test IS NOT TRUE
     OR NOT public.phase2_role_has_capability(actor.role,'partner.legacy_mapping.manage')
     OR coalesce((actor.permissions->>public.phase2_permission_module('partner.legacy_mapping.manage'))::boolean,true) IS FALSE
     OR NOT actor.id=ANY(allowed_users)
     OR NOT p_legacy_user_id=ANY(allowed_users)
     OR NOT item.partner_id=ANY(allowed_entities) THEN
    RAISE EXCEPTION 'only allowlisted disposable synthetic accounts may be suspended' USING ERRCODE='42501';
  END IF;

  IF NOT p_succeeded AND coalesce(p_error_code,'') !~ '^[a-z0-9_]{3,80}$' THEN
    RAISE EXCEPTION 'bounded error code required' USING ERRCODE='22023';
  END IF;

  IF p_succeeded THEN
    UPDATE public.users
    SET status='suspended',is_active=false,updated_at=now()
    WHERE id=p_legacy_user_id AND is_synthetic_test IS TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'synthetic legacy account was not updated' USING ERRCODE='40001';
    END IF;
    UPDATE public.legacy_account_partner_mappings
    SET reconciliation_status='suspended',auth_suspension_status='completed',
        auth_suspension_completed_at=now(),auth_suspension_error_code=NULL,
        row_version=row_version+1,updated_at=now()
    WHERE legacy_user_id=p_legacy_user_id
    RETURNING row_version INTO new_version;
  ELSE
    UPDATE public.legacy_account_partner_mappings
    SET auth_suspension_status='failed',auth_suspension_error_code=p_error_code,
        row_version=row_version+1,updated_at=now()
    WHERE legacy_user_id=p_legacy_user_id
    RETURNING row_version INTO new_version;
  END IF;

  INSERT INTO public.partnership_events(partner_id,event_type,actor_id,snapshot)
  VALUES(item.partner_id,
    CASE WHEN p_succeeded THEN 'legacy_auth_suspension_completed' ELSE 'legacy_auth_suspension_failed' END,
    p_actor_id,
    jsonb_build_object('legacy_user_id',p_legacy_user_id,'request_id',p_request_id,
      'error_code',CASE WHEN p_succeeded THEN NULL ELSE p_error_code END,
      'data_mode','synthetic'));
  SELECT email INTO actor_email FROM public.users WHERE id=p_actor_id;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  VALUES(p_actor_id,actor_email,'partner.mapping.auth_suspension','legacy_account_partner_mapping',
    p_legacy_user_id::text,'warning',
    jsonb_build_object('request_id',p_request_id,'succeeded',p_succeeded,
      'error_code',CASE WHEN p_succeeded THEN NULL ELSE p_error_code END,
      'data_mode','synthetic'));

  RETURN jsonb_build_object(
    'status',CASE WHEN p_succeeded THEN 'suspended' ELSE 'signed_off' END,
    'authSuspensionStatus',CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END,
    'rowVersion',new_version
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase2_finalize_legacy_auth_suspension(uuid,uuid,uuid,boolean,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_finalize_legacy_auth_suspension(uuid,uuid,uuid,boolean,text)
  TO service_role;

UPDATE public.phase2_component_runtime SET mode='off',updated_at=now();
UPDATE public.phase2_cutover_state
SET write_authority='v1',reconciliation_hash=NULL,reconciled_at=NULL,changed_at=now();

COMMIT;
