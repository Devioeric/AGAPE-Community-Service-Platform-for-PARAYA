-- Phase 1B: normalized, cycle-aware resident profiling foundation.
-- This migration is additive. It never derives residents from legacy member_count.
BEGIN;

ALTER TABLE public.barangays ADD COLUMN IF NOT EXISTS profile_code_prefix text;
CREATE UNIQUE INDEX IF NOT EXISTS barangays_profile_code_prefix_key
  ON public.barangays (upper(profile_code_prefix)) WHERE profile_code_prefix IS NOT NULL;

ALTER TABLE public.household_profiles ADD COLUMN IF NOT EXISTS legacy_data_status text NOT NULL DEFAULT 'legacy_unverified';
ALTER TABLE public.household_profiles DROP CONSTRAINT IF EXISTS household_profiles_legacy_data_status_check;
ALTER TABLE public.household_profiles ADD CONSTRAINT household_profiles_legacy_data_status_check
  CHECK (legacy_data_status = 'legacy_unverified');
COMMENT ON TABLE public.household_profiles IS
  'Read-only legacy unverified aggregate household data. Excluded from Phase 1 profiling analytics, exports, beneficiary calculations, and AI.';

CREATE OR REPLACE FUNCTION public.phase1_block_legacy_household_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
BEGIN
  RAISE EXCEPTION 'household_profiles is legacy unverified read-only data' USING ERRCODE = '55000';
END;
$function$;
DROP TRIGGER IF EXISTS phase1_household_profiles_read_only ON public.household_profiles;
CREATE TRIGGER phase1_household_profiles_read_only
BEFORE INSERT OR UPDATE OR DELETE ON public.household_profiles
FOR EACH ROW EXECUTE FUNCTION public.phase1_block_legacy_household_write();

CREATE TABLE public.barangay_sitios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  normalized_name text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  aliases text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barangay_id, normalized_name)
);

CREATE TABLE public.mother_leader_sitio_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mother_leader_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  sitio_id uuid NOT NULL REFERENCES public.barangay_sitios(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date,
  assigned_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX mother_leader_active_sitio_assignment_key
  ON public.mother_leader_sitio_assignments(mother_leader_id, sitio_id)
  WHERE effective_to IS NULL;

CREATE TABLE public.profiling_privacy_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE CHECK (length(btrim(version)) BETWEEN 1 AND 40),
  notice_text text NOT NULL CHECK (length(btrim(notice_text)) >= 20),
  controller_name text NOT NULL,
  privacy_contact text NOT NULL,
  retention_summary text NOT NULL,
  effective_from date NOT NULL,
  retired_at timestamptz,
  approved_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiling_privacy_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  suppression_threshold integer NOT NULL DEFAULT 5 CHECK (suppression_threshold BETWEEN 5 AND 100),
  identifiable_exports_enabled boolean NOT NULL DEFAULT false CHECK (identifiable_exports_enabled IS FALSE),
  staging_retention_days integer NOT NULL DEFAULT 30 CHECK (staging_retention_days BETWEEN 1 AND 30),
  updated_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.profiling_privacy_settings(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.profiling_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','collecting','validating','completed','archived')),
  sample_method text NOT NULL CHECK (length(btrim(sample_method)) BETWEEN 2 AND 160),
  target_households integer NOT NULL CHECK (target_households > 0),
  collection_starts_on date NOT NULL,
  collection_ends_on date NOT NULL,
  privacy_notice_id uuid NOT NULL REFERENCES public.profiling_privacy_notices(id) ON DELETE RESTRICT,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  captain_endorsed_at timestamptz,
  captain_endorsed_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (collection_ends_on >= collection_starts_on),
  UNIQUE (barangay_id, name)
);

CREATE TABLE public.official_population_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  as_of_date date NOT NULL,
  source_name text NOT NULL CHECK (length(btrim(source_name)) BETWEEN 2 AND 200),
  total_population integer NOT NULL CHECK (total_population >= 0),
  total_households integer NOT NULL CHECK (total_households >= 0),
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  verified_at timestamptz,
  verified_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barangay_id, as_of_date, source_name)
);

CREATE TABLE public.profiling_sample_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.profiling_cycles(id) ON DELETE RESTRICT,
  sitio_id uuid NOT NULL REFERENCES public.barangay_sitios(id) ON DELETE RESTRICT,
  sample_reference text NOT NULL,
  contact_outcome text NOT NULL CHECK (contact_outcome IN ('not_contacted','unavailable','participated','refused','ineligible')),
  anonymous_household_size integer CHECK (anonymous_household_size BETWEEN 0 AND 100),
  refusal_recorded_at timestamptz,
  recorded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, sample_reference),
  CHECK (contact_outcome <> 'refused' OR refusal_recorded_at IS NOT NULL)
);

CREATE TABLE public.profiling_code_counters (
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (entity_type IN ('household','resident')),
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  PRIMARY KEY (barangay_id, entity_type)
);

CREATE TABLE public.profiling_households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  sitio_id uuid NOT NULL REFERENCES public.barangay_sitios(id) ON DELETE RESTRICT,
  household_code text NOT NULL UNIQUE,
  lifecycle_status text NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active','moved','dissolved','merged')),
  merged_into_id uuid REFERENCES public.profiling_households(id) ON DELETE RESTRICT,
  legacy_household_profile_id uuid UNIQUE REFERENCES public.household_profiles(id) ON DELETE RESTRICT,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lifecycle_status <> 'merged' OR merged_into_id IS NOT NULL)
);

CREATE TABLE public.profiling_residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  resident_code text NOT NULL UNIQUE,
  lifecycle_status text NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active','inactive','deceased','merged')),
  merged_into_id uuid REFERENCES public.profiling_residents(id) ON DELETE RESTRICT,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lifecycle_status <> 'merged' OR merged_into_id IS NOT NULL)
);

CREATE TABLE public.profiling_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.profiling_cycles(id) ON DELETE RESTRICT,
  sample_unit_id uuid REFERENCES public.profiling_sample_units(id) ON DELETE RESTRICT,
  household_id uuid NOT NULL REFERENCES public.profiling_households(id) ON DELETE RESTRICT,
  sitio_id uuid NOT NULL REFERENCES public.barangay_sitios(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','returned','superseded')),
  submission_version integer NOT NULL DEFAULT 1 CHECK (submission_version > 0),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','xlsx','csv')),
  import_batch_id uuid,
  household_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  anonymous_nonparticipant_count integer NOT NULL DEFAULT 0 CHECK (anonymous_nonparticipant_count BETWEEN 0 AND 100),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  returned_at timestamptz,
  returned_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  return_reason text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, household_id, submission_version),
  CHECK (status <> 'returned' OR length(btrim(return_reason)) >= 3)
);

CREATE TABLE public.profiling_resident_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.profiling_submissions(id) ON DELETE RESTRICT,
  resident_id uuid NOT NULL REFERENCES public.profiling_residents(id) ON DELETE RESTRICT,
  profile_data jsonb NOT NULL,
  is_minor boolean NOT NULL,
  relationship_to_head text,
  is_household_head boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, resident_id)
);

CREATE TABLE public.profiling_household_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.profiling_households(id) ON DELETE RESTRICT,
  resident_id uuid NOT NULL REFERENCES public.profiling_residents(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date,
  reason text CHECK (reason IS NULL OR length(reason) <= 200),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX profiling_active_membership_key ON public.profiling_household_memberships(resident_id) WHERE effective_to IS NULL;

CREATE TABLE public.profiling_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.profiling_submissions(id) ON DELETE RESTRICT,
  subject_type text NOT NULL CHECK (subject_type IN ('household','adult','guardian')),
  resident_id uuid REFERENCES public.profiling_residents(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('granted','refused','withdrawn')),
  privacy_notice_id uuid NOT NULL REFERENCES public.profiling_privacy_notices(id) ON DELETE RESTRICT,
  consented_by_name text NOT NULL CHECK (length(btrim(consented_by_name)) BETWEEN 1 AND 160),
  guardian_relationship text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  CHECK (subject_type = 'household' OR resident_id IS NOT NULL),
  CHECK (subject_type <> 'guardian' OR length(btrim(guardian_relationship)) >= 1)
);

CREATE TABLE public.profiling_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.profiling_cycles(id) ON DELETE RESTRICT,
  submission_id uuid REFERENCES public.profiling_submissions(id) ON DELETE RESTRICT,
  household_id uuid REFERENCES public.profiling_households(id) ON DELETE RESTRICT,
  resident_id uuid REFERENCES public.profiling_residents(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiling_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.profiling_cycles(id) ON DELETE RESTRICT,
  sitio_id uuid NOT NULL REFERENCES public.barangay_sitios(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','validating','needs_correction','ready','committed','failed')),
  source_type text NOT NULL CHECK (source_type IN ('xlsx','csv')),
  file_hash text NOT NULL CHECK (file_hash ~ '^[a-f0-9]{64}$'),
  template_version text NOT NULL,
  household_row_count integer NOT NULL DEFAULT 0 CHECK (household_row_count >= 0),
  resident_row_count integer NOT NULL DEFAULT 0 CHECK (resident_row_count >= 0),
  fatal_error_count integer NOT NULL DEFAULT 0 CHECK (fatal_error_count >= 0),
  committed_at timestamptz,
  committed_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  staging_purge_after timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, created_by, file_hash)
);
ALTER TABLE public.profiling_submissions
  ADD CONSTRAINT profiling_submissions_import_batch_fk FOREIGN KEY (import_batch_id)
  REFERENCES public.profiling_import_batches(id) ON DELETE RESTRICT;

CREATE TABLE public.profiling_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.profiling_import_batches(id) ON DELETE RESTRICT,
  sheet_name text NOT NULL CHECK (sheet_name IN ('Households','Residents')),
  row_number integer NOT NULL CHECK (row_number >= 2),
  row_key text,
  sanitized_data jsonb,
  excluded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, sheet_name, row_number)
);

CREATE TABLE public.profiling_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.profiling_import_batches(id) ON DELETE RESTRICT,
  import_row_id uuid REFERENCES public.profiling_import_rows(id) ON DELETE RESTRICT,
  sheet_name text CHECK (sheet_name IS NULL OR sheet_name IN ('Households','Residents')),
  row_number integer CHECK (row_number IS NULL OR row_number >= 1),
  field_name text,
  message text NOT NULL,
  is_fatal boolean NOT NULL DEFAULT true,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiling_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.profiling_cycles(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.profiling_import_batches(id) ON DELETE RESTRICT,
  candidate_type text NOT NULL CHECK (candidate_type IN ('household','resident')),
  left_reference text NOT NULL,
  right_reference text NOT NULL,
  confidence numeric(5,4) CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved','distinct','exclude','linked')),
  resolution_reason text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'unresolved' OR length(btrim(resolution_reason)) >= 3)
);

CREATE TABLE public.profiling_evidence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.profiling_cycles(id) ON DELETE RESTRICT,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  aggregate_schema_version text NOT NULL DEFAULT 'agape.profiling.aggregate.v1',
  aggregate_data jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  UNIQUE (cycle_id, content_hash)
);

CREATE INDEX profiling_sitios_barangay_idx ON public.barangay_sitios(barangay_id);
CREATE INDEX profiling_cycles_barangay_status_idx ON public.profiling_cycles(barangay_id, status);
CREATE INDEX profiling_submissions_cycle_status_idx ON public.profiling_submissions(cycle_id, status);
CREATE INDEX profiling_resident_versions_submission_idx ON public.profiling_resident_versions(submission_id);
CREATE INDEX profiling_events_submission_idx ON public.profiling_events(submission_id, created_at);
CREATE INDEX profiling_import_batches_cycle_idx ON public.profiling_import_batches(cycle_id, status);

-- Immutable ledgers and versions.
CREATE OR REPLACE FUNCTION public.phase1_block_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$function$;
CREATE TRIGGER profiling_resident_versions_immutable BEFORE UPDATE OR DELETE ON public.profiling_resident_versions FOR EACH ROW EXECUTE FUNCTION public.phase1_block_immutable_change();
CREATE TRIGGER profiling_consents_immutable BEFORE UPDATE OR DELETE ON public.profiling_consents FOR EACH ROW EXECUTE FUNCTION public.phase1_block_immutable_change();
CREATE TRIGGER profiling_events_immutable BEFORE UPDATE OR DELETE ON public.profiling_events FOR EACH ROW EXECUTE FUNCTION public.phase1_block_immutable_change();
CREATE TRIGGER profiling_evidence_snapshots_immutable BEFORE UPDATE OR DELETE ON public.profiling_evidence_snapshots FOR EACH ROW EXECUTE FUNCTION public.phase1_block_immutable_change();

-- PII and workflow tables have no ordinary PostgREST access. All access is via
-- the narrow functions below, which re-check role, deny override, and scope.
DO $lock_profiling_tables$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'barangay_sitios','mother_leader_sitio_assignments','profiling_privacy_notices','profiling_privacy_settings',
    'profiling_cycles','official_population_snapshots','profiling_sample_units','profiling_code_counters',
    'profiling_households','profiling_residents','profiling_submissions','profiling_resident_versions',
    'profiling_household_memberships','profiling_consents','profiling_events','profiling_import_batches',
    'profiling_import_rows','profiling_import_errors','profiling_duplicate_candidates','profiling_evidence_snapshots'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.phase0_current_account_is_active()) WITH CHECK (public.phase0_current_account_is_active())', 'phase1_active_account_guard', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)', 'phase1_rpc_only', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END;
$lock_profiling_tables$;

COMMIT;
