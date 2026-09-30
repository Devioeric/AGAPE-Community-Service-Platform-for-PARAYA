-- Barangay-level community profiles: aggregate counts taken from a barangay's
-- profiling report. No resident or household records. The indicator catalog
-- and strict validation live in src/lib/community-profile/.
CREATE TABLE public.barangay_community_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id uuid NOT NULL UNIQUE REFERENCES public.barangays(id) ON DELETE RESTRICT,
  schema_version text NOT NULL DEFAULT 'agape.community-profile.v1'
    CHECK (schema_version = 'agape.community-profile.v1'),
  coverage text CHECK (coverage IS NULL OR length(btrim(coverage)) BETWEEN 1 AND 240),
  source_title text NOT NULL CHECK (length(btrim(source_title)) BETWEEN 2 AND 240),
  collected_on date,
  respondent_households integer CHECK (respondent_households IS NULL OR respondent_households BETWEEN 0 AND 1000000),
  individuals integer CHECK (individuals IS NULL OR individuals BETWEEN 0 AND 1000000),
  notes text CHECK (notes IS NULL OR length(notes) <= 4000),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 262144),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.barangay_community_profiles IS
  'One aggregate community profile per barangay (counts only). Access is through capability-checked API routes using the service role.';

ALTER TABLE public.barangay_community_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phase0_active_account_guard ON public.barangay_community_profiles;
CREATE POLICY phase0_active_account_guard ON public.barangay_community_profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.phase0_current_account_is_active())) WITH CHECK ((SELECT public.phase0_current_account_is_active()));
DROP POLICY IF EXISTS phase1_deny_override_guard ON public.barangay_community_profiles;
CREATE POLICY phase1_deny_override_guard ON public.barangay_community_profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.phase1_current_permission_module_allowed('profiling')) WITH CHECK (public.phase1_current_permission_module_allowed('profiling'));
DROP POLICY IF EXISTS phase1_rpc_only ON public.barangay_community_profiles;
CREATE POLICY phase1_rpc_only ON public.barangay_community_profiles FOR ALL TO authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.barangay_community_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.barangay_community_profiles TO service_role;
