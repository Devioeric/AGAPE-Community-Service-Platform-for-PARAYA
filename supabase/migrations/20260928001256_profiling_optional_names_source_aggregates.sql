-- Forward-only profiling contract extension.
--
-- This migration makes resident identity names optional while retaining
-- consent, age/guardian, lifecycle, and authorization checks.  It also adds
-- an RPC-only store for aggregate source tables.  It deliberately does not
-- rewrite any existing profiling rows or edit an applied migration.
BEGIN;

DO $preflight_profiling_optional_names$
DECLARE
  definition text;
BEGIN
  IF to_regprocedure('public.phase1_assert_resident_payload(jsonb,date)') IS NULL THEN
    RAISE EXCEPTION 'profiling optional-name migration requires phase1_assert_resident_payload(jsonb,date)';
  END IF;
  IF to_regprocedure('public.phase1_assert_profiling_payload(jsonb,uuid,uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'profiling optional-name migration requires phase1_assert_profiling_payload(jsonb,uuid,uuid,date)';
  END IF;
  IF to_regprocedure('public.phase1_create_profiling_submission_internal(uuid,uuid,jsonb,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'profiling optional-name migration requires the locked submission implementation';
  END IF;
  IF to_regprocedure('public.phase1_revise_returned_profiling_submission_internal_v2(uuid,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'profiling optional-name migration requires the locked revision implementation';
  END IF;
  IF to_regprocedure('public.phase1_create_profiling_submission(uuid,uuid,jsonb,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'profiling optional-name migration requires the trusted submission wrapper';
  END IF;
  IF to_regprocedure('public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'profiling optional-name migration requires the trusted revision wrapper';
  END IF;
  IF to_regprocedure('public.phase1_assert_profiling_scope(text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'profiling optional-name migration requires profiling scope authorization';
  END IF;
  IF to_regprocedure('public.phase1_current_has_capability(text)') IS NULL THEN
    RAISE EXCEPTION 'profiling optional-name migration requires capability authorization';
  END IF;
  IF to_regclass('public.profiling_source_aggregate_datasets') IS NOT NULL
     OR to_regclass('public.profiling_source_aggregate_rows') IS NOT NULL THEN
    RAISE EXCEPTION 'profiling source aggregate tables already exist; reconcile before applying this migration';
  END IF;

  SELECT pg_get_functiondef('public.phase1_assert_resident_payload(jsonb,date)'::regprocedure)
    INTO definition;
  IF position($needle$length(btrim(coalesce(p_resident->>'first_name',''))) NOT BETWEEN 1 AND 80$needle$ IN definition) = 0
     OR position($needle$length(btrim(coalesce(p_resident->>'last_name',''))) NOT BETWEEN 1 AND 80$needle$ IN definition) = 0 THEN
    RAISE EXCEPTION 'resident validator definition is not the expected release-gate version';
  END IF;

  SELECT pg_get_functiondef('public.phase1_create_profiling_submission_internal(uuid,uuid,jsonb,text,uuid)'::regprocedure)
    INTO definition;
  IF position($needle$concat_ws(' ',item->>'first_name',item->>'last_name')$needle$ IN definition) = 0 THEN
    RAISE EXCEPTION 'submission implementation does not contain the expected consent-name expression';
  END IF;

  SELECT pg_get_functiondef('public.phase1_revise_returned_profiling_submission_internal_v2(uuid,integer,jsonb)'::regprocedure)
    INTO definition;
  IF position($needle$concat_ws(' ',item->>'first_name',item->>'last_name')$needle$ IN definition) = 0 THEN
    RAISE EXCEPTION 'revision implementation does not contain the expected consent-name expression';
  END IF;
END;
$preflight_profiling_optional_names$;

-- Normalize optional identity fields at the trusted RPC boundary.  Client
-- contracts also normalize them, but the database must not trust a caller to
-- do that correctly.
CREATE OR REPLACE FUNCTION public.phase1_normalize_optional_resident_names(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $function$
DECLARE
  residents jsonb;
  item jsonb;
  normalized jsonb := '[]'::jsonb;
  first_name text;
  last_name text;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN RETURN p_payload; END IF;
  residents := p_payload->'residents';
  IF jsonb_typeof(residents) <> 'array' THEN RETURN p_payload; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(residents) LOOP
    first_name := nullif(btrim(item->>'first_name'),'');
    last_name := nullif(btrim(item->>'last_name'),'');
    item := jsonb_set(item, ARRAY['first_name'], coalesce(to_jsonb(first_name),'null'::jsonb), true);
    item := jsonb_set(item, ARRAY['last_name'], coalesce(to_jsonb(last_name),'null'::jsonb), true);
    normalized := normalized || jsonb_build_array(item);
  END LOOP;
  RETURN jsonb_set(p_payload, ARRAY['residents'], normalized, true);
END;
$function$;
REVOKE ALL ON FUNCTION public.phase1_normalize_optional_resident_names(jsonb) FROM PUBLIC,anon,authenticated;

-- Relax only the two identity-name checks.  All category, consent, age,
-- guardian, pregnancy, and prohibited-field validation remains byte-for-byte
-- from the current deployed definition.
DO $replace_optional_name_validation$
DECLARE
  definition text;
  old_first text := $old$length(btrim(coalesce(p_resident->>'first_name',''))) NOT BETWEEN 1 AND 80$old$;
  old_last text := $old$length(btrim(coalesce(p_resident->>'last_name',''))) NOT BETWEEN 1 AND 80$old$;
  new_first text := $new$(nullif(btrim(coalesce(p_resident->>'first_name','')),'') IS NOT NULL AND length(btrim(coalesce(p_resident->>'first_name',''))) NOT BETWEEN 1 AND 80)$new$;
  new_last text := $new$(nullif(btrim(coalesce(p_resident->>'last_name','')),'') IS NOT NULL AND length(btrim(coalesce(p_resident->>'last_name',''))) NOT BETWEEN 1 AND 80)$new$;
BEGIN
  SELECT pg_get_functiondef('public.phase1_assert_resident_payload(jsonb,date)'::regprocedure)
    INTO definition;
  definition := replace(definition, old_first, new_first);
  definition := replace(definition, old_last, new_last);
  IF position(new_first IN definition) = 0 OR position(new_last IN definition) = 0 THEN
    RAISE EXCEPTION 'optional resident-name validator replacement did not apply';
  END IF;
  EXECUTE definition;
END;
$replace_optional_name_validation$;

-- The internal implementations are revoked and called only by trusted
-- wrappers.  Change their consent-name fallback without duplicating their
-- privacy-sensitive bodies.
DO $replace_internal_consent_fallbacks$
DECLARE
  definition text;
  old_expression text;
  new_expression text;
BEGIN
  SELECT pg_get_functiondef('public.phase1_create_profiling_submission_internal(uuid,uuid,jsonb,text,uuid)'::regprocedure)
    INTO definition;
  old_expression := $old$concat_ws(' ',item->>'first_name',item->>'last_name')$old$;
  new_expression := $new$coalesce(nullif(concat_ws(' ',nullif(btrim(item->>'first_name'),''),nullif(btrim(item->>'last_name'),'')),'') ,'Anonymous resident consent')$new$;
  definition := replace(definition, old_expression, new_expression);
  IF position(new_expression IN definition) = 0 THEN
    RAISE EXCEPTION 'submission consent fallback replacement did not apply';
  END IF;
  EXECUTE definition;

  SELECT pg_get_functiondef('public.phase1_revise_returned_profiling_submission_internal_v2(uuid,integer,jsonb)'::regprocedure)
    INTO definition;
  old_expression := $old$concat_ws(' ',item->>'first_name',item->>'last_name')$old$;
  new_expression := $new$coalesce(nullif(concat_ws(' ',nullif(btrim(item->>'first_name'),''),nullif(btrim(item->>'last_name'),'')),'') ,'Anonymous resident consent')$new$;
  definition := replace(definition, old_expression, new_expression);
  IF position(new_expression IN definition) = 0 THEN
    RAISE EXCEPTION 'revision consent fallback replacement did not apply';
  END IF;
  EXECUTE definition;
END;
$replace_internal_consent_fallbacks$;

-- Normalize before both trusted entrypoints invoke the locked internal
-- implementations.  The marker checks make a drifted function definition a
-- migration failure instead of silently installing a partial security fix.
DO $normalize_trusted_wrappers$
DECLARE
  definition text;
  marker text;
BEGIN
  SELECT pg_get_functiondef('public.phase1_create_profiling_submission(uuid,uuid,jsonb,text,uuid)'::regprocedure)
    INTO definition;
  marker := E'BEGIN\n  SELECT * INTO cycle';
  IF position(marker IN definition) = 0 THEN RAISE EXCEPTION 'submission wrapper definition drifted'; END IF;
  definition := replace(definition, marker, E'BEGIN\n  p_payload := public.phase1_normalize_optional_resident_names(p_payload);\n  SELECT * INTO cycle');
  EXECUTE definition;

  SELECT pg_get_functiondef('public.phase1_revise_returned_profiling_submission(uuid,integer,jsonb)'::regprocedure)
    INTO definition;
  marker := E'BEGIN\n  SELECT * INTO previous';
  IF position(marker IN definition) = 0 THEN RAISE EXCEPTION 'revision wrapper definition drifted'; END IF;
  definition := replace(definition, marker, E'BEGIN\n  p_payload := public.phase1_normalize_optional_resident_names(p_payload);\n  SELECT * INTO previous');
  EXECUTE definition;
END;
$normalize_trusted_wrappers$;

-- The currently deployed stable wrapper writes resident consent rows directly
-- (rather than delegating to the older internal implementation).  Apply the
-- same anonymous-consent fallback there as well, otherwise a name-free adult
-- would still violate profiling_consents.consent_by_name.
DO $replace_stable_wrapper_consent_fallback$
DECLARE
  definition text;
  old_expression text := $old$concat_ws(' ',resident_item->>'first_name',resident_item->>'last_name')$old$;
  new_expression text := $new$coalesce(nullif(concat_ws(' ',nullif(btrim(resident_item->>'first_name'),''),nullif(btrim(resident_item->>'last_name'),'')),'') ,'Anonymous resident consent')$new$;
BEGIN
  SELECT pg_get_functiondef('public.phase1_create_profiling_submission(uuid,uuid,jsonb,text,uuid)'::regprocedure)
    INTO definition;
  IF position(old_expression IN definition)=0 THEN RAISE EXCEPTION 'stable submission consent expression drifted'; END IF;
  definition:=replace(definition,old_expression,new_expression);
  EXECUTE definition;
END;
$replace_stable_wrapper_consent_fallback$;

CREATE TABLE public.profiling_source_aggregate_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.profiling_cycles(id) ON DELETE RESTRICT,
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  sitio_id uuid NOT NULL REFERENCES public.barangay_sitios(id) ON DELETE RESTRICT,
  aggregate_schema_version text NOT NULL DEFAULT 'agape.profiling.source.aggregate.v1'
    CHECK (aggregate_schema_version = 'agape.profiling.source.aggregate.v1'),
  source_title text NOT NULL CHECK (length(btrim(source_title)) BETWEEN 2 AND 240),
  source_location text NOT NULL CHECK (length(btrim(source_location)) BETWEEN 2 AND 240),
  source_files jsonb NOT NULL CHECK (jsonb_typeof(source_files) = 'array'),
  source_hashes jsonb NOT NULL CHECK (jsonb_typeof(source_hashes) = 'object'),
  source_bundle_hash text NOT NULL CHECK (source_bundle_hash ~ '^[a-f0-9]{64}$'),
  source_row_count integer NOT NULL CHECK (source_row_count >= 0),
  status text NOT NULL DEFAULT 'imported' CHECK (status IN ('imported','superseded')),
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(quality_flags) = 'array'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  imported_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, source_bundle_hash)
);

CREATE TABLE public.profiling_source_aggregate_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.profiling_source_aggregate_datasets(id) ON DELETE RESTRICT,
  source_record_id text NOT NULL CHECK (length(btrim(source_record_id)) BETWEEN 1 AND 160),
  record_type text NOT NULL CHECK (record_type IN (
    'quantitative_data','total','narrative','recommendation','topic_heading',
    'source_note','section_heading','summary_finding','qualitative_observation',
    'subsection_heading','author','author_affiliation','document_metadata'
  )),
  section text CHECK (section IS NULL OR length(section) <= 240),
  subsection text CHECK (subsection IS NULL OR length(subsection) <= 240),
  topic text CHECK (topic IS NULL OR length(topic) <= 240),
  category text CHECK (category IS NULL OR length(category) <= 240),
  frequency numeric CHECK (frequency IS NULL OR frequency >= 0),
  percentage numeric CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 101)),
  percentage_as_printed text CHECK (percentage_as_printed IS NULL OR length(percentage_as_printed) <= 80),
  reported_table_total numeric CHECK (reported_table_total IS NULL OR reported_table_total >= 0),
  multiple_responses text CHECK (multiple_responses IS NULL OR length(multiple_responses) <= 80),
  description text CHECK (description IS NULL OR length(description) <= 6000),
  representative_notes text CHECK (representative_notes IS NULL OR length(representative_notes) <= 6000),
  source_page text CHECK (source_page IS NULL OR length(source_page) <= 120),
  table_id text CHECK (table_id IS NULL OR length(table_id) <= 160),
  original_table_header text CHECK (original_table_header IS NULL OR length(original_table_header) <= 6000),
  data_quality_notes text CHECK (data_quality_notes IS NULL OR length(data_quality_notes) <= 6000),
  source_file text CHECK (source_file IS NULL OR length(source_file) <= 240),
  raw_record jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_record) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, source_record_id)
);

CREATE INDEX profiling_source_aggregate_datasets_scope_idx
  ON public.profiling_source_aggregate_datasets(cycle_id, barangay_id, sitio_id, status);
CREATE INDEX profiling_source_aggregate_datasets_hash_idx
  ON public.profiling_source_aggregate_datasets(source_bundle_hash);
CREATE INDEX profiling_source_aggregate_rows_dataset_idx
  ON public.profiling_source_aggregate_rows(dataset_id, record_type, id);
CREATE INDEX profiling_source_aggregate_rows_topic_idx
  ON public.profiling_source_aggregate_rows(dataset_id, topic, table_id);
CREATE INDEX profiling_source_aggregate_rows_section_idx
  ON public.profiling_source_aggregate_rows(dataset_id, section, subsection);

COMMENT ON TABLE public.profiling_source_aggregate_datasets IS
  'Aggregate source-report provenance only; never a resident-level roster. Access is RPC-only.';
COMMENT ON TABLE public.profiling_source_aggregate_rows IS
  'Normalized aggregate source rows retained for provenance and read-only reporting. Access is RPC-only.';

-- New profiling tables must receive the same deny-only and RPC-only boundary
-- as the existing profiling tables.  SECURITY DEFINER RPCs below are the only
-- application access path.
DO $lock_source_aggregate_tables$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiling_source_aggregate_datasets','profiling_source_aggregate_rows'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS phase0_active_account_guard ON public.%I', table_name);
    EXECUTE format('CREATE POLICY phase0_active_account_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.phase0_current_account_is_active())) WITH CHECK ((SELECT public.phase0_current_account_is_active()))', table_name);
    EXECUTE format('DROP POLICY IF EXISTS phase1_deny_override_guard ON public.%I', table_name);
    EXECUTE format('CREATE POLICY phase1_deny_override_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.phase1_current_permission_module_allowed(''profiling'')) WITH CHECK (public.phase1_current_permission_module_allowed(''profiling''))', table_name);
    EXECUTE format('DROP POLICY IF EXISTS phase1_rpc_only ON public.%I', table_name);
    EXECUTE format('CREATE POLICY phase1_rpc_only ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated', table_name);
  END LOOP;
END;
$lock_source_aggregate_tables$;

DO $verify_source_security_catalog$
BEGIN
  IF public.phase1_permission_module_for_table('profiling_source_aggregate_datasets') IS DISTINCT FROM 'profiling'
     OR public.phase1_permission_module_for_table('profiling_source_aggregate_rows') IS DISTINCT FROM 'profiling' THEN
    RAISE EXCEPTION 'profiling source aggregate tables are not mapped to the profiling permission module';
  END IF;
END;
$verify_source_security_catalog$;

CREATE OR REPLACE FUNCTION public.phase1_import_profiling_source_aggregate(
  p_cycle_id uuid,
  p_barangay_id uuid,
  p_sitio_id uuid,
  p_metadata jsonb,
  p_rows jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  cycle public.profiling_cycles%ROWTYPE;
  sitio public.barangay_sitios%ROWTYPE;
  dataset_id uuid;
  item jsonb;
  source_files jsonb;
  source_hashes jsonb;
  quality_flags jsonb;
  provenance jsonb;
  bundle_hash_value text;
  source_title text;
  source_location text;
  source_schema_version text;
  source_row_count integer;
  file_name text;
  hash_value text;
  frequency_value numeric;
  percentage_value numeric;
  reported_total_value numeric;
  source_record_id text;
  record_type text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_metadata) <> 'object' OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'source aggregate metadata and rows must be JSON objects/arrays' USING ERRCODE='22023';
  END IF;
  IF lower(p_metadata::text) ~ '(password|authorization|service[_-]?role|api[_-]?key|secret|refresh[_-]?token)' THEN
    RAISE EXCEPTION 'source aggregate metadata contains a prohibited secret marker' USING ERRCODE='22023';
  END IF;
  IF NOT public.phase1_json_object_has_only(p_metadata,ARRAY[
    'aggregate_schema_version','source_title','source_location','source_files',
    'source_hashes','source_bundle_hash','source_row_count','quality_flags','provenance'
  ]) THEN RAISE EXCEPTION 'source aggregate metadata contains unknown fields' USING ERRCODE='22023'; END IF;

  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF cycle.id IS NULL OR cycle.barangay_id<>p_barangay_id THEN RAISE EXCEPTION 'profiling cycle scope is invalid' USING ERRCODE='42501'; END IF;
  SELECT * INTO sitio FROM public.barangay_sitios WHERE id=p_sitio_id AND barangay_id=p_barangay_id AND is_active;
  IF sitio.id IS NULL THEN RAISE EXCEPTION 'profiling sitio scope is invalid' USING ERRCODE='42501'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(p_barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.cycle.manage',p_barangay_id,p_sitio_id);

  source_schema_version:=coalesce(p_metadata->>'aggregate_schema_version','');
  IF source_schema_version<>'agape.profiling.source.aggregate.v1' THEN RAISE EXCEPTION 'unsupported source aggregate schema' USING ERRCODE='22023'; END IF;
  source_title:=btrim(coalesce(p_metadata->>'source_title',''));
  source_location:=btrim(coalesce(p_metadata->>'source_location',''));
  bundle_hash_value:=lower(btrim(coalesce(p_metadata->>'source_bundle_hash','')));
  IF length(source_title) NOT BETWEEN 2 AND 240 OR length(source_location) NOT BETWEEN 2 AND 240 OR bundle_hash_value !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'source aggregate metadata is invalid' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_metadata->'source_files')<>'array' OR jsonb_array_length(p_metadata->'source_files')=0
     OR jsonb_typeof(p_metadata->'source_hashes')<>'object' THEN
    RAISE EXCEPTION 'source file metadata is invalid' USING ERRCODE='22023';
  END IF;
  source_files:=p_metadata->'source_files'; source_hashes:=p_metadata->'source_hashes';
  FOR item IN SELECT value FROM jsonb_array_elements(source_files) LOOP
    file_name:=btrim(item #>> '{}');
    IF file_name='' OR file_name~'[\\/]' OR length(file_name)>240 THEN RAISE EXCEPTION 'source file names must be safe basenames' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR hash_value IN SELECT value FROM jsonb_each_text(source_hashes) LOOP
    IF hash_value !~ '^[a-fA-F0-9]{64}$' THEN RAISE EXCEPTION 'source hashes must be SHA-256 values' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_metadata->'quality_flags')<>'array' OR jsonb_typeof(p_metadata->'provenance')<>'object' THEN
    RAISE EXCEPTION 'source quality/provenance metadata is invalid' USING ERRCODE='22023';
  END IF;
  quality_flags:=p_metadata->'quality_flags'; provenance:=p_metadata->'provenance';
  IF jsonb_typeof(p_metadata->'source_row_count')<>'number' OR (p_metadata->>'source_row_count') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'source row count is invalid' USING ERRCODE='22023';
  END IF;
  source_row_count:=(p_metadata->>'source_row_count')::integer;
  IF source_row_count<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'source row count does not match rows' USING ERRCODE='22023'; END IF;

  SELECT d.id INTO dataset_id FROM public.profiling_source_aggregate_datasets AS d
  WHERE d.cycle_id=p_cycle_id AND d.source_bundle_hash=bundle_hash_value;
  IF dataset_id IS NOT NULL THEN RETURN dataset_id; END IF;

  UPDATE public.profiling_source_aggregate_datasets
  SET status='superseded',superseded_at=coalesce(superseded_at,now())
  WHERE cycle_id=p_cycle_id AND barangay_id=p_barangay_id AND sitio_id=p_sitio_id AND status='imported';

  INSERT INTO public.profiling_source_aggregate_datasets(
    cycle_id,barangay_id,sitio_id,aggregate_schema_version,source_title,source_location,
    source_files,source_hashes,source_bundle_hash,source_row_count,quality_flags,provenance,imported_by
  ) VALUES(
    p_cycle_id,p_barangay_id,p_sitio_id,source_schema_version,source_title,source_location,
    source_files,source_hashes,bundle_hash_value,source_row_count,quality_flags,provenance,auth.uid()
  ) RETURNING id INTO dataset_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(item)<>'object' OR lower(item::text) ~ '(password|authorization|service[_-]?role|api[_-]?key|secret|refresh[_-]?token)' THEN
      RAISE EXCEPTION 'source aggregate row is invalid or contains a secret marker' USING ERRCODE='22023';
    END IF;
    IF NOT public.phase1_json_object_has_only(item,ARRAY[
      'source_record_id','record_type','section','subsection','topic','category','frequency',
      'percentage','percentage_as_printed','reported_table_total','multiple_responses',
      'description','representative_notes','source_page','table_id','original_table_header',
      'data_quality_notes','source_file','raw_record'
    ]) THEN RAISE EXCEPTION 'source aggregate row contains unknown fields' USING ERRCODE='22023'; END IF;
    source_record_id:=btrim(coalesce(item->>'source_record_id',''));
    record_type:=btrim(coalesce(item->>'record_type',''));
    IF source_record_id='' OR length(source_record_id)>160 OR record_type NOT IN(
      'quantitative_data','total','narrative','recommendation','topic_heading','source_note',
      'section_heading','summary_finding','qualitative_observation','subsection_heading',
      'author','author_affiliation','document_metadata'
    ) THEN RAISE EXCEPTION 'source aggregate row identity is invalid' USING ERRCODE='22023'; END IF;
    IF nullif(btrim(item->>'frequency'),'') IS NOT NULL AND btrim(item->>'frequency') !~ '^[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'source frequency is invalid' USING ERRCODE='22023'; END IF;
    IF nullif(btrim(item->>'percentage'),'') IS NOT NULL AND btrim(item->>'percentage') !~ '^[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'source percentage is invalid' USING ERRCODE='22023'; END IF;
    IF nullif(btrim(item->>'reported_table_total'),'') IS NOT NULL AND btrim(item->>'reported_table_total') !~ '^[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'source table total is invalid' USING ERRCODE='22023'; END IF;
    frequency_value:=nullif(btrim(item->>'frequency'),'')::numeric;
    percentage_value:=nullif(btrim(item->>'percentage'),'')::numeric;
    reported_total_value:=nullif(btrim(item->>'reported_table_total'),'')::numeric;
    IF percentage_value IS NOT NULL AND (percentage_value<0 OR percentage_value>101) THEN RAISE EXCEPTION 'source percentage is outside the permitted range' USING ERRCODE='22023'; END IF;
    IF jsonb_typeof(coalesce(item->'raw_record','{}'::jsonb))<>'object' THEN RAISE EXCEPTION 'source raw record must be an object' USING ERRCODE='22023'; END IF;
    IF item->>'source_file' ~ '[\\/]' THEN RAISE EXCEPTION 'source row file must be a basename' USING ERRCODE='22023'; END IF;
    INSERT INTO public.profiling_source_aggregate_rows(
      dataset_id,source_record_id,record_type,section,subsection,topic,category,frequency,
      percentage,percentage_as_printed,reported_table_total,multiple_responses,description,
      representative_notes,source_page,table_id,original_table_header,data_quality_notes,
      source_file,raw_record
    ) VALUES(
      dataset_id,source_record_id,record_type,nullif(btrim(item->>'section'),''),nullif(btrim(item->>'subsection'),''),
      nullif(btrim(item->>'topic'),''),nullif(btrim(item->>'category'),''),frequency_value,
      percentage_value,nullif(btrim(item->>'percentage_as_printed'),''),reported_total_value,
      nullif(btrim(item->>'multiple_responses'),''),nullif(item->>'description',''),
      nullif(item->>'representative_notes',''),nullif(btrim(item->>'source_page'),''),
      nullif(btrim(item->>'table_id'),''),nullif(item->>'original_table_header',''),
      nullif(item->>'data_quality_notes',''),nullif(btrim(item->>'source_file'),''),coalesce(item->'raw_record','{}'::jsonb)
    );
  END LOOP;
  INSERT INTO public.audit_logs(user_id,user_email,action,resource_type,resource_id,level,metadata)
  SELECT u.id,u.email,'Profiling aggregate source imported','profiling_source_aggregate_datasets',dataset_id::text,'warning',
    jsonb_build_object('cycle_id',p_cycle_id,'barangay_id',p_barangay_id,'sitio_id',p_sitio_id,'row_count',source_row_count,'source_bundle_hash',bundle_hash_value)
  FROM public.users u WHERE u.id=auth.uid();
  RETURN dataset_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_source_aggregate_datasets(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cycle public.profiling_cycles%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO cycle FROM public.profiling_cycles WHERE id=p_cycle_id;
  IF cycle.id IS NULL THEN RAISE EXCEPTION 'profiling cycle not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(cycle.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read',cycle.barangay_id,NULL);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'cycleId',d.cycle_id,'barangayId',d.barangay_id,'sitioId',d.sitio_id,
    'aggregateSchemaVersion',d.aggregate_schema_version,'sourceTitle',d.source_title,
    'sourceLocation',d.source_location,'sourceFiles',d.source_files,'sourceHashes',d.source_hashes,
    'sourceBundleHash',d.source_bundle_hash,'sourceRowCount',d.source_row_count,
    'status',d.status,'qualityFlags',d.quality_flags,'provenance',d.provenance,
    'importedAt',d.imported_at
  ) ORDER BY d.imported_at DESC),'[]'::jsonb) INTO result
  FROM public.profiling_source_aggregate_datasets d WHERE d.cycle_id=p_cycle_id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_source_aggregate_rows(
  p_dataset_id uuid,p_page integer DEFAULT 1,p_page_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE dataset public.profiling_source_aggregate_datasets%ROWTYPE; total_count integer; rows jsonb;
BEGIN
  IF p_page<1 OR p_page_size<1 OR p_page_size>500 THEN RAISE EXCEPTION 'invalid source aggregate page' USING ERRCODE='22023'; END IF;
  SELECT * INTO dataset FROM public.profiling_source_aggregate_datasets WHERE id=p_dataset_id;
  IF dataset.id IS NULL THEN RAISE EXCEPTION 'source aggregate dataset not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(dataset.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read',dataset.barangay_id,NULL);
  SELECT count(*)::integer INTO total_count FROM public.profiling_source_aggregate_rows WHERE dataset_id=p_dataset_id;
  SELECT coalesce(jsonb_agg(page_row.payload ORDER BY page_row.row_id),'[]'::jsonb) INTO rows
  FROM (
    SELECT r.id AS row_id, jsonb_build_object(
      'id',r.id,'sourceRecordId',r.source_record_id,'recordType',r.record_type,'section',r.section,
      'subsection',r.subsection,'topic',r.topic,'category',r.category,'frequency',r.frequency,
      'percentage',r.percentage,'percentageAsPrinted',r.percentage_as_printed,
      'reportedTableTotal',r.reported_table_total,'multipleResponses',r.multiple_responses,
      'description',r.description,'representativeNotes',r.representative_notes,'sourcePage',r.source_page,
      'tableId',r.table_id,'originalTableHeader',r.original_table_header,
      'dataQualityNotes',r.data_quality_notes,'sourceFile',r.source_file
    ) AS payload
    FROM public.profiling_source_aggregate_rows r
    WHERE r.dataset_id=p_dataset_id
    ORDER BY r.id
    OFFSET (p_page-1)*p_page_size LIMIT p_page_size
  ) AS page_row;
  RETURN jsonb_build_object(
    'datasetId',dataset.id,'cycleId',dataset.cycle_id,'barangayId',dataset.barangay_id,'sitioId',dataset.sitio_id,
    'sourceTitle',dataset.source_title,'sourceLocation',dataset.source_location,'status',dataset.status,
    'qualityFlags',dataset.quality_flags,'provenance',dataset.provenance,'rows',rows,
    'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',total_count,'totalPages',ceil(total_count::numeric/p_page_size)::integer)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase1_import_profiling_source_aggregate(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_list_profiling_source_aggregate_datasets(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase1_list_profiling_source_aggregate_rows(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase1_import_profiling_source_aggregate(uuid,uuid,uuid,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_source_aggregate_datasets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_source_aggregate_rows(uuid,integer,integer) TO authenticated;

COMMIT;
