-- Phase 1 completion gate. Forward-only corrective migration.
-- Keep profiling runtime mode OFF until disposable-clone/JWT verification passes.
BEGIN;

ALTER TABLE public.proposal_validation_links DROP CONSTRAINT IF EXISTS proposal_validation_links_source_type_check;
ALTER TABLE public.proposal_validation_links ADD CONSTRAINT proposal_validation_links_source_type_check CHECK(source_type IN('community_need','survey','survey_response','field_observation','household_profile','profiling_evidence_snapshot'));

-- Canonical capability aliases and grants. Generic legacy roles intentionally
-- receive no operational capability; institutional roles remain history-only.
CREATE OR REPLACE FUNCTION public.phase1_permission_module(p_capability text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
  SELECT CASE
    WHEN p_capability LIKE 'admin.users.%' THEN 'user_management'
    WHEN p_capability LIKE 'admin.audit.%' THEN 'audit_logs'
    WHEN p_capability LIKE 'admin.recovery.%' THEN 'backup'
    WHEN p_capability LIKE 'legacy_partner.%' THEN 'historical_records'
    WHEN p_capability LIKE 'partnership.%' THEN 'partnerships'
    WHEN p_capability LIKE 'proposal.%' THEN 'proposals'
    WHEN p_capability LIKE 'program.%' THEN 'programs'
    WHEN p_capability LIKE 'volunteer.%' THEN 'volunteers'
    WHEN p_capability LIKE 'survey.%' THEN 'surveys'
    WHEN p_capability LIKE 'community_need.%' THEN 'community_needs'
    WHEN p_capability LIKE 'observation.%' THEN 'observations'
    WHEN p_capability LIKE 'skill_asset.%' THEN 'skills_assets'
    WHEN p_capability LIKE 'attendance.%' THEN 'attendance'
    WHEN p_capability LIKE 'activity_log.%' THEN 'activity_logs'
    WHEN p_capability LIKE 'donation.%' THEN 'donations'
    WHEN p_capability LIKE 'impact.%' THEN 'impact'
    WHEN p_capability LIKE 'analytics.%' THEN 'analytics'
    WHEN p_capability LIKE 'report.%' THEN 'reports'
    WHEN p_capability LIKE 'communication.%' THEN 'communication'
    WHEN p_capability LIKE 'ai.%' THEN 'ai_assistance'
    WHEN p_capability LIKE 'profiling.%' THEN 'profiling'
    ELSE NULL END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
  SELECT CASE
    WHEN p_role='admin' THEN p_capability IN('admin.users.manage','admin.audit.read','admin.recovery.read')
    WHEN p_role IN('office','student_org','department') THEN p_capability='legacy_partner.history.read'
    WHEN p_role='finance_officer' THEN p_capability IN('proposal.read','proposal.finance')
    WHEN p_role='volunteer' THEN p_capability IN('program.read','volunteer.self','survey.read','survey.respond','attendance.self','activity_log.self','communication.read','communication.write','ai.assist')
    WHEN p_role='barangay_captain' THEN p_capability IN('partnership.read','proposal.validation.record','survey.read','survey.respond','community_need.read','community_need.submit','community_need.validate','observation.read','skill_asset.read','report.read','communication.read','communication.write','ai.assist','profiling.detail.read','profiling.aggregate.read','profiling.endorse')
    WHEN p_role='barangay_secretary' THEN p_capability IN('partnership.read','proposal.validation.record','survey.read','survey.respond','community_need.read','community_need.submit','observation.read','skill_asset.read','report.read','communication.read','communication.write','ai.assist','profiling.detail.read','profiling.aggregate.read','profiling.validate')
    WHEN p_role='barangay_mother_leader' THEN p_capability IN('partnership.read','proposal.validation.record','survey.read','survey.respond','community_need.read','community_need.submit','observation.read','skill_asset.read','skill_asset.manage','communication.read','communication.write','ai.assist','profiling.collect')
    WHEN p_role='paraya_director' THEN p_capability IN('partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','proposal.validation.record','proposal.decide','program.read','program.manage','volunteer.directory.read','volunteer.manage','survey.read','survey.manage','survey.analyze','community_need.read','community_need.manage','observation.read','observation.manage','skill_asset.read','skill_asset.manage','attendance.manage','activity_log.manage','donation.read','donation.manage','impact.read','impact.manage','analytics.aggregate.read','report.read','report.manage','communication.read','communication.write','communication.manage','communication.moderate','ai.assist','profiling.aggregate.read','profiling.privacy.configure')
    WHEN p_role='paraya_associate' THEN p_capability IN('partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','proposal.validation.record','program.read','program.manage','volunteer.directory.read','volunteer.manage','survey.read','survey.manage','survey.analyze','community_need.read','community_need.manage','observation.read','observation.manage','skill_asset.read','skill_asset.manage','attendance.manage','activity_log.manage','donation.read','donation.manage','impact.read','impact.manage','analytics.aggregate.read','report.read','report.manage','communication.read','communication.write','communication.manage','communication.moderate','ai.assist','profiling.aggregate.read')
    WHEN p_role='paraya_researcher' THEN p_capability IN('partnership.read','partnership.manage','proposal.read','proposal.create','proposal.review','proposal.validation.record','program.read','program.manage','volunteer.directory.read','volunteer.manage','survey.read','survey.manage','survey.analyze','community_need.read','community_need.manage','observation.read','observation.manage','skill_asset.read','skill_asset.manage','attendance.manage','activity_log.manage','donation.read','donation.manage','impact.read','impact.manage','analytics.aggregate.read','report.read','report.manage','communication.read','communication.write','communication.manage','communication.moderate','ai.assist','profiling.aggregate.read','profiling.cycle.manage','profiling.collect','profiling.detail.read')
    ELSE false END;
$function$;

CREATE TABLE IF NOT EXISTS public.profiling_runtime_settings(
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  mode text NOT NULL DEFAULT 'off' CHECK(mode IN('off','synthetic','live')),
  synthetic_user_ids uuid[] NOT NULL DEFAULT '{}',
  synthetic_barangay_ids uuid[] NOT NULL DEFAULT '{}',
  privacy_approved_at timestamptz,
  privacy_approved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(mode<>'live' OR (privacy_approved_at IS NOT NULL AND privacy_approved_by IS NOT NULL))
);
INSERT INTO public.profiling_runtime_settings(id,mode) VALUES(true,'off') ON CONFLICT(id) DO NOTHING;

ALTER TABLE public.profiling_sample_units ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.profiling_households(id) ON DELETE RESTRICT;
ALTER TABLE public.profiling_sample_units ADD COLUMN IF NOT EXISTS replacement_of_id uuid REFERENCES public.profiling_sample_units(id) ON DELETE RESTRICT;
ALTER TABLE public.profiling_sample_units ADD COLUMN IF NOT EXISTS replacement_reason text;
ALTER TABLE public.profiling_sample_units ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.profiling_submissions ADD COLUMN IF NOT EXISTS supersedes_submission_id uuid REFERENCES public.profiling_submissions(id) ON DELETE RESTRICT;
ALTER TABLE public.profiling_consents ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT current_date;
ALTER TABLE public.profiling_consents ADD COLUMN IF NOT EXISTS effective_to date;
ALTER TABLE public.profiling_consents ADD COLUMN IF NOT EXISTS withdrawal_reason text;
ALTER TABLE public.profiling_import_batches ADD COLUMN IF NOT EXISTS replaces_batch_id uuid REFERENCES public.profiling_import_batches(id) ON DELETE RESTRICT;
ALTER TABLE public.profiling_import_batches ADD COLUMN IF NOT EXISTS purged_at timestamptz;
ALTER TABLE public.profiling_duplicate_candidates ADD COLUMN IF NOT EXISTS linked_entity_id uuid;
ALTER TABLE public.profiling_import_batches DROP CONSTRAINT IF EXISTS profiling_import_batches_status_check;
ALTER TABLE public.profiling_import_batches ADD CONSTRAINT profiling_import_batches_status_check CHECK(status IN('uploaded','validating','needs_correction','ready','committed','failed','purged'));

CREATE TABLE IF NOT EXISTS public.profiling_lifecycle_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK(entity_type IN('household','resident','membership','consent')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('moved','dissolved','inactive','deceased','transfer','joined','merged','withdrawn','reactivated')),
  effective_on date NOT NULL,
  from_status text,
  to_status text,
  target_entity_id uuid,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiling_lifecycle_entity_date_idx ON public.profiling_lifecycle_events(entity_type,entity_id,effective_on,created_at);
DROP TRIGGER IF EXISTS profiling_lifecycle_events_immutable ON public.profiling_lifecycle_events;
CREATE TRIGGER profiling_lifecycle_events_immutable BEFORE UPDATE OR DELETE ON public.profiling_lifecycle_events FOR EACH ROW EXECUTE FUNCTION public.phase1_block_immutable_change();

CREATE OR REPLACE FUNCTION public.phase1_assert_profiling_runtime(p_barangay_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE setting public.profiling_runtime_settings%ROWTYPE;
BEGIN
  SELECT * INTO setting FROM public.profiling_runtime_settings WHERE id=true;
  IF setting.mode='off' THEN RAISE EXCEPTION 'profiling runtime is off' USING ERRCODE='55000'; END IF;
  IF setting.mode='synthetic' AND NOT(auth.uid()=ANY(setting.synthetic_user_ids) AND p_barangay_id=ANY(setting.synthetic_barangay_ids)) THEN
    RAISE EXCEPTION 'profiling runtime is restricted to the synthetic pilot' USING ERRCODE='42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_json_object_has_only(p_value jsonb,p_allowed text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
  SELECT jsonb_typeof(p_value)='object' AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) key WHERE NOT(key=ANY(p_allowed)));
$function$;

CREATE OR REPLACE FUNCTION public.phase1_json_string_array_is_controlled(p_value jsonb,p_allowed text[],p_max integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
  SELECT jsonb_typeof(COALESCE(p_value,'[]'::jsonb))='array'
    AND jsonb_array_length(COALESCE(p_value,'[]'::jsonb))<=p_max
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_value,'[]'::jsonb)) item WHERE jsonb_typeof(item)<>'string' OR NOT(trim(both '"' from item::text)=ANY(p_allowed)));
$function$;

CREATE OR REPLACE FUNCTION public.phase1_age_on(p_birth_date date,p_estimated_age integer,p_as_of date)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $function$
BEGIN
  IF p_birth_date IS NOT NULL THEN
    IF p_birth_date>p_as_of OR p_birth_date<p_as_of-interval '125 years' THEN RAISE EXCEPTION 'invalid birth date' USING ERRCODE='22023'; END IF;
    RETURN date_part('year',age(p_as_of,p_birth_date))::integer;
  END IF;
  IF p_estimated_age IS NULL OR p_estimated_age NOT BETWEEN 0 AND 125 THEN RAISE EXCEPTION 'birth date or estimated age is required' USING ERRCODE='22023'; END IF;
  RETURN p_estimated_age;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_assert_resident_payload(p_resident jsonb,p_as_of date)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $function$
DECLARE age_years integer; pregnancy boolean; from_date date; to_date date;
BEGIN
  IF NOT public.phase1_json_object_has_only(p_resident,ARRAY['resident_id','household_row_key','first_name','middle_name','last_name','suffix','birth_date','estimated_age','sex','civil_status','relationship_to_head','education_level','is_enrolled','school_category','employment_status','occupation_category','income_bracket','skills','disability_support','health_support','pregnancy_status','pregnancy_effective_from','pregnancy_effective_to','is_solo_parent','is_4ps_member','planning_needs','consent_status','guardian_name','guardian_relationship']) THEN RAISE EXCEPTION 'resident payload contains unknown fields' USING ERRCODE='22023'; END IF;
  IF length(btrim(coalesce(p_resident->>'first_name',''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(p_resident->>'last_name',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'resident name is invalid' USING ERRCODE='22023'; END IF;
  IF p_resident->>'sex' NOT IN('female','male','intersex','not_stated') OR p_resident->>'civil_status' NOT IN('single','married','cohabiting','separated','widowed','not_stated') THEN RAISE EXCEPTION 'resident category is invalid' USING ERRCODE='22023'; END IF;
  IF coalesce(p_resident->>'relationship_to_head','other') NOT IN('household_head','spouse_partner','child','parent','sibling','relative','non_relative','other') THEN RAISE EXCEPTION 'household relationship is invalid' USING ERRCODE='22023'; END IF;
  IF coalesce(p_resident->>'education_level','not_stated') NOT IN('none','early_childhood','elementary','junior_high','senior_high','technical_vocational','college','postgraduate','not_stated') THEN RAISE EXCEPTION 'education category is invalid' USING ERRCODE='22023'; END IF;
  IF coalesce(p_resident->>'employment_status','not_stated') NOT IN('employed','self_employed','unemployed_seeking','not_seeking','student','retired','not_stated') THEN RAISE EXCEPTION 'employment category is invalid' USING ERRCODE='22023'; END IF;
  IF coalesce(p_resident->>'occupation_category','not_stated') NOT IN('not_stated','agriculture','fishing','construction','manufacturing','transport','retail','food_service','education','health_care','public_service','domestic_work','technology','professional','informal_labor','unemployed','student','retired','other') THEN RAISE EXCEPTION 'occupation category is invalid' USING ERRCODE='22023'; END IF;
  IF p_resident->>'consent_status'<>'granted' THEN RAISE EXCEPTION 'identifiable resident requires granted consent' USING ERRCODE='23514'; END IF;
  age_years:=public.phase1_age_on(nullif(p_resident->>'birth_date','')::date,nullif(p_resident->>'estimated_age','')::integer,p_as_of);
  IF age_years<18 AND (length(btrim(coalesce(p_resident->>'guardian_name','')))<1 OR length(btrim(coalesce(p_resident->>'guardian_relationship','')))<1) THEN RAISE EXCEPTION 'derived minor requires guardian authorization' USING ERRCODE='23514'; END IF;
  IF age_years>=18 AND (nullif(p_resident->>'guardian_name','') IS NOT NULL OR nullif(p_resident->>'guardian_relationship','') IS NOT NULL) THEN RAISE EXCEPTION 'adult consent cannot be represented as guardian authorization' USING ERRCODE='23514'; END IF;
  IF NOT public.phase1_json_string_array_is_controlled(p_resident->'disability_support',ARRAY['mobility','vision','hearing','communication','cognitive','psychosocial','self_care','other'],8)
    OR NOT public.phase1_json_string_array_is_controlled(p_resident->'health_support',ARRAY['maternal','child_nutrition','maintenance_medicine','mobility_support','mental_wellbeing','other'],6)
    OR NOT public.phase1_json_string_array_is_controlled(p_resident->'planning_needs',ARRAY['health','education','livelihood','accessibility','digital_access','other'],6) THEN RAISE EXCEPTION 'resident planning category is invalid' USING ERRCODE='22023'; END IF;
  IF NOT public.phase1_json_string_array_is_controlled(p_resident->'skills',ARRAY['agriculture','food_preparation','sewing','handicraft','carpentry','electrical','plumbing','caregiving','teaching','digital_literacy','computer_technical','entrepreneurship','driving','community_organizing','disaster_response','first_aid','other'],17) THEN RAISE EXCEPTION 'skill category is invalid' USING ERRCODE='22023'; END IF;
  pregnancy:=coalesce((p_resident->>'pregnancy_status')::boolean,false); from_date:=nullif(p_resident->>'pregnancy_effective_from','')::date; to_date:=nullif(p_resident->>'pregnancy_effective_to','')::date;
  IF pregnancy AND (from_date IS NULL OR (to_date IS NOT NULL AND to_date<from_date)) THEN RAISE EXCEPTION 'pregnancy effective dates are invalid' USING ERRCODE='22023'; END IF;
  RETURN age_years<18;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_assert_profiling_payload(p_payload jsonb,p_cycle_id uuid,p_sitio_id uuid,p_as_of date)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $function$
DECLARE household jsonb; resident jsonb; minor boolean;
BEGIN
  IF NOT public.phase1_json_object_has_only(p_payload,ARRAY['cycle_id','household_row_key','participation_consent','household_consent_name','privacy_notice_version','sample_reference','household','residents','expected_version']) THEN RAISE EXCEPTION 'profiling package contains unknown fields' USING ERRCODE='22023'; END IF;
  IF p_payload->>'cycle_id' IS DISTINCT FROM p_cycle_id::text OR p_payload->>'participation_consent'<>'granted' OR coalesce(p_payload->>'sample_reference','')!~'^[A-Za-z0-9._-]{2,80}$' THEN RAISE EXCEPTION 'cycle, sample, or participation consent is invalid' USING ERRCODE='22023'; END IF;
  IF length(btrim(coalesce(p_payload->>'household_consent_name',''))) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'household consent signer is invalid' USING ERRCODE='22023'; END IF;
  household:=p_payload->'household';
  IF NOT public.phase1_json_object_has_only(household,ARRAY['sitio_id','landmark','contact_number','income_bracket','housing_condition','electricity','water_source','sanitation','internet_access','devices','hazards','needs','anonymous_nonparticipant_count']) OR household->>'sitio_id' IS DISTINCT FROM p_sitio_id::text THEN RAISE EXCEPTION 'household payload is invalid' USING ERRCODE='22023'; END IF;
  IF coalesce(household->>'income_bracket','not_stated') NOT IN('below_5000','5000_9999','10000_19999','20000_39999','40000_59999','60000_plus','not_stated')
    OR coalesce(household->>'housing_condition','not_stated') NOT IN('adequate','needs_minor_repair','needs_major_repair','temporary','not_stated')
    OR coalesce(household->>'electricity','not_stated') NOT IN('connected','shared','none','not_stated')
    OR coalesce(household->>'water_source','not_stated') NOT IN('piped','well','delivered','communal','other','not_stated')
    OR coalesce(household->>'sanitation','not_stated') NOT IN('private_flush','shared_flush','latrine','none','not_stated')
    OR coalesce(household->>'internet_access','not_stated') NOT IN('fixed','mobile','shared','none','not_stated') THEN RAISE EXCEPTION 'household category is invalid' USING ERRCODE='22023'; END IF;
  IF NOT public.phase1_json_string_array_is_controlled(household->'devices',ARRAY['smartphone','basic_phone','tablet','laptop','desktop','television','radio'],7)
    OR NOT public.phase1_json_string_array_is_controlled(household->'hazards',ARRAY['flood','fire','landslide','extreme_heat','unsafe_structure','other'],6)
    OR NOT public.phase1_json_string_array_is_controlled(household->'needs',ARRAY['health','education','livelihood','housing','sanitation','disaster_readiness','digital_access','other'],8) THEN RAISE EXCEPTION 'household planning category is invalid' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_payload->'residents')<>'array' OR jsonb_array_length(p_payload->'residents')>100 THEN RAISE EXCEPTION 'resident roster is invalid' USING ERRCODE='22023'; END IF;
  FOR resident IN SELECT value FROM jsonb_array_elements(p_payload->'residents') LOOP minor:=public.phase1_assert_resident_payload(resident,p_as_of); END LOOP;
END;
$function$;

-- All PII tables stay RPC-only. Final guards are installed after every earlier
-- migration has enabled RLS, closing ordering gaps in prior table sweeps.
DO $phase1_final_rls_guards$
DECLARE target record;
BEGIN
  FOR target IN SELECT n.nspname schema_name,c.relname table_name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relrowsecurity IS TRUE LOOP
    IF target.table_name NOT IN('users','audit_logs') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I','phase0_active_account_guard',target.schema_name,target.table_name);
      EXECUTE format('CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.phase0_current_account_is_active())) WITH CHECK ((SELECT public.phase0_current_account_is_active()))','phase0_active_account_guard',target.schema_name,target.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I','phase1_admin_legacy_operational_guard',target.schema_name,target.table_name);
      EXECUTE format('CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role IN(''admin'',''office'',''student_org'',''department'',''paraya_officer'',''barangay_official''))) WITH CHECK (NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role IN(''admin'',''office'',''student_org'',''department'',''paraya_officer'',''barangay_official'')))','phase1_admin_legacy_operational_guard',target.schema_name,target.table_name);
    END IF;
  END LOOP;
END;
$phase1_final_rls_guards$;

ALTER TABLE public.profiling_runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiling_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiling_runtime_settings,public.profiling_lifecycle_events FROM anon,authenticated;

REVOKE ALL ON FUNCTION public.phase1_assert_profiling_runtime(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_json_object_has_only(jsonb,text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_json_string_array_is_controlled(jsonb,text[],integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_age_on(date,integer,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_assert_resident_payload(jsonb,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase1_assert_profiling_payload(jsonb,uuid,uuid,date) FROM PUBLIC,anon,authenticated;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_stage_profiling_import_v2(p_cycle_id uuid,p_sitio_id uuid,p_source_type text,p_file_hash text,p_template_version text,p_packages jsonb,p_errors jsonb,p_replaces_batch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; v_batch_id uuid; existing_status text; package jsonb; error_item jsonb; package_count integer; resident_count integer; fatal_count integer; duplicate_count integer; final_status text;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL OR cycle.status<>'collecting' THEN RAISE EXCEPTION 'cycle is not collecting' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  IF p_source_type NOT IN('xlsx','csv') OR p_file_hash!~'^[a-f0-9]{64}$' OR p_template_version<>'AGAPE-PROFILING-V1' OR jsonb_typeof(p_packages)<>'array' OR jsonb_typeof(p_errors)<>'array' THEN RAISE EXCEPTION 'invalid import metadata' USING ERRCODE='22023'; END IF;
  package_count:=jsonb_array_length(p_packages); SELECT coalesce(sum(jsonb_array_length(coalesce(value->'payload'->'residents','[]'::jsonb))),0) INTO resident_count FROM jsonb_array_elements(p_packages);
  IF package_count+resident_count>10000 THEN RAISE EXCEPTION 'import exceeds 10000 rows' USING ERRCODE='22023'; END IF;
  FOR package IN SELECT value FROM jsonb_array_elements(p_packages) LOOP
    IF NOT public.phase1_json_object_has_only(package,ARRAY['row_number','row_key','payload']) OR coalesce((package->>'row_number')::integer,0)<2 THEN RAISE EXCEPTION 'invalid staged package wrapper' USING ERRCODE='22023'; END IF;
    PERFORM public.phase1_assert_profiling_payload(package->'payload',p_cycle_id,p_sitio_id,cycle.collection_starts_on);
    IF NOT EXISTS(SELECT 1 FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND sitio_id=p_sitio_id AND sample_reference=package->'payload'->>'sample_reference') THEN RAISE EXCEPTION 'import references an unregistered sample unit' USING ERRCODE='23514'; END IF;
  END LOOP;
  SELECT id,status INTO v_batch_id,existing_status FROM public.profiling_import_batches WHERE cycle_id=p_cycle_id AND created_by=auth.uid() AND file_hash=p_file_hash FOR UPDATE;
  IF v_batch_id IS NOT NULL THEN SELECT count(*) INTO duplicate_count FROM public.profiling_duplicate_candidates WHERE batch_id=v_batch_id AND status='unresolved'; RETURN jsonb_build_object('batch_id',v_batch_id,'status',existing_status,'duplicate_count',duplicate_count,'idempotent',true); END IF;
  IF p_replaces_batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiling_import_batches WHERE id=p_replaces_batch_id AND cycle_id=p_cycle_id AND created_by=auth.uid() AND status IN('needs_correction','failed','purged')) THEN RAISE EXCEPTION 'replaced batch is unavailable' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO fatal_count FROM jsonb_array_elements(p_errors) item WHERE coalesce((item->>'fatal')::boolean,true);
  final_status:=CASE WHEN fatal_count>0 THEN 'needs_correction' ELSE 'ready' END;
  INSERT INTO public.profiling_import_batches(cycle_id,sitio_id,status,source_type,file_hash,template_version,household_row_count,resident_row_count,fatal_error_count,created_by,replaces_batch_id) VALUES(p_cycle_id,p_sitio_id,final_status,p_source_type,p_file_hash,p_template_version,package_count,resident_count,fatal_count,auth.uid(),p_replaces_batch_id) RETURNING id INTO v_batch_id;
  FOR package IN SELECT value FROM jsonb_array_elements(p_packages) LOOP INSERT INTO public.profiling_import_rows(batch_id,sheet_name,row_number,row_key,sanitized_data) VALUES(v_batch_id,'Households',(package->>'row_number')::integer,package->>'row_key',package->'payload'); END LOOP;
  FOR error_item IN SELECT value FROM jsonb_array_elements(p_errors) LOOP
    IF NOT public.phase1_json_object_has_only(error_item,ARRAY['sheet','row','field','message','fatal']) THEN RAISE EXCEPTION 'invalid import error metadata' USING ERRCODE='22023'; END IF;
    INSERT INTO public.profiling_import_errors(batch_id,sheet_name,row_number,field_name,message,is_fatal) VALUES(v_batch_id,error_item->>'sheet',nullif(error_item->>'row','')::integer,left(error_item->>'field',120),left(coalesce(error_item->>'message','Invalid row'),500),coalesce((error_item->>'fatal')::boolean,true));
  END LOOP;
  INSERT INTO public.profiling_duplicate_candidates(cycle_id,batch_id,candidate_type,left_reference,right_reference,confidence)
    SELECT p_cycle_id,v_batch_id,'household',a.row_key,b.row_key,1 FROM public.profiling_import_rows a JOIN public.profiling_import_rows b ON a.batch_id=b.batch_id AND a.id<b.id WHERE a.batch_id=v_batch_id AND nullif(a.sanitized_data->'household'->>'contact_number','') IS NOT NULL AND a.sanitized_data->'household'->>'contact_number'=b.sanitized_data->'household'->>'contact_number';
  WITH imported AS(SELECT r.row_key||'#R'||person.position::text row_reference,person.value->>'first_name' first_name,person.value->>'last_name' last_name,person.value->>'birth_date' birth_date FROM public.profiling_import_rows r CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.sanitized_data->'residents','[]'::jsonb)) WITH ORDINALITY person(value,position) WHERE r.batch_id=v_batch_id)
  INSERT INTO public.profiling_duplicate_candidates(cycle_id,batch_id,candidate_type,left_reference,right_reference,confidence,linked_entity_id)
    SELECT DISTINCT p_cycle_id,v_batch_id,'resident',i.row_reference,pr.resident_code,1,pr.id FROM imported i JOIN public.profiling_resident_versions rv ON lower(rv.profile_data->>'first_name')=lower(i.first_name) AND lower(rv.profile_data->>'last_name')=lower(i.last_name) AND nullif(rv.profile_data->>'birth_date','')=nullif(i.birth_date,'') JOIN public.profiling_submissions s ON s.id=rv.submission_id AND s.status='approved' JOIN public.profiling_cycles existing ON existing.id=s.cycle_id AND existing.barangay_id=cycle.barangay_id JOIN public.profiling_residents pr ON pr.id=rv.resident_id WHERE nullif(i.birth_date,'') IS NOT NULL;
  SELECT count(*) INTO duplicate_count FROM public.profiling_duplicate_candidates WHERE batch_id=v_batch_id AND status='unresolved';
  IF duplicate_count>0 THEN final_status:='needs_correction'; UPDATE public.profiling_import_batches SET status=final_status,updated_at=now() WHERE id=v_batch_id; END IF;
  RETURN jsonb_build_object('batch_id',v_batch_id,'status',final_status,'duplicate_count',duplicate_count,'idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_commit_profiling_import(p_batch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.profiling_import_batches%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; staged record; submission_id uuid; committed integer:=0;
BEGIN
  SELECT * INTO batch FROM public.profiling_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF batch.id IS NULL THEN RAISE EXCEPTION 'batch not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=batch.cycle_id FOR UPDATE;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,batch.sitio_id);
  IF batch.status='committed' THEN RETURN (SELECT count(*)::integer FROM public.profiling_submissions WHERE import_batch_id=p_batch_id); END IF;
  IF batch.status<>'ready' OR EXISTS(SELECT 1 FROM public.profiling_import_errors WHERE batch_id=p_batch_id AND is_fatal AND resolved_at IS NULL) OR EXISTS(SELECT 1 FROM public.profiling_duplicate_candidates WHERE batch_id=p_batch_id AND status='unresolved') THEN RAISE EXCEPTION 'batch is not ready' USING ERRCODE='23514'; END IF;
  FOR staged IN SELECT * FROM public.profiling_import_rows WHERE batch_id=p_batch_id AND sheet_name='Households' AND excluded=false ORDER BY row_number FOR UPDATE LOOP
    submission_id:=public.phase1_create_profiling_submission(batch.cycle_id,batch.sitio_id,staged.sanitized_data,batch.source_type,batch.id);
    PERFORM public.phase1_submit_profiling_package(submission_id,1); committed:=committed+1;
  END LOOP;
  DELETE FROM public.profiling_import_errors WHERE batch_id=p_batch_id;
  DELETE FROM public.profiling_duplicate_candidates WHERE batch_id=p_batch_id;
  UPDATE public.profiling_import_rows SET sanitized_data=NULL,row_key=NULL WHERE batch_id=p_batch_id;
  UPDATE public.profiling_import_batches SET status='committed',committed_at=now(),committed_by=auth.uid(),purged_at=now(),updated_at=now() WHERE id=p_batch_id;
  INSERT INTO public.profiling_events(cycle_id,event_type,metadata,actor_id) VALUES(batch.cycle_id,'import_committed',jsonb_build_object('batch_id',batch.id,'packages',committed,'staging_purged',true),auth.uid());
  RETURN committed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_resolve_profiling_duplicate_v2(p_candidate_id uuid,p_resolution text,p_reason text,p_linked_entity_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE candidate public.profiling_duplicate_candidates%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; batch public.profiling_import_batches%ROWTYPE;
BEGIN
  SELECT * INTO candidate FROM public.profiling_duplicate_candidates WHERE id=p_candidate_id FOR UPDATE; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=candidate.cycle_id;
  IF candidate.id IS NULL OR candidate.status<>'unresolved' OR p_resolution NOT IN('linked','distinct','exclude') OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'duplicate decision is invalid' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_scope(CASE WHEN candidate.candidate_type='resident' THEN 'profiling.cycle.manage' ELSE 'profiling.validate' END,cycle.barangay_id,NULL);
  IF candidate.batch_id IS NOT NULL THEN SELECT * INTO batch FROM public.profiling_import_batches WHERE id=candidate.batch_id FOR UPDATE; END IF;
  IF p_resolution='linked' THEN
    IF candidate.candidate_type='resident' AND NOT EXISTS(SELECT 1 FROM public.profiling_residents WHERE id=coalesce(p_linked_entity_id,candidate.linked_entity_id) AND barangay_id=cycle.barangay_id) THEN RAISE EXCEPTION 'linked resident is invalid' USING ERRCODE='23514'; END IF;
    IF candidate.candidate_type='household' AND NOT EXISTS(SELECT 1 FROM public.profiling_households WHERE id=coalesce(p_linked_entity_id,candidate.linked_entity_id) AND barangay_id=cycle.barangay_id) THEN RAISE EXCEPTION 'linked household is invalid' USING ERRCODE='23514'; END IF;
    IF candidate.candidate_type='resident' THEN
      UPDATE public.profiling_import_rows r SET sanitized_data=jsonb_set(r.sanitized_data,ARRAY['residents',(split_part(candidate.left_reference,'#R',2)::integer-1)::text],(r.sanitized_data->'residents'->(split_part(candidate.left_reference,'#R',2)::integer-1))||jsonb_build_object('resident_id',coalesce(p_linked_entity_id,candidate.linked_entity_id))) WHERE r.batch_id=candidate.batch_id AND r.row_key=split_part(candidate.left_reference,'#R',1);
      IF NOT FOUND THEN RAISE EXCEPTION 'staged resident reference is invalid' USING ERRCODE='P0002'; END IF;
    ELSE
      UPDATE public.profiling_sample_units su SET household_id=coalesce(p_linked_entity_id,candidate.linked_entity_id),row_version=row_version+1,updated_at=now() FROM public.profiling_import_rows r WHERE r.batch_id=candidate.batch_id AND r.row_key=candidate.left_reference AND su.cycle_id=candidate.cycle_id AND su.sample_reference=r.sanitized_data->>'sample_reference';
      IF NOT FOUND THEN RAISE EXCEPTION 'staged household reference is invalid' USING ERRCODE='P0002'; END IF;
    END IF;
  END IF;
  UPDATE public.profiling_duplicate_candidates SET status=p_resolution,resolution_reason=btrim(p_reason),linked_entity_id=CASE WHEN p_resolution='linked' THEN coalesce(p_linked_entity_id,linked_entity_id) END,resolved_at=now(),resolved_by=auth.uid() WHERE id=candidate.id;
  IF p_resolution='exclude' AND candidate.batch_id IS NOT NULL THEN UPDATE public.profiling_import_rows SET excluded=true WHERE batch_id=candidate.batch_id AND row_key=split_part(candidate.left_reference,'#R',1); END IF;
  IF candidate.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiling_duplicate_candidates WHERE batch_id=candidate.batch_id AND status='unresolved') AND NOT EXISTS(SELECT 1 FROM public.profiling_import_errors WHERE batch_id=candidate.batch_id AND is_fatal AND resolved_at IS NULL) THEN UPDATE public.profiling_import_batches SET status='ready',updated_at=now() WHERE id=candidate.batch_id AND status='needs_correction'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_get_import_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE batch public.profiling_import_batches%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; rows jsonb; errors jsonb; duplicates jsonb;
BEGIN
  SELECT * INTO batch FROM public.profiling_import_batches WHERE id=p_batch_id; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=batch.cycle_id;
  IF batch.id IS NULL THEN RAISE EXCEPTION 'batch not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,batch.sitio_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('rowNumber',row_number,'rowKey',row_key,'excluded',excluded,'package',sanitized_data) ORDER BY row_number),'[]'::jsonb) INTO rows FROM public.profiling_import_rows WHERE batch_id=p_batch_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sheet',sheet_name,'row',row_number,'field',field_name,'message',message,'fatal',is_fatal) ORDER BY row_number,id),'[]'::jsonb) INTO errors FROM public.profiling_import_errors WHERE batch_id=p_batch_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'type',candidate_type,'left',left_reference,'right',right_reference,'confidence',confidence,'status',status,'reason',resolution_reason,'linkedEntityId',linked_entity_id) ORDER BY created_at),'[]'::jsonb) INTO duplicates FROM public.profiling_duplicate_candidates WHERE batch_id=p_batch_id;
  RETURN jsonb_build_object('id',batch.id,'status',batch.status,'sourceType',batch.source_type,'templateVersion',batch.template_version,'householdRows',batch.household_row_count,'residentRows',batch.resident_row_count,'fatalErrors',batch.fatal_error_count,'rows',rows,'errors',errors,'duplicates',duplicates,'replacesBatchId',batch.replaces_batch_id,'purgedAt',batch.purged_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_purge_expired_import_staging()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE affected bigint; target_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id),'{}') INTO target_ids FROM public.profiling_import_batches WHERE status='committed' OR staging_purge_after<=now();
  UPDATE public.profiling_import_rows SET sanitized_data=NULL,row_key=NULL WHERE batch_id=ANY(target_ids) AND (sanitized_data IS NOT NULL OR row_key IS NOT NULL); GET DIAGNOSTICS affected=ROW_COUNT;
  DELETE FROM public.profiling_duplicate_candidates WHERE batch_id=ANY(target_ids); DELETE FROM public.profiling_import_errors WHERE batch_id=ANY(target_ids);
  UPDATE public.profiling_import_batches SET status=CASE WHEN status='committed' THEN status ELSE 'purged' END,purged_at=coalesce(purged_at,now()),updated_at=now() WHERE id=ANY(target_ids);
  RETURN affected;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phase1_stage_profiling_import_v2(uuid,uuid,text,text,text,jsonb,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_resolve_profiling_duplicate_v2(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_get_import_batch(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.phase1_stage_profiling_import(uuid,uuid,text,text,text,jsonb,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.phase1_resolve_profiling_duplicate(uuid,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.phase1_profile_lifecycle_action(text,uuid,integer,text,text,uuid) FROM authenticated;

COMMIT;

BEGIN;

-- New tables were enabled after the catalog-wide guard sweep above, so install
-- their deny-first guards explicitly as the final access boundary.
CREATE POLICY phase1_runtime_active_guard ON public.profiling_runtime_settings AS RESTRICTIVE FOR ALL TO authenticated
USING (public.phase0_current_account_is_active()) WITH CHECK (public.phase0_current_account_is_active());
CREATE POLICY phase1_runtime_direct_denied ON public.profiling_runtime_settings AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY phase1_lifecycle_active_guard ON public.profiling_lifecycle_events AS RESTRICTIVE FOR ALL TO authenticated
USING (public.phase0_current_account_is_active()) WITH CHECK (public.phase0_current_account_is_active());
CREATE POLICY phase1_lifecycle_direct_denied ON public.profiling_lifecycle_events AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_profiling_aggregate(p_cycle_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; threshold integer; households bigint; residents bigint; pending_count bigint; returned_count bigint; excluded_count bigint; duplicate_count bigint; registered_count bigint; participating_count bigint; coverage numeric; response_rate numeric; sex_cells jsonb; official public.official_population_snapshots%ROWTYPE; evidence_id uuid; small_count integer; visible_count integer; peer_key text;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read',cycle.barangay_id,NULL);
  SELECT suppression_threshold INTO threshold FROM public.profiling_privacy_settings WHERE id=true;
  SELECT count(*),count(*) FILTER(WHERE contact_outcome='participated'),count(*) FILTER(WHERE contact_outcome IN('refused','unavailable','ineligible')) INTO registered_count,participating_count,excluded_count FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id;
  SELECT count(DISTINCT s.household_id) INTO households FROM public.profiling_submissions s
    WHERE s.cycle_id=p_cycle_id AND s.status='approved' AND NOT EXISTS(SELECT 1 FROM public.profiling_lifecycle_events e WHERE e.entity_type='household' AND e.entity_id=s.household_id AND e.action IN('moved','dissolved','merged') AND e.effective_on<=cycle.collection_ends_on);
  SELECT count(DISTINCT rv.resident_id) INTO residents FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id
    WHERE s.cycle_id=p_cycle_id AND s.status='approved'
      AND EXISTS(SELECT 1 FROM public.profiling_household_memberships m WHERE m.resident_id=rv.resident_id AND m.household_id=s.household_id AND m.effective_from<=cycle.collection_ends_on AND (m.effective_to IS NULL OR m.effective_to>=cycle.collection_ends_on))
      AND NOT EXISTS(SELECT 1 FROM public.profiling_lifecycle_events e WHERE e.entity_type='resident' AND e.entity_id=rv.resident_id AND e.action IN('inactive','deceased','merged') AND e.effective_on<=cycle.collection_ends_on)
      AND NOT EXISTS(SELECT 1 FROM public.profiling_lifecycle_events e WHERE e.entity_type='consent' AND e.entity_id=rv.resident_id AND e.action='withdrawn' AND e.effective_on<=cycle.collection_ends_on);
  SELECT count(*) FILTER(WHERE status='pending'),count(*) FILTER(WHERE status='returned') INTO pending_count,returned_count FROM public.profiling_submissions WHERE cycle_id=p_cycle_id;
  SELECT count(*) INTO duplicate_count FROM public.profiling_duplicate_candidates WHERE cycle_id=p_cycle_id AND status='unresolved';
  coverage:=CASE WHEN cycle.target_households>0 THEN round(households::numeric/cycle.target_households*100,2) END;
  response_rate:=CASE WHEN registered_count>0 THEN round(participating_count::numeric/registered_count*100,2) END;
  SELECT * INTO official FROM public.official_population_snapshots WHERE barangay_id=cycle.barangay_id AND verified_at IS NOT NULL AND as_of_date<=cycle.collection_ends_on ORDER BY as_of_date DESC,verified_at DESC LIMIT 1;
  SELECT id INTO evidence_id FROM public.profiling_evidence_snapshots WHERE cycle_id=p_cycle_id AND aggregate_schema_version='agape.profiling.aggregate.v2' ORDER BY generated_at DESC LIMIT 1;

  WITH effective_residents AS (
    SELECT DISTINCT ON(rv.resident_id) rv.resident_id,coalesce(rv.profile_data->>'sex','not_stated') key
    FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id
    WHERE s.cycle_id=p_cycle_id AND s.status='approved'
      AND EXISTS(SELECT 1 FROM public.profiling_household_memberships m WHERE m.resident_id=rv.resident_id AND m.household_id=s.household_id AND m.effective_from<=cycle.collection_ends_on AND (m.effective_to IS NULL OR m.effective_to>=cycle.collection_ends_on))
      AND NOT EXISTS(SELECT 1 FROM public.profiling_lifecycle_events e WHERE e.entity_type='resident' AND e.entity_id=rv.resident_id AND e.action IN('inactive','deceased','merged') AND e.effective_on<=cycle.collection_ends_on)
      AND NOT EXISTS(SELECT 1 FROM public.profiling_lifecycle_events e WHERE e.entity_type='consent' AND e.entity_id=rv.resident_id AND e.action='withdrawn' AND e.effective_on<=cycle.collection_ends_on)
    ORDER BY rv.resident_id,rv.version DESC
  ), counts AS (SELECT key,count(*) total FROM effective_residents GROUP BY key)
  SELECT count(*) FILTER(WHERE total BETWEEN 1 AND threshold-1),count(*) FILTER(WHERE total>=threshold) INTO small_count,visible_count FROM counts;

  IF small_count=1 AND visible_count=0 THEN sex_cells:='[]'::jsonb;
  ELSE
    WITH effective_residents AS (
      SELECT DISTINCT ON(rv.resident_id) rv.resident_id,coalesce(rv.profile_data->>'sex','not_stated') key
      FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id
      WHERE s.cycle_id=p_cycle_id AND s.status='approved'
        AND EXISTS(SELECT 1 FROM public.profiling_household_memberships m WHERE m.resident_id=rv.resident_id AND m.household_id=s.household_id AND m.effective_from<=cycle.collection_ends_on AND (m.effective_to IS NULL OR m.effective_to>=cycle.collection_ends_on))
        AND NOT EXISTS(SELECT 1 FROM public.profiling_lifecycle_events e WHERE e.entity_type IN('resident','consent') AND e.entity_id=rv.resident_id AND e.action IN('inactive','deceased','merged','withdrawn') AND e.effective_on<=cycle.collection_ends_on)
      ORDER BY rv.resident_id,rv.version DESC
    ), counts AS (SELECT key,count(*) total FROM effective_residents GROUP BY key)
    SELECT key INTO peer_key FROM counts WHERE small_count=1 AND total>=threshold ORDER BY total,key LIMIT 1;
    WITH effective_residents AS (
      SELECT DISTINCT ON(rv.resident_id) rv.resident_id,coalesce(rv.profile_data->>'sex','not_stated') key
      FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id
      WHERE s.cycle_id=p_cycle_id AND s.status='approved'
        AND EXISTS(SELECT 1 FROM public.profiling_household_memberships m WHERE m.resident_id=rv.resident_id AND m.household_id=s.household_id AND m.effective_from<=cycle.collection_ends_on AND (m.effective_to IS NULL OR m.effective_to>=cycle.collection_ends_on))
        AND NOT EXISTS(SELECT 1 FROM public.profiling_lifecycle_events e WHERE e.entity_type IN('resident','consent') AND e.entity_id=rv.resident_id AND e.action IN('inactive','deceased','merged','withdrawn') AND e.effective_on<=cycle.collection_ends_on)
      ORDER BY rv.resident_id,rv.version DESC
    ), counts AS (SELECT key,count(*) total FROM effective_residents GROUP BY key)
    SELECT coalesce(jsonb_agg(jsonb_build_object('dimension','sex','key',key,'count',CASE WHEN total BETWEEN 1 AND threshold-1 THEN public.phase1_suppressed_count(total,threshold) WHEN key=peer_key THEN jsonb_build_object('suppressed',true,'value',NULL,'label','suppressed') ELSE public.phase1_suppressed_count(total,threshold) END) ORDER BY key),'[]'::jsonb) INTO sex_cells FROM counts;
  END IF;

  RETURN jsonb_build_object('schemaVersion','agape.profiling.aggregate.v2','cycle',jsonb_build_object('id',cycle.id,'name',cycle.name,'status',cycle.status,'reportingDate',cycle.collection_ends_on),
    'sample',jsonb_build_object('method',cycle.sample_method,'targetHouseholds',cycle.target_households,'registeredHouseholds',registered_count,'participatingHouseholds',participating_count,'approvedHouseholds',households,'approvedResidents',residents,'coveragePercent',coverage,'responseRatePercent',response_rate),
    'source',jsonb_build_object('kind','approved_sample','legacyExcluded',true,'evidenceSnapshotId',evidence_id),
    'official',jsonb_build_object('totalPopulation',official.total_population,'totalHouseholds',official.total_households,'sourceName',official.source_name,'asOfDate',official.as_of_date,'verified',official.id IS NOT NULL),
    'asOf',clock_timestamp(),'privacy',jsonb_build_object('suppressionThreshold',threshold,'complementarySuppression',true),
    'dataQuality',jsonb_build_object('pendingPackages',pending_count,'returnedPackages',returned_count,'excludedPackages',excluded_count,'unresolvedDuplicates',duplicate_count),'cells',sex_cells);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_transition_profiling_cycle(p_cycle_id uuid,p_expected_version integer,p_to_status text,p_reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; allowed boolean; new_version integer; aggregate jsonb; digest_text text;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',cycle.barangay_id,NULL);
  IF cycle.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale cycle version' USING ERRCODE='40001'; END IF;
  allowed:=(cycle.status='draft' AND p_to_status='collecting') OR (cycle.status='collecting' AND p_to_status='validating') OR (cycle.status='validating' AND p_to_status='completed') OR (cycle.status='completed' AND p_to_status='archived');
  IF NOT allowed THEN RAISE EXCEPTION 'invalid cycle transition' USING ERRCODE='22023'; END IF;
  IF p_to_status='collecting' AND (NOT EXISTS(SELECT 1 FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id) OR NOT EXISTS(SELECT 1 FROM public.barangay_sitios WHERE barangay_id=cycle.barangay_id AND is_active) OR (SELECT profile_code_prefix FROM public.barangays WHERE id=cycle.barangay_id) IS NULL) THEN RAISE EXCEPTION 'cycle setup is incomplete' USING ERRCODE='23514'; END IF;
  IF p_to_status='completed' AND (EXISTS(SELECT 1 FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND status IN('draft','pending','returned')) OR EXISTS(SELECT 1 FROM public.profiling_duplicate_candidates WHERE cycle_id=p_cycle_id AND status='unresolved')) THEN RAISE EXCEPTION 'all packages and duplicates must be resolved' USING ERRCODE='23514'; END IF;
  UPDATE public.profiling_cycles SET status=p_to_status,row_version=row_version+1,updated_at=now(),completed_at=CASE WHEN p_to_status='completed' THEN now() ELSE completed_at END,completed_by=CASE WHEN p_to_status='completed' THEN auth.uid() ELSE completed_by END WHERE id=p_cycle_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,event_type,from_status,to_status,reason,actor_id) VALUES(p_cycle_id,'cycle_transition',cycle.status,p_to_status,nullif(btrim(p_reason),''),auth.uid());
  IF p_to_status='completed' THEN
    aggregate:=public.phase1_profiling_aggregate(p_cycle_id); digest_text:=encode(digest(convert_to(aggregate::text,'UTF8'),'sha256'),'hex');
    INSERT INTO public.profiling_evidence_snapshots(cycle_id,generated_by,aggregate_schema_version,aggregate_data,content_hash) VALUES(p_cycle_id,auth.uid(),'agape.profiling.aggregate.v2',aggregate,digest_text) ON CONFLICT(cycle_id,content_hash) DO NOTHING;
  END IF;
  RETURN new_version;
END;
$function$;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_revise_returned_profiling_submission(p_submission_id uuid,p_expected_version integer,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE previous public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; new_submission uuid; resident uuid; item jsonb; minor boolean; version_no integer;
BEGIN
  SELECT * INTO previous FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=previous.cycle_id FOR UPDATE;
  IF previous.id IS NULL OR previous.status<>'returned' OR previous.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or invalid returned package' USING ERRCODE='40001'; END IF;
  IF cycle.status NOT IN('collecting','validating') THEN RAISE EXCEPTION 'cycle does not accept corrections' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,previous.sitio_id);
  IF EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='barangay_mother_leader') AND previous.created_by<>auth.uid() THEN RAISE EXCEPTION 'Mother Leaders may revise only their own assigned-sitio packages' USING ERRCODE='42501'; END IF;
  PERFORM public.phase1_assert_profiling_payload(p_payload,cycle.id,previous.sitio_id,cycle.collection_starts_on);
  IF NOT EXISTS(SELECT 1 FROM public.profiling_sample_units WHERE id=previous.sample_unit_id AND sample_reference=p_payload->>'sample_reference') THEN RAISE EXCEPTION 'sample reference cannot change during correction' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiling_resident_versions old WHERE old.submission_id=previous.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'residents') supplied WHERE nullif(supplied->>'resident_id','')::uuid=old.resident_id)) THEN RAISE EXCEPTION 'existing residents cannot be omitted; use a lifecycle correction' USING ERRCODE='23514'; END IF;
  UPDATE public.profiling_submissions SET status='superseded',row_version=row_version+1,updated_at=now() WHERE id=previous.id;
  INSERT INTO public.profiling_submissions(cycle_id,sample_unit_id,household_id,sitio_id,status,submission_version,source_type,household_data,anonymous_nonparticipant_count,created_by,supersedes_submission_id)
  VALUES(previous.cycle_id,previous.sample_unit_id,previous.household_id,previous.sitio_id,'draft',previous.submission_version+1,'manual',p_payload->'household',coalesce((p_payload->'household'->>'anonymous_nonparticipant_count')::integer,0),auth.uid(),previous.id) RETURNING id INTO new_submission;
  INSERT INTO public.profiling_consents(submission_id,subject_type,status,privacy_notice_id,consented_by_name,effective_from,recorded_by) VALUES(new_submission,'household','granted',cycle.privacy_notice_id,btrim(p_payload->>'household_consent_name'),cycle.collection_starts_on,auth.uid());
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'residents') LOOP
    minor:=public.phase1_assert_resident_payload(item,cycle.collection_starts_on); resident:=nullif(item->>'resident_id','')::uuid;
    IF resident IS NULL THEN
      INSERT INTO public.profiling_residents(barangay_id,resident_code) VALUES(cycle.barangay_id,public.phase1_next_profile_code(cycle.barangay_id,'resident')) RETURNING id INTO resident;
      INSERT INTO public.profiling_household_memberships(household_id,resident_id,effective_from,reason,created_by) VALUES(previous.household_id,resident,cycle.collection_starts_on,'validated new household member',auth.uid());
    ELSIF NOT EXISTS(SELECT 1 FROM public.profiling_household_memberships WHERE resident_id=resident AND household_id=previous.household_id AND effective_from<=cycle.collection_starts_on AND (effective_to IS NULL OR effective_to>=cycle.collection_starts_on)) THEN RAISE EXCEPTION 'resident does not belong to the household' USING ERRCODE='23514'; END IF;
    SELECT coalesce(max(version),0)+1 INTO version_no FROM public.profiling_resident_versions WHERE resident_id=resident;
    INSERT INTO public.profiling_resident_versions(submission_id,resident_id,profile_data,is_minor,relationship_to_head,is_household_head,version) VALUES(new_submission,resident,item-ARRAY['resident_id','consent_status','guardian_name','guardian_relationship','household_row_key'],minor,item->>'relationship_to_head',(item->>'relationship_to_head')='household_head',version_no);
    INSERT INTO public.profiling_consents(submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,guardian_relationship,effective_from,recorded_by) VALUES(new_submission,CASE WHEN minor THEN 'guardian' ELSE 'adult' END,resident,'granted',cycle.privacy_notice_id,CASE WHEN minor THEN item->>'guardian_name' ELSE concat_ws(' ',item->>'first_name',item->>'last_name') END,CASE WHEN minor THEN item->>'guardian_relationship' END,cycle.collection_starts_on,auth.uid());
  END LOOP;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,metadata,actor_id) VALUES(previous.cycle_id,new_submission,previous.household_id,'submission_revised','returned','draft',jsonb_build_object('supersedes',previous.id),auth.uid());
  RETURN new_submission;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_begin_profiling_revision(p_cycle_id uuid,p_sample_reference text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; sample public.profiling_sample_units%ROWTYPE; previous public.profiling_submissions%ROWTYPE; residents jsonb; actor public.users%ROWTYPE;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id; SELECT * INTO sample FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND sample_reference=p_sample_reference; SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF cycle.id IS NULL OR sample.id IS NULL OR sample.household_id IS NULL OR cycle.status<>'collecting' THEN RAISE EXCEPTION 'reprofile source is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,sample.sitio_id);
  SELECT s.* INTO previous FROM public.profiling_submissions s JOIN public.profiling_cycles c ON c.id=s.cycle_id WHERE s.household_id=sample.household_id AND s.status='approved' AND c.collection_ends_on<cycle.collection_starts_on ORDER BY c.collection_ends_on DESC,s.submission_version DESC LIMIT 1;
  IF previous.id IS NULL THEN RAISE EXCEPTION 'no approved prior-cycle profile exists' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(jsonb_agg(rv.profile_data||jsonb_build_object('resident_id',rv.resident_id,'consent_status','granted') ORDER BY rv.is_household_head DESC,rv.created_at),'[]'::jsonb) INTO residents FROM public.profiling_resident_versions rv WHERE rv.submission_id=previous.id;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata) VALUES(actor.id,actor.email,'Resident reprofile seed viewed','profiling_households',sample.household_id::text,'warning',jsonb_build_object('cycle_id',cycle.id,'previous_submission_id',previous.id));
  RETURN jsonb_build_object('cycle_id',cycle.id,'sample_reference',sample.sample_reference,'household_row_key',sample.sample_reference,'household',previous.household_data,'residents',residents,'previous_submission_id',previous.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_apply_profile_lifecycle_action(p_action text,p_entity_id uuid,p_expected_version integer,p_effective_on date,p_reason text,p_target_entity_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE resident public.profiling_residents%ROWTYPE; household public.profiling_households%ROWTYPE; target_household public.profiling_households%ROWTYPE; target_resident public.profiling_residents%ROWTYPE; membership public.profiling_household_memberships%ROWTYPE; new_version integer; latest_submission public.profiling_submissions%ROWTYPE;
BEGIN
  IF p_effective_on IS NULL OR p_effective_on>current_date OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'effective date and reason are required' USING ERRCODE='22023'; END IF;
  IF p_action IN('resident_inactive','resident_deceased','resident_transfer','resident_merge','consent_withdrawal') THEN
    SELECT * INTO resident FROM public.profiling_residents WHERE id=p_entity_id FOR UPDATE;
    IF resident.id IS NULL OR resident.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale resident version' USING ERRCODE='40001'; END IF;
    PERFORM public.phase1_assert_profiling_runtime(resident.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',resident.barangay_id,NULL);
    SELECT * INTO membership FROM public.profiling_household_memberships WHERE resident_id=resident.id AND effective_from<=p_effective_on AND (effective_to IS NULL OR effective_to>=p_effective_on) ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
    IF p_action='resident_transfer' THEN
      SELECT * INTO target_household FROM public.profiling_households WHERE id=p_target_entity_id FOR UPDATE;
      IF membership.id IS NULL OR target_household.id IS NULL OR target_household.barangay_id<>resident.barangay_id OR target_household.lifecycle_status<>'active' OR target_household.id=membership.household_id THEN RAISE EXCEPTION 'transfer target is invalid' USING ERRCODE='23514'; END IF;
      UPDATE public.profiling_household_memberships SET effective_to=greatest(effective_from,p_effective_on-1),reason=btrim(p_reason) WHERE id=membership.id;
      INSERT INTO public.profiling_household_memberships(household_id,resident_id,effective_from,reason,created_by) VALUES(target_household.id,resident.id,p_effective_on,btrim(p_reason),auth.uid());
      UPDATE public.profiling_residents SET row_version=row_version+1,updated_at=now() WHERE id=resident.id RETURNING row_version INTO new_version;
    ELSIF p_action='resident_merge' THEN
      SELECT * INTO target_resident FROM public.profiling_residents WHERE id=p_target_entity_id FOR UPDATE;
      IF target_resident.id IS NULL OR target_resident.id=resident.id OR target_resident.barangay_id<>resident.barangay_id OR target_resident.lifecycle_status<>'active' THEN RAISE EXCEPTION 'resident merge target is invalid' USING ERRCODE='23514'; END IF;
      IF membership.id IS NOT NULL THEN UPDATE public.profiling_household_memberships SET effective_to=greatest(effective_from,p_effective_on-1),reason=btrim(p_reason) WHERE id=membership.id; END IF;
      UPDATE public.profiling_residents SET lifecycle_status='merged',merged_into_id=target_resident.id,row_version=row_version+1,updated_at=now() WHERE id=resident.id RETURNING row_version INTO new_version;
    ELSIF p_action='consent_withdrawal' THEN
      SELECT s.* INTO latest_submission FROM public.profiling_resident_versions rv JOIN public.profiling_submissions s ON s.id=rv.submission_id WHERE rv.resident_id=resident.id ORDER BY s.created_at DESC LIMIT 1;
      IF latest_submission.id IS NULL THEN RAISE EXCEPTION 'resident has no profile consent' USING ERRCODE='P0002'; END IF;
      INSERT INTO public.profiling_consents(submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,effective_from,withdrawal_reason,recorded_by) VALUES(latest_submission.id,'adult',resident.id,'withdrawn',(SELECT privacy_notice_id FROM public.profiling_cycles WHERE id=latest_submission.cycle_id),'WITHDRAWN',p_effective_on,btrim(p_reason),auth.uid());
      UPDATE public.profiling_residents SET row_version=row_version+1,updated_at=now() WHERE id=resident.id RETURNING row_version INTO new_version;
    ELSE
      IF membership.id IS NOT NULL THEN UPDATE public.profiling_household_memberships SET effective_to=greatest(effective_from,p_effective_on-1),reason=btrim(p_reason) WHERE id=membership.id; END IF;
      UPDATE public.profiling_residents SET lifecycle_status=CASE WHEN p_action='resident_deceased' THEN 'deceased' ELSE 'inactive' END,row_version=row_version+1,updated_at=now() WHERE id=resident.id RETURNING row_version INTO new_version;
    END IF;
    INSERT INTO public.profiling_lifecycle_events(entity_type,entity_id,action,effective_on,from_status,to_status,target_entity_id,reason,actor_id) VALUES(CASE WHEN p_action='consent_withdrawal' THEN 'consent' ELSE 'resident' END,resident.id,CASE p_action WHEN 'resident_inactive' THEN 'inactive' WHEN 'resident_deceased' THEN 'deceased' WHEN 'resident_transfer' THEN 'transfer' WHEN 'resident_merge' THEN 'merged' ELSE 'withdrawn' END,p_effective_on,resident.lifecycle_status,CASE p_action WHEN 'resident_deceased' THEN 'deceased' WHEN 'resident_merge' THEN 'merged' WHEN 'resident_inactive' THEN 'inactive' ELSE resident.lifecycle_status END,p_target_entity_id,btrim(p_reason),auth.uid());
  ELSIF p_action IN('household_moved','household_dissolved','household_merge') THEN
    SELECT * INTO household FROM public.profiling_households WHERE id=p_entity_id FOR UPDATE;
    IF household.id IS NULL OR household.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale household version' USING ERRCODE='40001'; END IF;
    PERFORM public.phase1_assert_profiling_runtime(household.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',household.barangay_id,NULL);
    IF p_action='household_merge' THEN SELECT * INTO target_household FROM public.profiling_households WHERE id=p_target_entity_id FOR UPDATE; IF target_household.id IS NULL OR target_household.id=household.id OR target_household.barangay_id<>household.barangay_id OR target_household.lifecycle_status<>'active' THEN RAISE EXCEPTION 'household merge target is invalid' USING ERRCODE='23514'; END IF; END IF;
    FOR membership IN SELECT * FROM public.profiling_household_memberships WHERE household_id=household.id AND effective_from<=p_effective_on AND (effective_to IS NULL OR effective_to>=p_effective_on) FOR UPDATE LOOP
      UPDATE public.profiling_household_memberships SET effective_to=greatest(effective_from,p_effective_on-1),reason=btrim(p_reason) WHERE id=membership.id;
      IF p_action='household_merge' AND NOT EXISTS(SELECT 1 FROM public.profiling_household_memberships WHERE resident_id=membership.resident_id AND household_id=target_household.id AND effective_to IS NULL) THEN INSERT INTO public.profiling_household_memberships(household_id,resident_id,effective_from,reason,created_by) VALUES(target_household.id,membership.resident_id,p_effective_on,btrim(p_reason),auth.uid()); END IF;
    END LOOP;
    UPDATE public.profiling_households SET lifecycle_status=CASE p_action WHEN 'household_moved' THEN 'moved' WHEN 'household_dissolved' THEN 'dissolved' ELSE 'merged' END,merged_into_id=CASE WHEN p_action='household_merge' THEN target_household.id END,row_version=row_version+1,updated_at=now() WHERE id=household.id RETURNING row_version INTO new_version;
    INSERT INTO public.profiling_lifecycle_events(entity_type,entity_id,action,effective_on,from_status,to_status,target_entity_id,reason,actor_id) VALUES('household',household.id,CASE p_action WHEN 'household_moved' THEN 'moved' WHEN 'household_dissolved' THEN 'dissolved' ELSE 'merged' END,p_effective_on,household.lifecycle_status,CASE p_action WHEN 'household_moved' THEN 'moved' WHEN 'household_dissolved' THEN 'dissolved' ELSE 'merged' END,p_target_entity_id,btrim(p_reason),auth.uid());
  ELSE RAISE EXCEPTION 'invalid lifecycle action' USING ERRCODE='22023'; END IF;
  RETURN new_version;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phase1_begin_profiling_revision(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_apply_profile_lifecycle_action(text,uuid,integer,date,text,uuid) TO authenticated;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_list_sample_units(p_cycle_id uuid,p_sitio_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; actor public.users%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id; SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'cycle not found' USING ERRCODE='P0002'; END IF;
  IF actor.role='barangay_mother_leader' THEN PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  ELSE PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',cycle.barangay_id,NULL); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'sitioId',u.sitio_id,'sampleReference',u.sample_reference,'contactOutcome',u.contact_outcome,'anonymousHouseholdSize',u.anonymous_household_size,'householdId',u.household_id,'replacementOfId',u.replacement_of_id,'replacementReason',u.replacement_reason,'rowVersion',u.row_version) ORDER BY u.sample_reference),'[]'::jsonb) INTO result
  FROM public.profiling_sample_units u WHERE u.cycle_id=p_cycle_id AND (p_sitio_id IS NULL OR u.sitio_id=p_sitio_id)
    AND (actor.role<>'barangay_mother_leader' OR EXISTS(SELECT 1 FROM public.mother_leader_sitio_assignments a WHERE a.mother_leader_id=actor.id AND a.sitio_id=u.sitio_id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)));
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_record_sample_outcome(p_cycle_id uuid,p_sitio_id uuid,p_sample_reference text,p_contact_outcome text,p_anonymous_household_size integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; sample public.profiling_sample_units%ROWTYPE;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR SHARE;
  IF cycle.id IS NULL OR cycle.status<>'collecting' THEN RAISE EXCEPTION 'cycle is not collecting' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  IF p_contact_outcome NOT IN('unavailable','refused','ineligible','participated') OR p_anonymous_household_size IS NOT NULL AND p_anonymous_household_size NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'invalid sample outcome' USING ERRCODE='22023'; END IF;
  SELECT * INTO sample FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND sitio_id=p_sitio_id AND sample_reference=p_sample_reference FOR UPDATE;
  IF sample.id IS NULL OR sample.contact_outcome='participated' OR sample.replacement_of_id IS NOT NULL AND sample.contact_outcome='ineligible' THEN RAISE EXCEPTION 'sample unit is unavailable' USING ERRCODE='23514'; END IF;
  UPDATE public.profiling_sample_units SET contact_outcome=p_contact_outcome,anonymous_household_size=CASE WHEN p_contact_outcome IN('refused','unavailable') THEN p_anonymous_household_size ELSE NULL END,refusal_recorded_at=CASE WHEN p_contact_outcome='refused' THEN now() ELSE NULL END,row_version=row_version+1,updated_at=now() WHERE id=sample.id;
  INSERT INTO public.profiling_events(cycle_id,event_type,metadata,actor_id) VALUES(p_cycle_id,'sample_outcome_recorded',jsonb_build_object('sample_unit_id',sample.id,'outcome',p_contact_outcome),auth.uid());
  RETURN sample.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_profiling_submission(p_cycle_id uuid,p_sitio_id uuid,p_payload jsonb,p_source_type text DEFAULT 'manual',p_import_batch_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; sample public.profiling_sample_units%ROWTYPE; household uuid; submission uuid; resident uuid; item jsonb; minor boolean; version_no integer; submission_no integer; prior_approved uuid; notice_version text;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL OR cycle.status<>'collecting' THEN RAISE EXCEPTION 'cycle is not collecting' USING ERRCODE='23514'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,p_sitio_id);
  IF p_source_type NOT IN('manual','xlsx','csv') THEN RAISE EXCEPTION 'invalid source type' USING ERRCODE='22023'; END IF;
  PERFORM public.phase1_assert_profiling_payload(p_payload,p_cycle_id,p_sitio_id,cycle.collection_starts_on);
  SELECT version INTO notice_version FROM public.profiling_privacy_notices WHERE id=cycle.privacy_notice_id AND retired_at IS NULL;
  IF notice_version IS NULL OR p_payload->>'privacy_notice_version' IS DISTINCT FROM notice_version THEN RAISE EXCEPTION 'active privacy notice version mismatch' USING ERRCODE='23514'; END IF;
  SELECT * INTO sample FROM public.profiling_sample_units WHERE cycle_id=p_cycle_id AND sitio_id=p_sitio_id AND sample_reference=p_payload->>'sample_reference' FOR UPDATE;
  IF sample.id IS NULL OR sample.contact_outcome NOT IN('not_contacted','unavailable','participated') THEN RAISE EXCEPTION 'registered sample unit is unavailable' USING ERRCODE='23514'; END IF;
  household:=sample.household_id;
  IF household IS NULL THEN
    INSERT INTO public.profiling_households(barangay_id,sitio_id,household_code) VALUES(cycle.barangay_id,p_sitio_id,public.phase1_next_profile_code(cycle.barangay_id,'household')) RETURNING id INTO household;
    UPDATE public.profiling_sample_units SET household_id=household,row_version=row_version+1,updated_at=now() WHERE id=sample.id;
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiling_households WHERE id=household AND barangay_id=cycle.barangay_id AND lifecycle_status='active') THEN RAISE EXCEPTION 'linked household is inactive' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND household_id=household AND status IN('draft','pending','returned')) THEN RAISE EXCEPTION 'an unresolved package already exists for this household' USING ERRCODE='23505'; END IF;
  SELECT id INTO prior_approved FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND household_id=household AND status='approved' ORDER BY submission_version DESC LIMIT 1;
  SELECT coalesce(max(submission_version),0)+1 INTO submission_no FROM public.profiling_submissions WHERE cycle_id=p_cycle_id AND household_id=household;
  INSERT INTO public.profiling_submissions(cycle_id,sample_unit_id,household_id,sitio_id,status,submission_version,source_type,import_batch_id,household_data,anonymous_nonparticipant_count,created_by,supersedes_submission_id)
  VALUES(p_cycle_id,sample.id,household,p_sitio_id,'draft',submission_no,p_source_type,p_import_batch_id,p_payload->'household',coalesce((p_payload->'household'->>'anonymous_nonparticipant_count')::integer,0),auth.uid(),prior_approved) RETURNING id INTO submission;
  INSERT INTO public.profiling_consents(submission_id,subject_type,status,privacy_notice_id,consented_by_name,effective_from,recorded_by) VALUES(submission,'household','granted',cycle.privacy_notice_id,btrim(p_payload->>'household_consent_name'),cycle.collection_starts_on,auth.uid());
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'residents') LOOP
    minor:=public.phase1_assert_resident_payload(item,cycle.collection_starts_on);
    resident:=nullif(item->>'resident_id','')::uuid;
    IF resident IS NULL THEN
      INSERT INTO public.profiling_residents(barangay_id,resident_code) VALUES(cycle.barangay_id,public.phase1_next_profile_code(cycle.barangay_id,'resident')) RETURNING id INTO resident;
      INSERT INTO public.profiling_household_memberships(household_id,resident_id,effective_from,reason,created_by) VALUES(household,resident,cycle.collection_starts_on,'initial sampled household roster',auth.uid());
    ELSIF NOT EXISTS(SELECT 1 FROM public.profiling_residents r JOIN public.profiling_household_memberships m ON m.resident_id=r.id WHERE r.id=resident AND r.barangay_id=cycle.barangay_id AND m.household_id=household AND m.effective_from<=cycle.collection_starts_on AND (m.effective_to IS NULL OR m.effective_to>=cycle.collection_starts_on)) THEN RAISE EXCEPTION 'resident identity is not linked to the selected household' USING ERRCODE='23514'; END IF;
    SELECT coalesce(max(rv.version),0)+1 INTO version_no FROM public.profiling_resident_versions rv WHERE rv.resident_id=resident;
    INSERT INTO public.profiling_resident_versions(submission_id,resident_id,profile_data,is_minor,relationship_to_head,is_household_head,version)
    VALUES(submission,resident,item-ARRAY['resident_id','consent_status','guardian_name','guardian_relationship','household_row_key'],minor,item->>'relationship_to_head',(item->>'relationship_to_head')='household_head',version_no);
    INSERT INTO public.profiling_consents(submission_id,subject_type,resident_id,status,privacy_notice_id,consented_by_name,guardian_relationship,effective_from,recorded_by)
    VALUES(submission,CASE WHEN minor THEN 'guardian' ELSE 'adult' END,resident,'granted',cycle.privacy_notice_id,CASE WHEN minor THEN item->>'guardian_name' ELSE concat_ws(' ',item->>'first_name',item->>'last_name') END,CASE WHEN minor THEN item->>'guardian_relationship' END,cycle.collection_starts_on,auth.uid());
  END LOOP;
  UPDATE public.profiling_sample_units SET contact_outcome='participated',row_version=row_version+1,updated_at=now() WHERE id=sample.id;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,to_status,metadata,actor_id) VALUES(p_cycle_id,submission,household,'submission_created','draft',jsonb_build_object('sample_unit_id',sample.id),auth.uid());
  RETURN submission;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_submit_profiling_package(p_submission_id uuid,p_expected_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; new_version integer;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.collect',cycle.barangay_id,submission.sitio_id);
  IF EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='barangay_mother_leader') AND submission.created_by<>auth.uid() THEN RAISE EXCEPTION 'Mother Leaders may submit only their own assigned-sitio packages' USING ERRCODE='42501'; END IF;
  IF submission.status NOT IN('draft','returned') OR submission.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or invalid submission state' USING ERRCODE='40001'; END IF;
  UPDATE public.profiling_submissions SET status='pending',submitted_at=now(),return_reason=NULL,row_version=row_version+1,updated_at=now() WHERE id=p_submission_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,actor_id) VALUES(submission.cycle_id,p_submission_id,submission.household_id,'submission_submitted',submission.status,'pending',auth.uid());
  RETURN new_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_decide_profiling_submission(p_submission_id uuid,p_expected_version integer,p_decision text,p_reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE submission public.profiling_submissions%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; next_status text; new_version integer;
BEGIN
  SELECT * INTO submission FROM public.profiling_submissions WHERE id=p_submission_id FOR UPDATE; SELECT * INTO cycle FROM public.profiling_cycles WHERE id=submission.cycle_id;
  IF submission.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id); PERFORM public.phase1_assert_profiling_scope('profiling.validate',cycle.barangay_id,submission.sitio_id);
  IF submission.status<>'pending' OR submission.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale or invalid submission state' USING ERRCODE='40001'; END IF;
  IF p_decision NOT IN('approve','return') OR p_decision='return' AND length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'invalid decision' USING ERRCODE='22023'; END IF;
  next_status:=CASE WHEN p_decision='approve' THEN 'approved' ELSE 'returned' END;
  IF p_decision='approve' AND submission.supersedes_submission_id IS NOT NULL THEN UPDATE public.profiling_submissions SET status='superseded',row_version=row_version+1,updated_at=now() WHERE id=submission.supersedes_submission_id AND cycle_id=submission.cycle_id AND household_id=submission.household_id AND status='approved'; END IF;
  UPDATE public.profiling_submissions SET status=next_status,row_version=row_version+1,updated_at=now(),approved_at=CASE WHEN p_decision='approve' THEN now() END,approved_by=CASE WHEN p_decision='approve' THEN auth.uid() END,returned_at=CASE WHEN p_decision='return' THEN now() END,returned_by=CASE WHEN p_decision='return' THEN auth.uid() END,return_reason=CASE WHEN p_decision='return' THEN btrim(p_reason) END WHERE id=p_submission_id RETURNING row_version INTO new_version;
  INSERT INTO public.profiling_events(cycle_id,submission_id,household_id,event_type,from_status,to_status,reason,actor_id) VALUES(submission.cycle_id,p_submission_id,submission.household_id,'submission_'||next_status,'pending',next_status,nullif(btrim(p_reason),''),auth.uid());
  RETURN new_version;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phase1_list_sample_units(uuid,uuid) TO authenticated;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.phase1_get_profiling_runtime()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE setting public.profiling_runtime_settings%ROWTYPE;
BEGIN
  IF NOT (public.phase1_current_has_capability('profiling.cycle.manage') OR public.phase1_current_has_capability('profiling.privacy.configure') OR public.phase1_current_has_capability('profiling.aggregate.read')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO setting FROM public.profiling_runtime_settings WHERE id=true;
  RETURN jsonb_build_object('mode',setting.mode,'syntheticUserIds',setting.synthetic_user_ids,'syntheticBarangayIds',setting.synthetic_barangay_ids,'privacyApprovedAt',setting.privacy_approved_at,'updatedAt',setting.updated_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_set_barangay_profile_prefix(p_barangay_id uuid,p_prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE normalized text; locked_id uuid;
BEGIN
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',p_barangay_id,NULL);
  normalized:=upper(btrim(p_prefix)); IF normalized!~'^[A-Z0-9]{2,8}$' THEN RAISE EXCEPTION 'prefix must contain 2 to 8 letters or numbers' USING ERRCODE='22023'; END IF;
  SELECT id INTO locked_id FROM public.barangays WHERE id=p_barangay_id FOR UPDATE;
  IF locked_id IS NULL THEN RAISE EXCEPTION 'barangay not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiling_households WHERE barangay_id=p_barangay_id) OR EXISTS(SELECT 1 FROM public.profiling_residents WHERE barangay_id=p_barangay_id) THEN RAISE EXCEPTION 'prefix is immutable after profiling codes are issued' USING ERRCODE='23514'; END IF;
  UPDATE public.barangays SET profile_code_prefix=normalized WHERE id=p_barangay_id;
  RETURN normalized;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_assign_mother_leader(p_mother_leader_id uuid,p_sitio_id uuid,p_effective_from date,p_effective_to date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE sitio public.barangay_sitios%ROWTYPE; new_id uuid;
BEGIN
  SELECT * INTO sitio FROM public.barangay_sitios WHERE id=p_sitio_id FOR UPDATE;
  IF sitio.id IS NULL THEN RAISE EXCEPTION 'sitio not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',sitio.barangay_id,NULL);
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_mother_leader_id AND role='barangay_mother_leader' AND barangay_id=sitio.barangay_id AND status='active' AND is_active) OR p_effective_from IS NULL OR (p_effective_to IS NOT NULL AND p_effective_to<p_effective_from) THEN RAISE EXCEPTION 'valid same-barangay Mother Leader and dates are required' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_mother_leader_id::text||':'||p_sitio_id::text,0));
  IF EXISTS(SELECT 1 FROM public.mother_leader_sitio_assignments a WHERE a.mother_leader_id=p_mother_leader_id AND a.sitio_id=p_sitio_id AND daterange(a.effective_from,coalesce(a.effective_to,'infinity'::date),'[]') && daterange(p_effective_from,coalesce(p_effective_to,'infinity'::date),'[]')) THEN RAISE EXCEPTION 'assignment dates overlap an existing assignment' USING ERRCODE='23505'; END IF;
  INSERT INTO public.mother_leader_sitio_assignments(mother_leader_id,sitio_id,effective_from,effective_to,assigned_by) VALUES(p_mother_leader_id,p_sitio_id,p_effective_from,p_effective_to,auth.uid()) RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_set_profiling_runtime(p_mode text,p_synthetic_user_ids uuid[] DEFAULT '{}',p_synthetic_barangay_ids uuid[] DEFAULT '{}',p_privacy_approved boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE updated public.profiling_runtime_settings%ROWTYPE;
BEGIN
  IF NOT public.phase1_current_has_capability('profiling.privacy.configure') OR p_mode NOT IN('off','synthetic','live') THEN RAISE EXCEPTION 'forbidden or invalid runtime mode' USING ERRCODE='42501'; END IF;
  IF p_mode='synthetic' AND (cardinality(p_synthetic_user_ids)=0 OR cardinality(p_synthetic_barangay_ids)=0) THEN RAISE EXCEPTION 'synthetic mode requires explicit users and barangays' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_synthetic_user_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=id AND u.status='active' AND u.is_active)) THEN RAISE EXCEPTION 'synthetic user allowlist is invalid' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_synthetic_barangay_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.barangays b WHERE b.id=id AND b.is_active)) THEN RAISE EXCEPTION 'synthetic barangay allowlist is invalid' USING ERRCODE='23514'; END IF;
  IF p_mode='live' THEN
    IF p_privacy_approved IS NOT TRUE THEN RAISE EXCEPTION 'live mode requires explicit privacy approval' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM public.users WHERE status='active' AND is_active AND role IN('paraya_officer','barangay_official')) THEN RAISE EXCEPTION 'unmapped legacy accounts block live profiling' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.profiling_privacy_notices WHERE retired_at IS NULL) THEN RAISE EXCEPTION 'an active privacy notice is required' USING ERRCODE='23514'; END IF;
  END IF;
  UPDATE public.profiling_runtime_settings SET mode=p_mode,synthetic_user_ids=CASE WHEN p_mode='synthetic' THEN p_synthetic_user_ids ELSE '{}' END,synthetic_barangay_ids=CASE WHEN p_mode='synthetic' THEN p_synthetic_barangay_ids ELSE '{}' END,
    privacy_approved_at=CASE WHEN p_mode='live' THEN now() ELSE privacy_approved_at END,privacy_approved_by=CASE WHEN p_mode='live' THEN auth.uid() ELSE privacy_approved_by END,updated_by=auth.uid(),updated_at=now() WHERE id=true RETURNING * INTO updated;
  RETURN jsonb_build_object('mode',updated.mode,'privacyApprovedAt',updated.privacy_approved_at,'updatedAt',updated.updated_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_register_sample_units(p_cycle_id uuid,p_units jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; item jsonb; inserted integer:=0;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL OR cycle.status<>'draft' OR NOT public.phase1_current_has_capability('profiling.cycle.manage') THEN RAISE EXCEPTION 'cycle is unavailable' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_units)<>'array' OR jsonb_array_length(p_units) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'sample register is invalid' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_units) LOOP
    IF NOT public.phase1_json_object_has_only(item,ARRAY['sample_reference','sitio_id','household_id']) OR coalesce(item->>'sample_reference','')!~'^[A-Za-z0-9._-]{2,80}$' OR NOT EXISTS(SELECT 1 FROM public.barangay_sitios WHERE id=(item->>'sitio_id')::uuid AND barangay_id=cycle.barangay_id AND is_active) OR (nullif(item->>'household_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiling_households WHERE id=(item->>'household_id')::uuid AND barangay_id=cycle.barangay_id)) THEN RAISE EXCEPTION 'sample register row is invalid' USING ERRCODE='22023'; END IF;
    INSERT INTO public.profiling_sample_units(cycle_id,sitio_id,sample_reference,contact_outcome,recorded_by,household_id) VALUES(p_cycle_id,(item->>'sitio_id')::uuid,item->>'sample_reference','not_contacted',auth.uid(),nullif(item->>'household_id','')::uuid) ON CONFLICT(cycle_id,sample_reference) DO NOTHING;
    IF FOUND THEN inserted:=inserted+1; END IF;
  END LOOP;
  INSERT INTO public.profiling_events(cycle_id,event_type,metadata,actor_id) VALUES(p_cycle_id,'sample_register_loaded',jsonb_build_object('inserted',inserted),auth.uid());
  RETURN inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_create_sample_replacement(p_sample_unit_id uuid,p_replacement_reference text,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE original public.profiling_sample_units%ROWTYPE; cycle public.profiling_cycles%ROWTYPE; new_id uuid;
BEGIN
  SELECT * INTO original FROM public.profiling_sample_units WHERE id=p_sample_unit_id FOR UPDATE;
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=original.cycle_id FOR UPDATE;
  IF original.id IS NULL OR cycle.status NOT IN('draft','collecting') OR NOT public.phase1_current_has_capability('profiling.cycle.manage') OR p_replacement_reference!~'^[A-Za-z0-9._-]{2,80}$' OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'replacement is invalid' USING ERRCODE='23514'; END IF;
  IF original.contact_outcome='participated' OR original.household_id IS NOT NULL THEN RAISE EXCEPTION 'a participating sample cannot be replaced' USING ERRCODE='23514'; END IF;
  INSERT INTO public.profiling_sample_units(cycle_id,sitio_id,sample_reference,contact_outcome,recorded_by,replacement_of_id,replacement_reason) VALUES(original.cycle_id,original.sitio_id,p_replacement_reference,'not_contacted',auth.uid(),original.id,btrim(p_reason)) RETURNING id INTO new_id;
  UPDATE public.profiling_sample_units SET contact_outcome='ineligible',row_version=row_version+1,updated_at=now() WHERE id=original.id;
  INSERT INTO public.profiling_events(cycle_id,event_type,reason,metadata,actor_id) VALUES(original.cycle_id,'sample_replaced',btrim(p_reason),jsonb_build_object('original',original.id,'replacement',new_id),auth.uid());
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_close_mother_leader_assignment(p_assignment_id uuid,p_effective_to date,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE assignment public.mother_leader_sitio_assignments%ROWTYPE;
BEGIN
  IF NOT public.phase1_current_has_capability('profiling.cycle.manage') OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO assignment FROM public.mother_leader_sitio_assignments WHERE id=p_assignment_id FOR UPDATE;
  IF assignment.id IS NULL OR assignment.effective_to IS NOT NULL OR p_effective_to<assignment.effective_from THEN RAISE EXCEPTION 'assignment cannot be closed' USING ERRCODE='23514'; END IF;
  UPDATE public.mother_leader_sitio_assignments SET effective_to=p_effective_to WHERE id=p_assignment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_verify_official_population_snapshot(p_snapshot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF NOT public.phase1_current_has_capability('profiling.cycle.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.official_population_snapshots SET verified_at=now(),verified_by=auth.uid() WHERE id=p_snapshot_id AND verified_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'snapshot is unavailable' USING ERRCODE='P0002'; END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phase1_get_profiling_runtime() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_set_profiling_runtime(text,uuid[],uuid[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_register_sample_units(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_create_sample_replacement(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_close_mother_leader_assignment(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_verify_official_population_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.phase1_list_active_privacy_notices()
RETURNS TABLE(id uuid,version text,notice_text text,controller_name text,privacy_contact text,retention_summary text,effective_from date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF NOT (public.phase1_current_has_capability('profiling.collect') OR public.phase1_current_has_capability('profiling.validate') OR public.phase1_current_has_capability('profiling.cycle.manage') OR public.phase1_current_has_capability('profiling.privacy.configure')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT n.id,n.version,n.notice_text,n.controller_name,n.privacy_contact,n.retention_summary,n.effective_from FROM public.profiling_privacy_notices n WHERE n.retired_at IS NULL AND n.effective_from<=current_date ORDER BY n.effective_from DESC,n.created_at DESC;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.phase1_list_active_privacy_notices() TO authenticated;

CREATE OR REPLACE FUNCTION public.phase1_void_impact_record(p_entity_type text,p_entity_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  IF NOT public.phase1_current_has_capability('impact.manage') OR length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'forbidden or missing reason' USING ERRCODE='42501'; END IF;
  IF p_entity_type='indicator' THEN UPDATE public.impact_indicators SET voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason) WHERE id=p_entity_id AND voided_at IS NULL;
  ELSIF p_entity_type='qualitative' THEN UPDATE public.impact_qualitative SET voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason) WHERE id=p_entity_id AND voided_at IS NULL;
  ELSIF p_entity_type='follow_up' THEN UPDATE public.follow_up_records SET voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason),row_version=row_version+1 WHERE id=p_entity_id AND voided_at IS NULL;
  ELSE RAISE EXCEPTION 'invalid impact entity type' USING ERRCODE='22023'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact record is unavailable' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.domain_correction_events(domain,entity_type,entity_id,event_type,reason,actor_id) VALUES('impact',p_entity_type,p_entity_id,'voided',btrim(p_reason),auth.uid());
END;
$function$;
GRANT EXECUTE ON FUNCTION public.phase1_void_impact_record(text,uuid,text) TO authenticated;

COMMIT;
