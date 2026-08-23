-- Phase 1B controlled setup: sitios, assignments, notices, privacy, official totals.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_create_sitio(p_barangay_id uuid,p_name text,p_aliases text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid;
BEGIN
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',p_barangay_id,NULL);
  IF length(btrim(p_name))<1 OR length(btrim(p_name))>120 THEN RAISE EXCEPTION 'invalid sitio name' USING ERRCODE='22023'; END IF;
  INSERT INTO public.barangay_sitios(barangay_id,name,aliases,created_by) VALUES(p_barangay_id,btrim(p_name),coalesce(p_aliases,'{}'),auth.uid()) RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_assign_mother_leader(p_mother_leader_id uuid,p_sitio_id uuid,p_effective_from date,p_effective_to date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE sitio public.barangay_sitios%ROWTYPE; new_id uuid;
BEGIN
  SELECT * INTO sitio FROM public.barangay_sitios WHERE id=p_sitio_id;
  IF sitio.id IS NULL THEN RAISE EXCEPTION 'sitio not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',sitio.barangay_id,NULL);
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_mother_leader_id AND role='barangay_mother_leader' AND barangay_id=sitio.barangay_id AND status='active' AND is_active) THEN RAISE EXCEPTION 'active Mother Leader in the same barangay is required' USING ERRCODE='23514'; END IF;
  IF p_effective_to IS NOT NULL AND p_effective_to<p_effective_from THEN RAISE EXCEPTION 'invalid assignment dates' USING ERRCODE='22023'; END IF;
  INSERT INTO public.mother_leader_sitio_assignments(mother_leader_id,sitio_id,effective_from,effective_to,assigned_by)
  VALUES(p_mother_leader_id,p_sitio_id,p_effective_from,p_effective_to,auth.uid()) RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_privacy_notice(
  p_version text,p_notice_text text,p_controller_name text,p_privacy_contact text,p_retention_summary text,p_effective_from date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid;
BEGIN
  IF NOT public.phase1_current_has_capability('profiling.privacy.configure') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF length(btrim(p_notice_text))<20 THEN RAISE EXCEPTION 'privacy notice is too short' USING ERRCODE='22023'; END IF;
  INSERT INTO public.profiling_privacy_notices(version,notice_text,controller_name,privacy_contact,retention_summary,effective_from,approved_by)
  VALUES(btrim(p_version),btrim(p_notice_text),btrim(p_controller_name),btrim(p_privacy_contact),btrim(p_retention_summary),p_effective_from,auth.uid()) RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_set_suppression_threshold(p_threshold integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF NOT public.phase1_current_has_capability('profiling.privacy.configure') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_threshold<5 OR p_threshold>100 THEN RAISE EXCEPTION 'suppression threshold must be between 5 and 100' USING ERRCODE='22023'; END IF;
  UPDATE public.profiling_privacy_settings SET suppression_threshold=p_threshold,updated_by=auth.uid(),updated_at=now() WHERE id=true;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  SELECT u.id,u.email,'Profiling privacy threshold updated','profiling_privacy_settings','global','warning',jsonb_build_object('threshold',p_threshold) FROM public.users u WHERE u.id=auth.uid();
  RETURN p_threshold;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_official_population_snapshot(
  p_barangay_id uuid,p_as_of_date date,p_source_name text,p_total_population integer,p_total_households integer,p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE new_id uuid;
BEGIN
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',p_barangay_id,NULL);
  IF p_total_population<0 OR p_total_households<0 OR length(btrim(p_source_name))<2 THEN RAISE EXCEPTION 'invalid official population snapshot' USING ERRCODE='22023'; END IF;
  INSERT INTO public.official_population_snapshots(barangay_id,as_of_date,source_name,total_population,total_households,notes,created_by)
  VALUES(p_barangay_id,p_as_of_date,btrim(p_source_name),p_total_population,p_total_households,nullif(btrim(p_notes),''),auth.uid()) RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_official_population_snapshots(p_barangay_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb;
BEGIN
  PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read',p_barangay_id,NULL);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'as_of_date',as_of_date,'source_name',source_name,'total_population',total_population,'total_households',total_households,'verified_at',verified_at) ORDER BY as_of_date DESC),'[]'::jsonb)
  INTO result FROM public.official_population_snapshots WHERE barangay_id=p_barangay_id;
  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phase1_create_sitio(uuid,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_assign_mother_leader(uuid,uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_privacy_notice(text,text,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_set_suppression_threshold(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_official_population_snapshot(uuid,date,text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_official_population_snapshots(uuid) TO authenticated;

COMMIT;
