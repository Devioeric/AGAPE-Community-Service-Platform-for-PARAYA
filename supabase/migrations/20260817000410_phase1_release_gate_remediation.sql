-- Phase 1 release-gate remediation.
-- Forward-only: keep profiling runtime OFF until clone/JWT/E2E verification.
BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_synthetic_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.barangays ADD COLUMN IF NOT EXISTS is_synthetic_test boolean NOT NULL DEFAULT false;

-- One deny-only module boundary for direct PostgREST access. Existing
-- permissive policies still decide who may use a table; this restrictive
-- policy can only subtract access.
CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
  SELECT CASE
    WHEN p_table='users' THEN 'user_management'
    WHEN p_table='audit_logs' THEN 'audit_logs'
    WHEN p_table IN('barangays','partnership_history') THEN 'partnerships'
    WHEN p_table LIKE 'proposal%' OR p_table='project_proposals' THEN 'proposals'
    WHEN p_table LIKE 'program%' OR p_table='activity_photos' THEN 'programs'
    WHEN p_table LIKE 'volunteer%' THEN 'volunteers'
    WHEN p_table LIKE 'survey%' THEN 'surveys'
    WHEN p_table='community_needs' THEN 'community_needs'
    WHEN p_table='field_observations' THEN 'observations'
    WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets') THEN 'skills_assets'
    WHEN p_table='attendance' THEN 'attendance'
    WHEN p_table='activity_logs' THEN 'activity_logs'
    WHEN p_table LIKE 'donation%' THEN 'donations'
    WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' THEN 'impact'
    WHEN p_table LIKE 'analytics%' THEN 'analytics'
    WHEN p_table LIKE 'ai_report%' THEN 'reports'
    WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments') THEN 'communication'
    WHEN p_table='domain_correction_events' THEN 'audit_logs'
    WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles') THEN 'profiling'
    ELSE NULL END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_current_permission_module_allowed(p_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.users u
    WHERE u.id=auth.uid() AND u.status='active' AND u.is_active IS TRUE
      AND coalesce((u.permissions->>p_module)::boolean,true) IS NOT FALSE
  );
$function$;

DO $install_deny_overrides$
DECLARE item record; module_name text;
BEGIN
  FOR item IN
    SELECT c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relrowsecurity
  LOOP
    module_name:=public.phase1_permission_module_for_table(item.relname);
    IF module_name IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS phase1_deny_override_guard ON public.%I',item.relname);
      EXECUTE format(
        'CREATE POLICY phase1_deny_override_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.phase1_current_permission_module_allowed(%L)) WITH CHECK (public.phase1_current_permission_module_allowed(%L))',
        item.relname,module_name,module_name
      );
    END IF;
  END LOOP;
END;
$install_deny_overrides$;

-- Abort instead of silently leaving a domain table outside the deny-only
-- boundary. Extension-owned and Supabase migration-ledger tables are excluded.
DO $verify_domain_rls$
DECLARE item record; module_name text;
BEGIN
  FOR item IN
    SELECT c.relname,c.relrowsecurity FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN('r','p')
      AND c.relname NOT IN('spatial_ref_sys','schema_migrations')
      AND c.relname NOT LIKE 'pg_%'
  LOOP
    module_name:=public.phase1_permission_module_for_table(item.relname);
    IF module_name IS NULL THEN
      RAISE EXCEPTION 'public domain table % has no permission-module mapping',item.relname;
    END IF;
    IF NOT item.relrowsecurity THEN
      RAISE EXCEPTION 'public domain table % does not have RLS enabled',item.relname;
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_policy p
      JOIN pg_catalog.pg_class pc ON pc.oid=p.polrelid
      JOIN pg_catalog.pg_namespace pn ON pn.oid=pc.relnamespace
      WHERE pn.nspname='public' AND pc.relname=item.relname
        AND p.polname='phase1_deny_override_guard'
    ) THEN
      RAISE EXCEPTION 'public domain table % lacks the deny-only policy',item.relname;
    END IF;
  END LOOP;
END;
$verify_domain_rls$;

-- Strict SQL validation is the security boundary for directly callable RPCs.
CREATE OR REPLACE FUNCTION public.phase1_assert_resident_payload(p_resident jsonb,p_as_of date)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $function$
DECLARE
  age_years integer; stated_age integer; pregnancy boolean; from_date date; to_date date; key text;
BEGIN
  IF NOT public.phase1_json_object_has_only(p_resident,ARRAY['resident_id','household_row_key','first_name','middle_name','last_name','suffix','birth_date','estimated_age','sex','civil_status','relationship_to_head','education_level','is_enrolled','school_category','employment_status','occupation_category','income_bracket','skills','disability_support','health_support','pregnancy_status','pregnancy_effective_from','pregnancy_effective_to','is_solo_parent','is_4ps_member','planning_needs','consent_status','guardian_name','guardian_relationship']) THEN
    RAISE EXCEPTION 'resident payload contains unknown fields' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(p_resident->>'household_row_key',''))) NOT BETWEEN 1 AND 80
    OR length(btrim(coalesce(p_resident->>'first_name',''))) NOT BETWEEN 1 AND 80
    OR length(btrim(coalesce(p_resident->>'last_name',''))) NOT BETWEEN 1 AND 80
    OR length(coalesce(p_resident->>'middle_name',''))>80 OR length(coalesce(p_resident->>'suffix',''))>20
    OR length(coalesce(p_resident->>'guardian_name',''))>160 OR length(coalesce(p_resident->>'guardian_relationship',''))>60 THEN
    RAISE EXCEPTION 'resident text length is invalid' USING ERRCODE='22023';
  END IF;
  IF p_resident->>'sex' NOT IN('female','male','intersex','not_stated')
    OR p_resident->>'civil_status' NOT IN('single','married','cohabiting','separated','widowed','not_stated')
    OR coalesce(p_resident->>'relationship_to_head','other') NOT IN('household_head','spouse_partner','child','parent','sibling','relative','non_relative','other')
    OR coalesce(p_resident->>'education_level','not_stated') NOT IN('none','early_childhood','elementary','junior_high','senior_high','technical_vocational','college','postgraduate','not_stated')
    OR coalesce(p_resident->>'school_category','not_stated') NOT IN('public','private','alternative_learning','not_stated')
    OR coalesce(p_resident->>'employment_status','not_stated') NOT IN('employed','self_employed','unemployed_seeking','not_seeking','student','retired','not_stated')
    OR coalesce(p_resident->>'occupation_category','not_stated') NOT IN('not_stated','agriculture','fishing','construction','manufacturing','transport','retail','food_service','education','health_care','public_service','domestic_work','technology','professional','informal_labor','unemployed','student','retired','other')
    OR coalesce(p_resident->>'income_bracket','not_stated') NOT IN('none','below_5000','5000_9999','10000_19999','20000_plus','not_stated') THEN
    RAISE EXCEPTION 'resident category is invalid' USING ERRCODE='22023';
  END IF;
  FOREACH key IN ARRAY ARRAY['is_enrolled','pregnancy_status','is_solo_parent','is_4ps_member'] LOOP
    IF p_resident ? key AND p_resident->key <> 'null'::jsonb AND jsonb_typeof(p_resident->key)<>'boolean' THEN
      RAISE EXCEPTION 'resident boolean field % is invalid',key USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF p_resident->>'consent_status'<>'granted' THEN RAISE EXCEPTION 'identifiable resident requires granted consent' USING ERRCODE='23514'; END IF;
  age_years:=public.phase1_age_on(nullif(p_resident->>'birth_date','')::date,nullif(p_resident->>'estimated_age','')::integer,p_as_of);
  stated_age:=nullif(p_resident->>'estimated_age','')::integer;
  IF nullif(p_resident->>'birth_date','') IS NOT NULL AND stated_age IS NOT NULL AND abs(age_years-stated_age)>1 THEN
    RAISE EXCEPTION 'birth date and estimated age contradict each other' USING ERRCODE='22023';
  END IF;
  IF age_years<18 AND (length(btrim(coalesce(p_resident->>'guardian_name','')))<1 OR length(btrim(coalesce(p_resident->>'guardian_relationship','')))<1) THEN
    RAISE EXCEPTION 'derived minor requires guardian authorization' USING ERRCODE='23514';
  END IF;
  IF age_years>=18 AND (nullif(p_resident->>'guardian_name','') IS NOT NULL OR nullif(p_resident->>'guardian_relationship','') IS NOT NULL) THEN
    RAISE EXCEPTION 'adult consent cannot be represented as guardian authorization' USING ERRCODE='23514';
  END IF;
  IF NOT public.phase1_json_string_array_is_controlled(p_resident->'skills',ARRAY['agriculture','food_preparation','sewing','handicraft','carpentry','electrical','plumbing','caregiving','teaching','digital_literacy','computer_technical','entrepreneurship','driving','community_organizing','disaster_response','first_aid','other'],17)
    OR NOT public.phase1_json_string_array_is_controlled(p_resident->'disability_support',ARRAY['mobility','vision','hearing','communication','cognitive','psychosocial','self_care','other'],8)
    OR NOT public.phase1_json_string_array_is_controlled(p_resident->'health_support',ARRAY['maternal','child_nutrition','maintenance_medicine','mobility_support','mental_wellbeing','other'],6)
    OR NOT public.phase1_json_string_array_is_controlled(p_resident->'planning_needs',ARRAY['health','education','livelihood','accessibility','digital_access','other'],6) THEN
    RAISE EXCEPTION 'resident planning category is invalid' USING ERRCODE='22023';
  END IF;
  pregnancy:=coalesce((p_resident->>'pregnancy_status')::boolean,false);
  from_date:=nullif(p_resident->>'pregnancy_effective_from','')::date; to_date:=nullif(p_resident->>'pregnancy_effective_to','')::date;
  IF pregnancy AND (from_date IS NULL OR from_date>p_as_of OR (to_date IS NOT NULL AND (to_date<from_date OR to_date<p_as_of))) THEN
    RAISE EXCEPTION 'pregnancy effective dates are invalid' USING ERRCODE='22023';
  END IF;
  IF NOT pregnancy AND (from_date IS NOT NULL OR to_date IS NOT NULL) THEN RAISE EXCEPTION 'pregnancy dates require active pregnancy status' USING ERRCODE='22023'; END IF;
  RETURN age_years<18;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_assert_profiling_payload(p_payload jsonb,p_cycle_id uuid,p_sitio_id uuid,p_as_of date)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $function$
DECLARE household jsonb; resident jsonb; anonymous_count integer; key text;
BEGIN
  IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['cycle_id','household_row_key','participation_consent','household_consent_name','privacy_notice_version','sample_reference','household','residents','expected_version']) THEN RAISE EXCEPTION 'profiling package contains unknown fields' USING ERRCODE='22023'; END IF;
  IF p_payload->>'cycle_id' IS DISTINCT FROM p_cycle_id::text OR p_payload->>'participation_consent'<>'granted'
    OR coalesce(p_payload->>'sample_reference','')!~'^SMP-[A-Z0-9]{8,32}$'
    OR length(btrim(coalesce(p_payload->>'household_row_key',''))) NOT BETWEEN 1 AND 80
    OR length(btrim(coalesce(p_payload->>'household_consent_name',''))) NOT BETWEEN 1 AND 160
    OR length(btrim(coalesce(p_payload->>'privacy_notice_version',''))) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'cycle, sample, notice, or participation consent is invalid' USING ERRCODE='22023'; END IF;
  household:=p_payload->'household';
  IF NOT public.phase1_json_object_has_only(household,ARRAY['sitio_id','landmark','contact_number','income_bracket','housing_condition','electricity','water_source','sanitation','internet_access','devices','hazards','needs','anonymous_nonparticipant_count'])
    OR household->>'sitio_id' IS DISTINCT FROM p_sitio_id::text OR length(coalesce(household->>'landmark',''))>160
    OR (nullif(household->>'contact_number','') IS NOT NULL AND household->>'contact_number'!~'^\+?[0-9 -]{7,20}$') THEN RAISE EXCEPTION 'household payload is invalid' USING ERRCODE='22023'; END IF;
  IF coalesce(household->>'income_bracket','not_stated') NOT IN('below_5000','5000_9999','10000_19999','20000_39999','40000_59999','60000_plus','not_stated')
    OR coalesce(household->>'housing_condition','not_stated') NOT IN('adequate','needs_minor_repair','needs_major_repair','temporary','not_stated')
    OR coalesce(household->>'electricity','not_stated') NOT IN('connected','shared','none','not_stated')
    OR coalesce(household->>'water_source','not_stated') NOT IN('piped','well','delivered','communal','other','not_stated')
    OR coalesce(household->>'sanitation','not_stated') NOT IN('private_flush','shared_flush','latrine','none','not_stated')
    OR coalesce(household->>'internet_access','not_stated') NOT IN('fixed','mobile','shared','none','not_stated') THEN RAISE EXCEPTION 'household category is invalid' USING ERRCODE='22023'; END IF;
  IF NOT public.phase1_json_string_array_is_controlled(household->'devices',ARRAY['smartphone','basic_phone','tablet','laptop','desktop','television','radio'],7)
    OR NOT public.phase1_json_string_array_is_controlled(household->'hazards',ARRAY['flood','fire','landslide','extreme_heat','unsafe_structure','other'],6)
    OR NOT public.phase1_json_string_array_is_controlled(household->'needs',ARRAY['health','education','livelihood','housing','sanitation','disaster_readiness','digital_access','other'],8) THEN RAISE EXCEPTION 'household planning category is invalid' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(household->'anonymous_nonparticipant_count')<>'number' OR coalesce(household->>'anonymous_nonparticipant_count','')!~'^[0-9]+$' THEN RAISE EXCEPTION 'anonymous count must be an integer' USING ERRCODE='22023'; END IF;
  anonymous_count:=(household->>'anonymous_nonparticipant_count')::integer;
  IF anonymous_count NOT BETWEEN 0 AND 100 OR jsonb_typeof(p_payload->'residents')<>'array' OR jsonb_array_length(p_payload->'residents')>100 THEN RAISE EXCEPTION 'roster size is invalid' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_payload->'residents')=0 AND anonymous_count=0 THEN RAISE EXCEPTION 'a package requires a resident or anonymous non-participation count' USING ERRCODE='23514'; END IF;
  FOR resident IN SELECT value FROM jsonb_array_elements(p_payload->'residents') LOOP PERFORM public.phase1_assert_resident_payload(resident,p_as_of); END LOOP;
  IF jsonb_typeof(p_payload->'expected_version')<>'number' OR (p_payload->>'expected_version')!~'^[0-9]+$' THEN RAISE EXCEPTION 'expected version is invalid' USING ERRCODE='22023'; END IF;
END;
$function$;

-- Stable identity/version constraints fail closed if legacy rows conflict.
DO $identity_preflight$
BEGIN
  IF EXISTS(SELECT 1 FROM public.profiling_resident_versions GROUP BY resident_id,version HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate resident version sequence must be reconciled'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiling_sample_units WHERE household_id IS NOT NULL GROUP BY cycle_id,household_id HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate cycle household sample links must be reconciled'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiling_sample_units WHERE replacement_of_id IS NOT NULL GROUP BY replacement_of_id HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate sample replacements must be reconciled'; END IF;
END;
$identity_preflight$;
CREATE UNIQUE INDEX IF NOT EXISTS profiling_resident_version_sequence_key ON public.profiling_resident_versions(resident_id,version);
CREATE UNIQUE INDEX IF NOT EXISTS profiling_sample_cycle_household_key ON public.profiling_sample_units(cycle_id,household_id) WHERE household_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiling_sample_single_replacement_key ON public.profiling_sample_units(replacement_of_id) WHERE replacement_of_id IS NOT NULL;

-- Serialize version allocation on the stable resident identity. Callers may
-- suggest a version, but the database is authoritative under concurrency.
CREATE OR REPLACE FUNCTION public.phase1_allocate_resident_version()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
  PERFORM 1 FROM public.profiling_residents WHERE id=NEW.resident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'resident identity not found' USING ERRCODE='23503'; END IF;
  SELECT coalesce(max(v.version),0)+1 INTO NEW.version
  FROM public.profiling_resident_versions v WHERE v.resident_id=NEW.resident_id;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS profiling_resident_version_allocator ON public.profiling_resident_versions;
CREATE TRIGGER profiling_resident_version_allocator BEFORE INSERT ON public.profiling_resident_versions
FOR EACH ROW EXECUTE FUNCTION public.phase1_allocate_resident_version();

ALTER TABLE public.profiling_household_memberships
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by uuid REFERENCES public.users(id);
UPDATE public.profiling_household_memberships m SET activated_at=coalesce(m.created_at,now()),activated_by=m.created_by
WHERE activated_at IS NULL AND EXISTS(
  SELECT 1 FROM public.profiling_resident_versions rv
  JOIN public.profiling_submissions s ON s.id=rv.submission_id
  WHERE rv.resident_id=m.resident_id AND s.household_id=m.household_id AND s.status IN('approved','superseded')
);
CREATE OR REPLACE FUNCTION public.phase1_activate_approved_memberships()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.profiling_household_memberships m SET activated_at=coalesce(m.activated_at,now()),activated_by=coalesce(m.activated_by,NEW.approved_by)
    WHERE m.household_id=NEW.household_id AND m.activated_at IS NULL
      AND EXISTS(SELECT 1 FROM public.profiling_resident_versions rv WHERE rv.submission_id=NEW.id AND rv.resident_id=m.resident_id);
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS profiling_submission_membership_activation ON public.profiling_submissions;
CREATE TRIGGER profiling_submission_membership_activation AFTER UPDATE OF status ON public.profiling_submissions
FOR EACH ROW EXECUTE FUNCTION public.phase1_activate_approved_memberships();

-- Preserve the already-shipped implementations behind trusted wrappers.
DO $rename_phase1_internals$
BEGIN
  IF to_regprocedure('public.phase1_create_profiling_submission_internal(uuid,uuid,jsonb,text,uuid)') IS NULL THEN
    ALTER FUNCTION public.phase1_create_profiling_submission(uuid,uuid,jsonb,text,uuid) RENAME TO phase1_create_profiling_submission_internal;
  END IF;
  IF to_regprocedure('public.phase1_profiling_aggregate_internal(uuid)') IS NULL THEN
    ALTER FUNCTION public.phase1_profiling_aggregate(uuid) RENAME TO phase1_profiling_aggregate_internal;
  END IF;
  IF to_regprocedure('public.phase1_transition_profiling_cycle_internal(uuid,integer,text,text)') IS NULL THEN
    ALTER FUNCTION public.phase1_transition_profiling_cycle(uuid,integer,text,text) RENAME TO phase1_transition_profiling_cycle_internal;
  END IF;
  IF to_regprocedure('public.phase1_record_sample_outcome_internal(uuid,uuid,text,text,integer)') IS NULL THEN
    ALTER FUNCTION public.phase1_record_sample_outcome(uuid,uuid,text,text,integer) RENAME TO phase1_record_sample_outcome_internal;
  END IF;
  IF to_regprocedure('public.phase1_apply_profile_lifecycle_action_internal(text,uuid,integer,date,text,uuid)') IS NULL THEN
    ALTER FUNCTION public.phase1_apply_profile_lifecycle_action(text,uuid,integer,date,text,uuid) RENAME TO phase1_apply_profile_lifecycle_action_internal;
  END IF;
  IF to_regprocedure('public.phase1_begin_profiling_revision_internal(uuid,text)') IS NULL THEN
    ALTER FUNCTION public.phase1_begin_profiling_revision(uuid,text) RENAME TO phase1_begin_profiling_revision_internal;
  END IF;
  IF to_regprocedure('public.phase1_resolve_profiling_duplicate_v2_internal(uuid,text,text,uuid)') IS NULL THEN
    ALTER FUNCTION public.phase1_resolve_profiling_duplicate_v2(uuid,text,text,uuid) RENAME TO phase1_resolve_profiling_duplicate_v2_internal;
  END IF;
  IF to_regprocedure('public.phase1_set_profiling_runtime_internal(text,uuid[],uuid[],boolean)') IS NULL THEN
    ALTER FUNCTION public.phase1_set_profiling_runtime(text,uuid[],uuid[],boolean) RENAME TO phase1_set_profiling_runtime_internal;
  END IF;
  IF to_regprocedure('public.phase1_register_sample_units_internal(uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.phase1_register_sample_units(uuid,jsonb) RENAME TO phase1_register_sample_units_internal;
  END IF;
  IF to_regprocedure('public.phase1_create_sample_replacement_internal(uuid,text,text)') IS NULL THEN
    ALTER FUNCTION public.phase1_create_sample_replacement(uuid,text,text) RENAME TO phase1_create_sample_replacement_internal;
  END IF;
END;
$rename_phase1_internals$;
ALTER FUNCTION public.phase1_transition_profiling_cycle_internal(uuid,integer,text,text) SET search_path=pg_catalog,public,extensions;

CREATE OR REPLACE FUNCTION public.phase1_set_profiling_runtime(p_mode text,p_synthetic_user_ids uuid[] DEFAULT '{}',p_synthetic_barangay_ids uuid[] DEFAULT '{}',p_privacy_approved boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF p_mode='synthetic' THEN
    IF EXISTS(SELECT 1 FROM unnest(p_synthetic_user_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=id AND u.is_synthetic_test))
      OR EXISTS(SELECT 1 FROM unnest(p_synthetic_barangay_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=id AND b.is_synthetic_test)) THEN
      RAISE EXCEPTION 'synthetic mode accepts only explicitly marked test users and demo barangays' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN public.phase1_set_profiling_runtime_internal(p_mode,p_synthetic_user_ids,p_synthetic_barangay_ids,p_privacy_approved);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_get_profiling_runtime()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE setting public.profiling_runtime_settings%ROWTYPE;
BEGIN
  IF NOT (public.phase1_current_has_capability('profiling.cycle.manage') OR public.phase1_current_has_capability('profiling.privacy.configure')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO setting FROM public.profiling_runtime_settings WHERE id=true;
  RETURN jsonb_build_object('mode',setting.mode,'syntheticUserCount',cardinality(setting.synthetic_user_ids),'syntheticBarangayCount',cardinality(setting.synthetic_barangay_ids),'privacyApprovedAt',setting.privacy_approved_at,'updatedAt',setting.updated_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_register_sample_units(p_cycle_id uuid,p_units jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item jsonb;
BEGIN
  IF jsonb_typeof(p_units)<>'array' THEN RAISE EXCEPTION 'sample register must be an array' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_units) LOOP
    IF coalesce(item->>'sample_reference','')!~'^SMP-[A-Z0-9]{8,32}$' THEN RAISE EXCEPTION 'sample references must be opaque SMP codes' USING ERRCODE='22023'; END IF;
  END LOOP;
  RETURN public.phase1_register_sample_units_internal(p_cycle_id,p_units);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_sample_replacement(p_sample_unit_id uuid,p_replacement_reference text,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF coalesce(p_replacement_reference,'')!~'^SMP-[A-Z0-9]{8,32}$' THEN RAISE EXCEPTION 'replacement reference must be an opaque SMP code' USING ERRCODE='22023'; END IF;
  RETURN public.phase1_create_sample_replacement_internal(p_sample_unit_id,p_replacement_reference,p_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_profiling_submission(p_cycle_id uuid,p_sitio_id uuid,p_payload jsonb,p_source_type text DEFAULT 'manual',p_import_batch_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; sample public.profiling_sample_units%ROWTYPE; prior public.profiling_submissions%ROWTYPE; resident_item jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_payload(p_payload,p_cycle_id,p_sitio_id,cycle.collection_starts_on);
  SELECT * INTO sample FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND sitio_id=p_sitio_id AND sample_reference=p_payload->>'sample_reference' FOR UPDATE;
  IF sample.id IS NULL THEN RAISE EXCEPTION 'registered sample unit is required' USING ERRCODE='23514'; END IF;
  IF sample.household_id IS NOT NULL THEN
    SELECT * INTO prior FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND household_id=sample.household_id AND status='approved' ORDER BY submission_version DESC LIMIT 1 FOR UPDATE;
    IF prior.id IS NOT NULL THEN
      IF coalesce((p_payload->>'expected_version')::integer,-1)<>prior.row_version THEN RAISE EXCEPTION 'stale approved roster version' USING ERRCODE='40001'; END IF;
      IF EXISTS(
        SELECT 1 FROM public.profiling_resident_versions rv WHERE rv.submission_id=prior.id
          AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'residents') item WHERE item->>'resident_id'=rv.resident_id::text)
      ) THEN RAISE EXCEPTION 'approved roster members require an explicit lifecycle action before omission' USING ERRCODE='23514'; END IF;
    END IF;
    PERFORM 1 FROM public.profiling_residents r
      WHERE r.id IN(SELECT (item->>'resident_id')::uuid FROM jsonb_array_elements(p_payload->'residents') item WHERE nullif(item->>'resident_id','') IS NOT NULL)
      FOR UPDATE;
  END IF;
  RETURN public.phase1_create_profiling_submission_internal(p_cycle_id,p_sitio_id,p_payload,p_source_type,p_import_batch_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_profiling_aggregate(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; frozen jsonb; computed jsonb; excluded_packages bigint; nonparticipating bigint;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read',cycle.barangay_id,NULL);
  IF cycle.status IN('completed','archived') THEN
    SELECT aggregate_data INTO frozen FROM public.profiling_evidence_snapshots WHERE cycle_id=p_cycle_id AND aggregate_schema_version='agape.profiling.aggregate.v2' ORDER BY generated_at DESC LIMIT 1;
    IF frozen IS NOT NULL THEN RETURN frozen; END IF;
  END IF;
  computed:=public.phase1_profiling_aggregate_internal(p_cycle_id);
  SELECT count(*) INTO excluded_packages FROM public.profiling_import_rows r JOIN public.profiling_import_batches b ON b.id=r.batch_id WHERE b.cycle_id=p_cycle_id AND r.excluded;
  SELECT count(*) INTO nonparticipating FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND contact_outcome IN('refused','unavailable','ineligible');
  computed:=jsonb_set(computed,'{dataQuality,excludedPackages}',to_jsonb(excluded_packages),true);
  computed:=jsonb_set(computed,'{sample,nonparticipatingHouseholds}',to_jsonb(nonparticipating),true);
  RETURN computed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_transition_profiling_cycle(p_cycle_id uuid,p_expected_version integer,p_to_status text,p_reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',cycle.barangay_id,NULL);
  IF p_to_status='completed' THEN
    IF EXISTS(SELECT 1 FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND contact_outcome='not_contacted')
      OR EXISTS(SELECT 1 FROM public.profiling_sample_units u WHERE u.cycle_id=p_cycle_id AND u.contact_outcome='participated' AND NOT EXISTS(SELECT 1 FROM public.profiling_submissions s WHERE s.sample_unit_id=u.id AND s.status='approved'))
      OR EXISTS(SELECT 1 FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND status IN('draft','pending','returned'))
      OR EXISTS(SELECT 1 FROM public.profiling_duplicate_candidates WHERE cycle_id=p_cycle_id AND status='unresolved')
      OR EXISTS(SELECT 1 FROM public.profiling_import_batches WHERE cycle_id=p_cycle_id AND status IN('uploaded','validating','needs_correction','ready','failed')) THEN
      RAISE EXCEPTION 'sample outcomes, packages, imports, and duplicates must all be resolved' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN public.phase1_transition_profiling_cycle_internal(p_cycle_id,p_expected_version,p_to_status,p_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_record_sample_outcome(p_cycle_id uuid,p_sitio_id uuid,p_sample_reference text,p_contact_outcome text,p_anonymous_household_size integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; sample public.profiling_sample_units%ROWTYPE; actor public.users%ROWTYPE;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id; SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF cycle.id IS NULL OR cycle.status<>'collecting' THEN RAISE EXCEPTION 'cycle is not collecting' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  SELECT * INTO sample FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND sitio_id=p_sitio_id AND sample_reference=p_sample_reference FOR UPDATE;
  IF sample.id IS NULL OR sample.contact_outcome='participated' THEN RAISE EXCEPTION 'sample unit is unavailable' USING ERRCODE='23514'; END IF;
  IF p_contact_outcome='participated' THEN RAISE EXCEPTION 'participation is recorded only by a submitted package' USING ERRCODE='23514'; END IF;
  IF actor.role='barangay_mother_leader' AND p_contact_outcome NOT IN('unavailable','refused') THEN RAISE EXCEPTION 'Mother Leaders may record only unavailable or refused outcomes' USING ERRCODE='42501'; END IF;
  IF sample.contact_outcome='ineligible' AND EXISTS(SELECT 1 FROM public.profiling_sample_units WHERE replacement_of_id=sample.id) THEN RAISE EXCEPTION 'a replaced sample outcome is immutable' USING ERRCODE='23514'; END IF;
  RETURN public.phase1_record_sample_outcome_internal(p_cycle_id,p_sitio_id,p_sample_reference,p_contact_outcome,p_anonymous_household_size);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_guard_consent_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'profiling_consents is append-only' USING ERRCODE='55000'; END IF;
  IF OLD.effective_to IS NULL AND NEW.effective_to IS NOT NULL AND NEW.effective_to>=OLD.effective_from
    AND (to_jsonb(NEW)-'effective_to'-'updated_at')=(to_jsonb(OLD)-'effective_to'-'updated_at') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'only trusted consent-period closure is allowed' USING ERRCODE='55000';
END;
$function$;
DROP TRIGGER IF EXISTS profiling_consents_immutable ON public.profiling_consents;
DROP TRIGGER IF EXISTS profiling_consents_period_guard ON public.profiling_consents;
CREATE TRIGGER profiling_consents_period_guard BEFORE UPDATE OR DELETE ON public.profiling_consents FOR EACH ROW EXECUTE FUNCTION public.phase1_guard_consent_update();

CREATE OR REPLACE FUNCTION public.phase1_apply_profile_lifecycle_action(p_action text,p_entity_id uuid,p_expected_version integer,p_effective_on date,p_reason text,p_target_entity_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE resident public.profiling_residents%ROWTYPE; household public.profiling_households%ROWTYPE; membership public.profiling_household_memberships%ROWTYPE; consent public.profiling_consents%ROWTYPE; new_version integer;
BEGIN
  IF p_effective_on IS NULL OR p_effective_on>current_date OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'effective date and reason are required' USING ERRCODE='22023'; END IF;
  IF p_action IN('resident_inactive','resident_deceased','resident_transfer','resident_merge','consent_withdrawal') THEN
    SELECT * INTO resident FROM public.profiling_residents WHERE id=p_entity_id FOR UPDATE;
    IF resident.id IS NULL OR resident.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale resident version' USING ERRCODE='40001'; END IF;
    PERFORM public.phase1_assert_profiling_runtime(resident.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',resident.barangay_id,NULL);
    IF resident.lifecycle_status<>'active' OR p_effective_on<resident.created_at::date OR NOT EXISTS(SELECT 1 FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id WHERE rv.resident_id=resident.id AND s.status IN('approved','superseded')) THEN RAISE EXCEPTION 'resident lifecycle transition is invalid' USING ERRCODE='23514'; END IF;
    IF p_action='consent_withdrawal' THEN
      SELECT * INTO consent FROM public.profiling_consents WHERE resident_id=resident.id AND status='granted' AND effective_from<=p_effective_on AND (effective_to IS NULL OR effective_to>=p_effective_on) ORDER BY effective_from DESC,recorded_at DESC LIMIT 1 FOR UPDATE;
      IF consent.id IS NULL OR p_effective_on<=consent.effective_from THEN RAISE EXCEPTION 'active consent cannot be withdrawn on this date' USING ERRCODE='23514'; END IF;
      UPDATE public.profiling_consents SET effective_to=p_effective_on-1 WHERE id=consent.id;
      INSERT INTO public.profiling_consents(submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,guardian_relationship,effective_from,withdrawal_reason,recorded_by)
      VALUES(consent.submission_id,consent.subject_type,resident.id,'withdrawn',consent.privacy_notice_id,'WITHDRAWN',consent.guardian_relationship,p_effective_on,btrim(p_reason),auth.uid());
      UPDATE public.profiling_residents SET row_version=row_version+1,updated_at=now() WHERE id=resident.id RETURNING row_version INTO new_version;
      INSERT INTO public.profiling_lifecycle_events(entity_type,entity_id,action,effective_on,from_status,to_status,reason,actor_id) VALUES('consent',resident.id,'withdrawn',p_effective_on,'granted','withdrawn',btrim(p_reason),auth.uid());
      RETURN new_version;
    END IF;
    SELECT * INTO membership FROM public.profiling_household_memberships WHERE resident_id=resident.id AND activated_at IS NOT NULL AND effective_from<=p_effective_on AND (effective_to IS NULL OR effective_to>=p_effective_on) ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
    IF membership.id IS NOT NULL AND p_effective_on<=membership.effective_from THEN RAISE EXCEPTION 'lifecycle date must follow membership start' USING ERRCODE='23514'; END IF;
  ELSIF p_action IN('household_moved','household_dissolved','household_merge') THEN
    SELECT * INTO household FROM public.profiling_households WHERE id=p_entity_id FOR UPDATE;
    IF household.id IS NULL OR household.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale household version' USING ERRCODE='40001'; END IF;
    PERFORM public.phase1_assert_profiling_runtime(household.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',household.barangay_id,NULL);
    IF household.lifecycle_status<>'active' OR p_effective_on<household.created_at::date OR NOT EXISTS(SELECT 1 FROM public.profiling_submissions s WHERE s.household_id=household.id AND s.status IN('approved','superseded')) THEN RAISE EXCEPTION 'household lifecycle transition is invalid' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'invalid lifecycle action' USING ERRCODE='22023'; END IF;
  RETURN public.phase1_apply_profile_lifecycle_action_internal(p_action,p_entity_id,p_expected_version,p_effective_on,p_reason,p_target_entity_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_record_resident_reconsent(p_resident_id uuid,p_expected_version integer,p_effective_on date,p_consented_by_name text,p_guardian_relationship text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE resident public.profiling_residents%ROWTYPE; prior public.profiling_consents%ROWTYPE; latest_version public.profiling_resident_versions%ROWTYPE; new_version integer; subject text;
BEGIN
  SELECT * INTO resident FROM public.profiling_residents WHERE id=p_resident_id FOR UPDATE;
  IF resident.id IS NULL OR resident.row_version<>p_expected_version OR resident.lifecycle_status<>'active' THEN RAISE EXCEPTION 'stale or inactive resident' USING ERRCODE='40001'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(resident.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',resident.barangay_id,NULL);
  SELECT * INTO prior FROM public.profiling_consents WHERE resident_id=resident.id ORDER BY effective_from DESC,recorded_at DESC LIMIT 1;
  SELECT rv.* INTO latest_version FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id WHERE rv.resident_id=resident.id AND s.status IN('approved','superseded') ORDER BY rv.version DESC LIMIT 1;
  IF prior.id IS NULL OR prior.status<>'withdrawn' OR p_effective_on<prior.effective_from OR p_effective_on>current_date OR length(btrim(coalesce(p_consented_by_name,'')))<1 THEN RAISE EXCEPTION 're-consent is invalid' USING ERRCODE='23514'; END IF;
  subject:=CASE WHEN latest_version.is_minor THEN 'guardian' ELSE 'adult' END;
  IF subject='guardian' AND length(btrim(coalesce(p_guardian_relationship,'')))<1 THEN RAISE EXCEPTION 'guardian relationship is required' USING ERRCODE='23514'; END IF;
  INSERT INTO public.profiling_consents(submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,guardian_relationship,effective_from,recorded_by)
  VALUES(prior.submission_id,subject,resident.id,'granted',prior.privacy_notice_id,btrim(p_consented_by_name),CASE WHEN subject='guardian' THEN btrim(p_guardian_relationship) END,p_effective_on,auth.uid());
  UPDATE public.profiling_residents SET row_version=row_version+1,updated_at=now() WHERE id=resident.id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_lifecycle_events(entity_type,entity_id,action,effective_on,from_status,to_status,reason,actor_id) VALUES('consent',resident.id,'reactivated',p_effective_on,'withdrawn','granted','recorded re-consent',auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_begin_profiling_revision(p_cycle_id uuid,p_sample_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE seed jsonb; cycle public.profiling_cycles%ROWTYPE; filtered jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  seed:=public.phase1_begin_profiling_revision_internal(p_cycle_id,p_sample_reference);
  SELECT coalesce(jsonb_agg(item),'[]'::jsonb) INTO filtered FROM jsonb_array_elements(seed->'residents') item
  WHERE NOT EXISTS(SELECT 1 FROM public.profiling_lifecycle_events e WHERE e.entity_id=(item->>'resident_id')::uuid AND e.entity_type IN('resident','consent') AND e.action IN('inactive','deceased','merged','withdrawn') AND e.effective_on<=cycle.collection_starts_on)
    AND coalesce((SELECT c.status FROM public.profiling_consents c WHERE c.resident_id=(item->>'resident_id')::uuid AND c.effective_from<=cycle.collection_starts_on ORDER BY c.effective_from DESC,c.recorded_at DESC LIMIT 1),'withdrawn')='granted';
  RETURN jsonb_set(seed,'{residents}',filtered,true);
END;
$function$;

-- Runtime-off must block every identifiable read, including direct RPC calls.
CREATE OR REPLACE FUNCTION public.phase1_list_profiling_submissions(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid(); SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF actor.role='barangay_mother_leader' THEN
    IF actor.barangay_id IS DISTINCT FROM cycle.barangay_id OR NOT public.phase1_current_has_capability('profiling.collect') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSIF actor.role='barangay_secretary' THEN PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,NULL);
  ELSE PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,NULL); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'household_id',s.household_id,'household_code',h.household_code,'sitio_id',s.sitio_id,'sitio_name',si.name,'status',s.status,'row_version',s.row_version,'submission_version',s.submission_version,'source_type',s.source_type,'resident_count',(SELECT count(*) FROM public.profiling_resident_versions rv WHERE rv.submission_id=s.id),'submitted_at',s.submitted_at,'updated_at',s.updated_at,'return_reason',s.return_reason) ORDER BY s.updated_at DESC),'[]'::jsonb) INTO result
  FROM public.profiling_submissions s JOIN public.profiling_households h ON h.id=s.household_id JOIN public.barangay_sitios si ON si.id=s.sitio_id
  WHERE s.cycle_id=p_cycle_id
    AND (actor.role<>'barangay_mother_leader' OR (s.created_by=actor.id AND EXISTS(SELECT 1 FROM public.mother_leader_sitio_assignments a WHERE a.mother_leader_id=actor.id AND a.sitio_id=s.sitio_id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date))))
    AND (actor.role<>'barangay_captain' OR s.status='approved');
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_get_profiling_submission(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE actor public.users%ROWTYPE; submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; residents jsonb; consents jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid(); SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF actor.role='barangay_mother_leader' THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,submission.sitio_id);
    IF submission.created_by<>actor.id OR submission.status NOT IN('draft','pending','returned') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,submission.sitio_id);
    IF actor.role='barangay_captain' AND submission.status<>'approved' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('resident_id',rv.resident_id,'resident_code',r.resident_code,'lifecycle_status',r.lifecycle_status,'profile',rv.profile_data,'is_minor',rv.is_minor,'relationship_to_head',rv.relationship_to_head,'is_household_head',rv.is_household_head) ORDER BY rv.is_household_head DESC,rv.created_at),'[]'::jsonb) INTO residents FROM public.profiling_resident_versions rv JOIN public.profiling_residents r ON r.id=rv.resident_id WHERE rv.submission_id=p_submission_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('subjectType',c.subject_type,'residentId',c.resident_id,'status',c.status,'consentedByName',c.consented_by_name,'guardianRelationship',c.guardian_relationship,'effectiveFrom',c.effective_from,'effectiveTo',c.effective_to) ORDER BY c.recorded_at),'[]'::jsonb) INTO consents FROM public.profiling_consents c WHERE c.submission_id=p_submission_id;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(actor.id,actor.email,'Resident profile viewed','profiling_submissions',p_submission_id::text,'warning',jsonb_build_object('cycle_id',cycle.id,'purpose','authorized profiling detail'));
  RETURN jsonb_build_object('id',submission.id,'cycle_id',submission.cycle_id,'household_id',submission.household_id,'sitio_id',submission.sitio_id,'sample_reference',(SELECT sample_reference FROM public.profiling_sample_units WHERE id=submission.sample_unit_id),'status',submission.status,'row_version',submission.row_version,'household',submission.household_data,'anonymous_nonparticipant_count',submission.anonymous_nonparticipant_count,'residents',residents,'consents',consents);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_endorse_profiling_cycle(p_cycle_id uuid,p_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; new_version integer;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.endorse',cycle.barangay_id,NULL);
  IF cycle.status NOT IN('completed','archived') OR cycle.row_version<>p_expected_version OR cycle.captain_endorsed_at IS NOT NULL THEN RAISE EXCEPTION 'cycle cannot be endorsed' USING ERRCODE='40001'; END IF;
  UPDATE public.profiling_cycles SET captain_endorsed_at=now(),captain_endorsed_by=auth.uid(),row_version=row_version+1,updated_at=now() WHERE id=p_cycle_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,event_type,actor_id) VALUES(p_cycle_id,'captain_endorsed',auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_get_import_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.profiling_import_batches%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; actor public.users%ROWTYPE; rows jsonb; errors jsonb; duplicates jsonb;
BEGIN
  SELECT * INTO batch FROM public.profiling_import_batches WHERE id=p_batch_id; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=batch.cycle_id; SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF batch.id IS NULL THEN RAISE EXCEPTION 'batch not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,batch.sitio_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('rowNumber',row_number,'rowKey',row_key,'excluded',excluded,'package',sanitized_data) ORDER BY row_number),'[]'::jsonb) INTO rows FROM public.profiling_import_rows WHERE batch_id=p_batch_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sheet',sheet_name,'row',row_number,'field',field_name,'message',message,'fatal',is_fatal) ORDER BY row_number,id),'[]'::jsonb) INTO errors FROM public.profiling_import_errors WHERE batch_id=p_batch_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'type',candidate_type,'left',left_reference,'right',right_reference,'confidence',confidence,'status',status,'reason',resolution_reason,'linkedEntityId',linked_entity_id) ORDER BY created_at),'[]'::jsonb) INTO duplicates FROM public.profiling_duplicate_candidates WHERE batch_id=p_batch_id;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(actor.id,actor.email,'Profiling import staging viewed','profiling_import_batches',batch.id::text,'warning',jsonb_build_object('cycle_id',cycle.id));
  RETURN jsonb_build_object('id',batch.id,'status',batch.status,'sourceType',batch.source_type,'templateVersion',batch.template_version,'householdRows',batch.household_row_count,'residentRows',batch.resident_row_count,'fatalErrors',batch.fatal_error_count,'rows',rows,'errors',errors,'duplicates',duplicates,'replacesBatchId',batch.replaces_batch_id,'purgedAt',batch.purged_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_duplicates(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF public.phase1_current_has_capability('profiling.validate') THEN PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,NULL);
  ELSE PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',cycle.barangay_id,NULL); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'cycle_id',d.cycle_id,'batch_id',d.batch_id,'candidate_type',d.candidate_type,'left_reference',d.left_reference,'right_reference',d.right_reference,'confidence',d.confidence,'status',d.status,'resolution_reason',d.resolution_reason,'linked_entity_id',d.linked_entity_id,'created_at',d.created_at) ORDER BY d.created_at),'[]'::jsonb) INTO result
  FROM public.profiling_duplicate_candidates d WHERE d.cycle_id=p_cycle_id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_resolve_profiling_duplicate_v2(p_candidate_id uuid,p_resolution text,p_reason text,p_linked_entity_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE candidate public.profiling_duplicate_candidates%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; batch public.profiling_import_batches%ROWTYPE;
BEGIN
  SELECT * INTO candidate FROM public.profiling_duplicate_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF candidate.id IS NULL OR candidate.status<>'unresolved' THEN RAISE EXCEPTION 'duplicate decision is stale' USING ERRCODE='40001'; END IF;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=candidate.cycle_id;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  IF candidate.batch_id IS NOT NULL THEN
    SELECT * INTO batch FROM public.profiling_import_batches WHERE id=candidate.batch_id FOR UPDATE;
    IF batch.status NOT IN('needs_correction','ready') THEN RAISE EXCEPTION 'duplicate batch is unavailable' USING ERRCODE='23514'; END IF;
  END IF;
  PERFORM public.phase1_resolve_profiling_duplicate_v2_internal(p_candidate_id,p_resolution,p_reason,p_linked_entity_id);
  INSERT INTO public.profiling_events(cycle_id,event_type,reason,metadata,actor_id)
  VALUES(candidate.cycle_id,'duplicate_resolved',btrim(p_reason),jsonb_build_object('candidate_id',candidate.id,'candidate_type',candidate.candidate_type,'resolution',p_resolution,'batch_id',candidate.batch_id),auth.uid());
END;
$function$;

-- Atomic, idempotent commit that purges staged PII but retains redacted
-- duplicate decisions as immutable operational evidence.
CREATE OR REPLACE FUNCTION public.phase1_commit_profiling_import(p_batch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.profiling_import_batches%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; staged record; submission_id uuid; committed integer:=0;
BEGIN
  SELECT * INTO batch FROM public.profiling_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF batch.id IS NULL THEN RAISE EXCEPTION 'batch not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=batch.cycle_id FOR UPDATE;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,batch.sitio_id);
  IF batch.status='committed' THEN RETURN (SELECT count(*)::integer FROM public.profiling_submissions WHERE import_batch_id=p_batch_id); END IF;
  IF batch.status<>'ready'
    OR EXISTS(SELECT 1 FROM public.profiling_import_errors WHERE batch_id=p_batch_id AND is_fatal AND resolved_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.profiling_duplicate_candidates WHERE batch_id=p_batch_id AND status='unresolved') THEN
    RAISE EXCEPTION 'batch is not ready' USING ERRCODE='23514';
  END IF;
  FOR staged IN SELECT * FROM public.profiling_import_rows WHERE batch_id=p_batch_id AND sheet_name='Households' AND excluded=false ORDER BY row_number FOR UPDATE LOOP
    submission_id:=public.phase1_create_profiling_submission(batch.cycle_id,batch.sitio_id,staged.sanitized_data,batch.source_type,batch.id);
    PERFORM public.phase1_submit_profiling_package(submission_id,1);
    committed:=committed+1;
  END LOOP;
  DELETE FROM public.profiling_import_errors WHERE batch_id=p_batch_id;
  UPDATE public.profiling_duplicate_candidates
    SET left_reference='PURGED',right_reference='PURGED'
    WHERE batch_id=p_batch_id;
  UPDATE public.profiling_import_rows SET sanitized_data=NULL,row_key=NULL WHERE batch_id=p_batch_id;
  UPDATE public.profiling_import_batches SET status='committed',committed_at=now(),committed_by=auth.uid(),purged_at=now(),updated_at=now() WHERE id=p_batch_id;
  INSERT INTO public.profiling_events(cycle_id,event_type,metadata,actor_id)
  VALUES(batch.cycle_id,'import_committed',jsonb_build_object('batch_id',batch.id,'packages',committed,'staging_purged',true,'duplicate_decisions_retained',true),auth.uid());
  RETURN committed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_purge_expired_import_staging()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE affected bigint; target_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id),'{}') INTO target_ids FROM public.profiling_import_batches WHERE status='committed' OR staging_purge_after<=now();
  UPDATE public.profiling_import_rows SET sanitized_data=NULL,row_key=NULL WHERE batch_id=ANY(target_ids) AND (sanitized_data IS NOT NULL OR row_key IS NOT NULL);
  GET DIAGNOSTICS affected=ROW_COUNT;
  UPDATE public.profiling_duplicate_candidates SET left_reference='PURGED',right_reference='PURGED' WHERE batch_id=ANY(target_ids) AND (left_reference<>'PURGED' OR right_reference<>'PURGED');
  DELETE FROM public.profiling_import_errors WHERE batch_id=ANY(target_ids);
  UPDATE public.profiling_import_batches SET status=CASE WHEN status='committed' THEN status ELSE 'purged' END,purged_at=coalesce(purged_at,now()),updated_at=now() WHERE id=ANY(target_ids);
  RETURN affected;
END;
$function$;

ALTER TABLE public.survey_answer_codes
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.survey_answer_codes DROP CONSTRAINT IF EXISTS survey_answer_codes_unique_per_coder;
CREATE UNIQUE INDEX IF NOT EXISTS survey_answer_codes_active_unique_per_coder
  ON public.survey_answer_codes(answer_id,coder_id,label) WHERE voided_at IS NULL;
ALTER TABLE public.domain_correction_events DROP CONSTRAINT IF EXISTS domain_correction_events_domain_check;
ALTER TABLE public.domain_correction_events ADD CONSTRAINT domain_correction_events_domain_check CHECK(domain IN('survey','donation','impact'));

CREATE OR REPLACE FUNCTION public.phase1_set_survey_response_exclusion(p_response_id uuid,p_excluded boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE response public.survey_responses%ROWTYPE; survey_barangay uuid;
BEGIN
  IF NOT public.phase1_current_has_capability('survey.analyze') OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'a correction reason is required' USING ERRCODE='42501'; END IF;
  SELECT * INTO response FROM public.survey_responses WHERE id=p_response_id FOR UPDATE;
  IF response.id IS NULL OR response.excluded IS NOT DISTINCT FROM p_excluded THEN RAISE EXCEPTION 'response exclusion state is unavailable or unchanged' USING ERRCODE='40001'; END IF;
  SELECT barangay_id INTO survey_barangay FROM public.surveys WHERE id=response.survey_id;
  IF EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role LIKE 'barangay_%' AND barangay_id IS DISTINCT FROM survey_barangay) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,reason,metadata,actor_id)
  VALUES('survey','response',response.id,CASE WHEN p_excluded THEN 'excluded' ELSE 'reinstated' END,btrim(p_reason),jsonb_build_object('previous_excluded',response.excluded,'previous_reason',response.exclusion_reason,'previous_actor',response.excluded_by,'previous_at',response.excluded_at),auth.uid());
  UPDATE public.survey_responses SET excluded=p_excluded,exclusion_reason=btrim(p_reason),excluded_by=auth.uid(),excluded_at=now() WHERE id=response.id;
  RETURN jsonb_build_object('id',response.id,'excluded',p_excluded,'reason',btrim(p_reason),'recordedAt',now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_void_survey_answer_code(p_code_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE code public.survey_answer_codes%ROWTYPE;
BEGIN
  IF NOT public.phase1_current_has_capability('survey.analyze') OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'a correction reason is required' USING ERRCODE='42501'; END IF;
  SELECT * INTO code FROM public.survey_answer_codes WHERE id=p_code_id FOR UPDATE;
  IF code.id IS NULL OR code.voided_at IS NOT NULL THEN RAISE EXCEPTION 'answer code is unavailable' USING ERRCODE='P0002'; END IF;
  IF code.coder_id<>auth.uid() AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='paraya_director') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.survey_answer_codes SET voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason) WHERE id=code.id;
  INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,reason,metadata,actor_id)
  VALUES('survey','answer_code',code.id,'voided',btrim(p_reason),jsonb_build_object('answer_id',code.answer_id,'label',code.label,'coder_id',code.coder_id),auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_sample_units(p_cycle_id uuid,p_sitio_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; actor public.users%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id; SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  IF actor.role='barangay_mother_leader' THEN
    PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  ELSIF public.phase1_current_has_capability('profiling.cycle.manage') THEN
    PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',cycle.barangay_id,NULL);
  ELSIF public.phase1_current_has_capability('profiling.validate') THEN
    PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,p_sitio_id);
  ELSIF public.phase1_current_has_capability('profiling.detail.read') THEN
    PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.detail.read',cycle.barangay_id,p_sitio_id);
  ELSE
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'sitioId',u.sitio_id,'sampleReference',u.sample_reference,'contactOutcome',u.contact_outcome,'anonymousHouseholdSize',u.anonymous_household_size,'householdId',u.household_id,'replacementOfId',u.replacement_of_id,'replacementReason',u.replacement_reason,'rowVersion',u.row_version) ORDER BY u.sample_reference),'[]'::jsonb) INTO result
  FROM public.profiling_sample_units u WHERE u.cycle_id=p_cycle_id AND (p_sitio_id IS NULL OR u.sitio_id=p_sitio_id)
    AND (actor.role<>'barangay_mother_leader' OR EXISTS(SELECT 1 FROM public.mother_leader_sitio_assignments a WHERE a.mother_leader_id=actor.id AND a.sitio_id=u.sitio_id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)));
  RETURN result;
END;
$function$;

-- Obsolete unvalidated entry points stay unavailable. Explicit grants below
-- are the complete authenticated profiling RPC surface.
REVOKE ALL ON FUNCTION public.phase1_stage_profiling_import(uuid,uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_resolve_profiling_duplicate(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_create_profiling_submission_internal(uuid,uuid,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_profiling_aggregate_internal(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_transition_profiling_cycle_internal(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_record_sample_outcome_internal(uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_apply_profile_lifecycle_action_internal(text,uuid,integer,date,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_begin_profiling_revision_internal(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_resolve_profiling_duplicate_v2_internal(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_set_profiling_runtime_internal(text,uuid[],uuid[],boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_register_sample_units_internal(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_create_sample_replacement_internal(uuid,text,text) FROM PUBLIC,anon,authenticated;

DO $revoke_public_phase1$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) args FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'phase1\_%' ESCAPE '\'
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',fn.proname,fn.args); END LOOP;
END;
$revoke_public_phase1$;

-- Explicit application RPC allowlist. Helpers and superseded entry points stay
-- owner/service-only; later functions cannot inherit accidental PUBLIC access.
GRANT EXECUTE ON FUNCTION public.phase1_current_has_capability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_current_permission_module_allowed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_get_profiling_runtime() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_set_profiling_runtime(text,uuid[],uuid[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_set_barangay_profile_prefix(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_sitio(uuid,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_sitios(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_assign_mother_leader(uuid,uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_close_mother_leader_assignment(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_privacy_notice(text,text,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_active_privacy_notices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_set_suppression_threshold(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_official_population_snapshot(uuid,date,text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_official_population_snapshots(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_verify_official_population_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_profiling_cycle(uuid,text,text,integer,date,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_cycles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_profiling_submission(uuid,uuid,jsonb,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_submit_profiling_package(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_decide_profiling_submission(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_profiling_aggregate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_transition_profiling_cycle(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_record_sample_outcome(uuid,uuid,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_register_sample_units(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_sample_replacement(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_apply_profile_lifecycle_action(text,uuid,integer,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_record_resident_reconsent(uuid,integer,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_begin_profiling_revision(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_submissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_get_profiling_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_get_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_duplicates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_resolve_profiling_duplicate_v2(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_sample_units(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_endorse_profiling_cycle(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_stage_profiling_import_v2(uuid,uuid,text,text,text,jsonb,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_commit_profiling_import(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.phase1_save_survey(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_submit_survey_response(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_transition_survey_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_set_survey_response_exclusion(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_void_survey_answer_code(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_record_donation_distribution(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_save_donation(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_void_donation_record(text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_impact_record(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_transition_follow_up(uuid,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_void_impact_record(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_purge_expired_import_staging() TO service_role;

COMMIT;
