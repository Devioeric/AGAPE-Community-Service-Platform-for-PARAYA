-- Contributor role consolidation (forward-only).
--
-- The former office, student_org, and department identities remain historical
-- records.  A single active Contributor identity may represent the existing
-- partner entities through contributor_partner_links.  This migration never
-- rewrites proposal authorship or exports authentication credentials.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.role_change_batches') IS NULL
     OR to_regclass('public.role_history') IS NULL
     OR to_regclass('public.partner_entities') IS NULL
     OR to_regclass('public.partner_entity_roles') IS NULL
     OR to_regclass('public.legacy_account_partner_mappings') IS NULL
     OR to_regclass('public.phase2_component_runtime') IS NULL
     OR to_regclass('public.profiling_submissions') IS NULL
     OR to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION
      'Contributor consolidation requires users, role history, and partner foundation tables';
  END IF;
END;
$preflight$;

-- Keep every historical role parseable while allowing the new active role.
DO $roles$
BEGIN
  ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE public.users
    ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY[
      'paraya_director','paraya_associate','paraya_researcher',
      'finance_officer','volunteer','barangay_captain','barangay_secretary',
      'barangay_mother_leader','office','student_org','department',
      'admin','paraya_officer','barangay_official','contributor'
    ]::text[]));

  -- The password flag is an account-state flag, not a historical-role flag.
  -- Recreate the check so a newly provisioned Contributor can complete the
  -- existing first-login password-change flow.
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_historical_password_state_check;
  ALTER TABLE public.users
    ADD CONSTRAINT users_historical_password_state_check CHECK (
      must_change_password IS NOT TRUE
      OR role = ANY (ARRAY[
        'paraya_officer','contributor','finance_officer',
        'barangay_secretary','volunteer','admin'
      ]::text[])
    );
END;
$roles$;

-- Fail closed if an existing database already contains multiple active
-- Contributors; an administrator must reconcile those accounts explicitly.
DO $active_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE role = 'contributor' AND status = 'active' AND is_active IS TRUE
    GROUP BY role
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Contributor consolidation requires exactly one active Contributor account';
  END IF;
END;
$active_guard$;

CREATE UNIQUE INDEX IF NOT EXISTS users_one_active_contributor_idx
  ON public.users(role)
  WHERE role = 'contributor' AND status = 'active' AND is_active IS TRUE;

-- One active account may represent several institutional partner entities.
-- Entity types stay dyci_office, student_organization, or academic_department;
-- this table is an account-to-entity authorization link, not a replacement for
-- the partner foundation or its legacy mappings.
CREATE TABLE IF NOT EXISTS public.contributor_partner_links (
  contributor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partner_entities(id) ON DELETE RESTRICT,
  source_legacy_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','ended')),
  assigned_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  relationship text NOT NULL DEFAULT 'representative'
    CHECK (relationship IN ('representative','legacy_source')),
  created_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contributor_user_id, partner_id),
  CHECK (source_legacy_user_id IS NULL OR source_legacy_user_id <> contributor_user_id),
  CHECK ((status = 'ended') = (ended_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS contributor_partner_links_partner_idx
  ON public.contributor_partner_links(partner_id);
CREATE UNIQUE INDEX IF NOT EXISTS contributor_partner_links_source_idx
  ON public.contributor_partner_links(source_legacy_user_id, partner_id)
  WHERE source_legacy_user_id IS NOT NULL;

-- Keep membership eligibility authoritative in the database. Direct client
-- writes remain revoked, but service-side provisioning and future Admin RPCs
-- must not be able to create an active link to an unsupported or inactive
-- entity, nor attach the link to a non-Contributor account.
CREATE OR REPLACE FUNCTION public.validate_contributor_partner_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
BEGIN
  IF NEW.relationship = 'legacy_source' AND NEW.source_legacy_user_id IS NULL THEN
    RAISE EXCEPTION 'legacy Contributor links require a source identity' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_legacy_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users source_user
    WHERE source_user.id = NEW.source_legacy_user_id
      AND source_user.role IN ('office','student_org','department')
  ) THEN
    RAISE EXCEPTION 'Contributor link source must be a historical institutional identity' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.users contributor
    WHERE contributor.id = NEW.contributor_user_id
      AND contributor.role = 'contributor'
      AND contributor.status = 'active'
      AND contributor.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'active Contributor link requires an active Contributor account' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1
    FROM public.partner_entities entity
    JOIN public.partner_entity_roles entity_role
      ON entity_role.partner_id = entity.id AND entity_role.role = 'proponent'
    WHERE entity.id = NEW.partner_id
      AND entity.lifecycle = 'active'
      AND entity.classification = 'internal'
      AND entity.entity_type IN ('dyci_office','student_organization','academic_department')
  ) THEN
    RAISE EXCEPTION 'active Contributor link requires an eligible active proponent entity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS contributor_partner_links_validate ON public.contributor_partner_links;
CREATE TRIGGER contributor_partner_links_validate
  BEFORE INSERT OR UPDATE ON public.contributor_partner_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_contributor_partner_link();

ALTER TABLE public.contributor_partner_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contributor_partner_links FROM PUBLIC, anon, authenticated;
DO $link_policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contributor_partner_links'
      AND policyname = 'contributor_partner_links_service_only'
  ) THEN
    CREATE POLICY contributor_partner_links_service_only
      ON public.contributor_partner_links AS RESTRICTIVE
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
  END IF;
END;
$link_policy$;

-- Role history is audit evidence.  New cutover and administrator events append
-- rows; corrections are represented by a later event rather than rewriting a
-- historical role transition.
CREATE OR REPLACE FUNCTION public.role_history_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
BEGIN
  RAISE EXCEPTION 'role_history is append-only' USING ERRCODE = '42501';
END;
$function$;

DO $history_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'role_history_append_only_guard'
      AND tgrelid = 'public.role_history'::regclass
  ) THEN
    CREATE TRIGGER role_history_append_only_guard
      BEFORE UPDATE OR DELETE ON public.role_history
      FOR EACH ROW EXECUTE FUNCTION public.role_history_append_only();
  END IF;
END;
$history_trigger$;

-- This helper is intentionally read-only and scope-based.  Route handlers can
-- call it from a security-definer RPC without granting table reads to clients.
CREATE OR REPLACE FUNCTION public.phase2_contributor_has_partner(p_partner_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.contributor_partner_links link
    JOIN public.users actor ON actor.id = link.contributor_user_id
    JOIN public.partner_entities entity ON entity.id = link.partner_id
    WHERE link.contributor_user_id = auth.uid()
      AND link.partner_id = p_partner_id
      AND link.status = 'active'
      AND entity.lifecycle = 'active'
      AND entity.classification = 'internal'
      AND entity.entity_type IN ('dyci_office','student_organization','academic_department')
      AND EXISTS (
        SELECT 1 FROM public.partner_entity_roles entity_role
        WHERE entity_role.partner_id = link.partner_id AND entity_role.role = 'proponent'
      )
      AND actor.role = 'contributor'
      AND actor.status = 'active'
      AND actor.is_active IS TRUE
      AND EXISTS (
        SELECT 1 FROM public.phase2_component_runtime runtime
        WHERE runtime.component = 'proposals'
          AND (runtime.mode <> 'synthetic'
            OR (actor.is_synthetic_test IS TRUE AND actor.id = ANY(runtime.synthetic_user_ids)))
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.phase2_contributor_has_partner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase2_contributor_has_partner(uuid) TO authenticated, service_role;

-- Keep SQL authorization parity with the active TypeScript role model.
CREATE OR REPLACE FUNCTION public.phase0_current_account_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users account
    WHERE account.id = auth.uid()
      AND account.status = 'active'
      AND account.is_active IS TRUE
      AND account.role IN (
        'paraya_officer','contributor','finance_officer',
        'barangay_secretary','volunteer','admin'
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.phase1_permission_module(p_capability text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $function$
  SELECT CASE
    WHEN p_capability LIKE 'admin.users.%' THEN 'user_management'
    WHEN p_capability LIKE 'admin.audit.%' THEN 'audit_logs'
    WHEN p_capability LIKE 'admin.recovery.%' THEN 'backup'
    WHEN p_capability LIKE 'legacy_partner.%' THEN 'historical_records'
    WHEN p_capability = 'contributor.partner.read' THEN 'partnerships'
    WHEN p_capability = 'contributor.budget.prepare' OR p_capability LIKE 'budget.%' THEN 'budgets'
    WHEN p_capability LIKE 'contributor.proposal.%' OR p_capability LIKE 'proposal.%' THEN 'proposals'
    WHEN p_capability LIKE 'program.%' THEN 'programs'
    WHEN p_capability LIKE 'partner.document.%' THEN 'partner_documents'
    WHEN p_capability LIKE 'partnership.%' OR p_capability LIKE 'partner.%' THEN 'partnerships'
    WHEN p_capability LIKE 'historical_program.%' THEN 'historical_programs'
    WHEN p_capability LIKE 'budget.%' THEN 'budgets'
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
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.phase1_role_has_capability(p_role text, p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $function$
  SELECT CASE
    WHEN p_role = 'contributor' THEN p_capability = ANY (ARRAY[
      'contributor.partner.read','contributor.proposal.read','contributor.proposal.create',
      'contributor.proposal.revise','contributor.proposal.edit','contributor.proposal.submit','contributor.budget.prepare'
    ]::text[])
    WHEN p_role = 'paraya_officer' THEN p_capability = ANY (ARRAY[
      'partnership.read','partnership.manage','partner.contact.read','partner.contact.manage',
      'partner.document.read','partner.document.manage','partner.renew','partner.policy.manage',
      'partner.legacy_mapping.manage','historical_program.read','historical_program.create',
      'historical_program.import','historical_program.review','proposal.read','proposal.create',
      'proposal.review','proposal.validation.record','proposal.decide','proposal.catalog.manage',
      'proposal.submit','proposal.evidence.confirm','proposal.handoff','program.read','program.manage',
      'budget.read','budget.prepare','budget.actual.record','budget.category.manage',
      'integrity.finance.read','integrity.finance.request','volunteer.directory.read','volunteer.manage',
      'volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review','survey.read',
      'survey.manage','survey.analyze','community_need.read','community_need.submit',
      'community_need.validate','community_need.manage','observation.read','observation.manage',
      'skill_asset.read','skill_asset.manage','attendance.manage','activity_log.manage','donation.read',
      'donation.manage','impact.read','impact.manage','analytics.aggregate.read','report.read',
      'report.manage','communication.read','communication.write','communication.manage',
      'communication.moderate','ai.assist','ai.recommendation.review','ai.recommendation.configure',
      'profiling.cycle.manage','profiling.collect','profiling.validate','profiling.acknowledge',
      'profiling.endorse','profiling.detail.read','profiling.aggregate.read','profiling.privacy.configure'
    ]::text[])
    WHEN p_role = 'finance_officer' THEN p_capability = ANY (ARRAY[
      'proposal.read','proposal.finance','budget.read','budget.review',
      'budget.liquidation.review','integrity.finance.read','integrity.finance.request'
    ]::text[])
    WHEN p_role = 'volunteer' THEN p_capability = ANY (ARRAY[
      'program.read','volunteer.self','volunteer.preferences.manage','survey.read','survey.respond',
      'attendance.self','activity_log.self','communication.read','communication.write','ai.assist'
    ]::text[])
    WHEN p_role = 'barangay_secretary' THEN p_capability = ANY (ARRAY[
      'partnership.read','historical_program.read','proposal.validation.record','survey.read',
      'survey.respond','community_need.read','community_need.submit','observation.read','skill_asset.read',
      'skill_asset.manage','report.read','communication.read','communication.write','ai.assist',
      'profiling.collect','profiling.detail.read','profiling.aggregate.read','profiling.acknowledge'
    ]::text[])
    WHEN p_role = 'admin' THEN p_capability = ANY (ARRAY[
      'admin.users.manage','admin.audit.read','admin.recovery.read','integrity.provider.manage',
      'communication.provider.manage'
    ]::text[])
    WHEN p_role IN ('office','student_org','department') THEN p_capability = 'legacy_partner.history.read'
    ELSE false
  END;
$function$;

-- Phase 2 uses its own permission-module resolver when evaluating deny-only
-- overrides. Keep the Contributor capability namespaces aligned with the
-- application and phase-1 resolver so an administrator can subtract access
-- from the correct module without accidentally treating every Contributor
-- capability as a proposal permission.
CREATE OR REPLACE FUNCTION public.phase2_permission_module(p_capability text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $function$
  SELECT CASE
    WHEN p_capability LIKE 'integrity.%' THEN 'financial_integrity'
    WHEN p_capability = 'communication.provider.manage' THEN 'communication'
    WHEN p_capability LIKE 'partner.document.%' THEN 'partner_documents'
    WHEN p_capability = 'contributor.partner.read' THEN 'partnerships'
    WHEN p_capability = 'contributor.budget.prepare' OR p_capability LIKE 'budget.%' THEN 'budgets'
    WHEN p_capability LIKE 'contributor.proposal.%' OR p_capability LIKE 'proposal.%' THEN 'proposals'
    WHEN p_capability LIKE 'partner.%' OR p_capability LIKE 'partnership.%' THEN 'partnerships'
    WHEN p_capability LIKE 'historical_program.%' THEN 'historical_programs'
    ELSE public.phase1_permission_module(p_capability)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text, p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $function$
  SELECT public.phase1_role_has_capability(p_role, p_capability)
    OR (p_role = 'paraya_officer' AND p_capability = ANY (ARRAY[
      'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage',
      'partner.renew','partner.policy.manage','partner.legacy_mapping.manage','historical_program.read',
      'historical_program.create','historical_program.import','historical_program.review',
      'proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff',
      'budget.read','budget.prepare','budget.actual.record','budget.category.manage',
      'ai.recommendation.review','ai.recommendation.configure','volunteer.match.read',
      'volunteer.invitation.manage','volunteer.waitlist.review','integrity.finance.read',
      'integrity.finance.request'
    ]::text[]));
$function$;

-- Controlled Contributor cutover.  It is intentionally separate from the
-- existing PARAYA Officer RPC, whose source-role contract remains unchanged.
CREATE OR REPLACE FUNCTION public.phase_role_cutover_contributor(
  p_canonical_user_id uuid,
  p_source_account_ids uuid[],
  p_backup_manifest_hash text,
  p_verification jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  batch_id uuid;
  source_id uuid;
  canonical public.users%ROWTYPE;
  source public.users%ROWTYPE;
  source_count integer;
  link_count integer := 0;
  released_lock_count integer := 0;
  actor_id uuid;
BEGIN
  -- The users table has a defensive trigger that rejects privileged column
  -- changes from any request carrying an end-user auth.uid().  Cutover must
  -- therefore run through the audited server-side service-role script only;
  -- an Admin UI cannot invoke this identity migration directly.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Contributor cutover requires the controlled service-role process' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO canonical FROM public.users WHERE id = p_canonical_user_id FOR UPDATE;
  IF canonical.id IS NULL OR canonical.role <> 'contributor'
     OR canonical.status <> 'active' OR canonical.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'canonical Contributor must be active' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_backup_manifest_hash, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'role cutover requires a backup manifest hash' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_verification) IS DISTINCT FROM 'object'
     OR p_verification - ARRAY['sourceAccountsChecked','authSessionsRevoked','partnerMappingsChecked','plaintextCredentials','actorUserId'] <> '{}'::jsonb
     OR p_verification->'sourceAccountsChecked' IS DISTINCT FROM 'true'::jsonb
     OR p_verification->'authSessionsRevoked' IS DISTINCT FROM 'true'::jsonb
     OR p_verification->'partnerMappingsChecked' IS DISTINCT FROM 'true'::jsonb
     OR p_verification->'plaintextCredentials' IS DISTINCT FROM 'false'::jsonb
     OR coalesce(p_verification->>'actorUserId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'cutover verification must contain only verified safety flags' USING ERRCODE = '22023';
  END IF;
  actor_id := (p_verification->>'actorUserId')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.users operator
    WHERE operator.id = actor_id AND operator.role = 'admin'
      AND operator.status = 'active' AND operator.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Contributor cutover requires an active administrator migration actor' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_source_account_ids, 1), 0) < 3
     OR (SELECT count(*) FROM (SELECT DISTINCT unnest(p_source_account_ids)) distinct_ids)
        <> array_length(p_source_account_ids, 1) THEN
    RAISE EXCEPTION 'Contributor cutover requires at least three distinct source accounts' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users active
    WHERE active.role = 'contributor' AND active.status = 'active'
      AND active.is_active IS TRUE AND active.id <> canonical.id
  ) THEN
    RAISE EXCEPTION 'another active Contributor account already exists' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.users source_user
    JOIN public.legacy_account_partner_mappings mapping
      ON mapping.legacy_user_id = source_user.id
    JOIN public.partner_entities entity
      ON entity.id = mapping.partner_id
    WHERE source_user.id = ANY(p_source_account_ids)
      AND (entity.lifecycle <> 'active'
        OR entity.entity_type NOT IN ('dyci_office','student_organization','academic_department')
        OR NOT EXISTS (
          SELECT 1 FROM public.partner_entity_roles entity_role
          WHERE entity_role.partner_id = entity.id AND entity_role.role = 'proponent'
        ))
  ) THEN
    RAISE EXCEPTION 'every source mapping must target an active proponent institutional entity' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.role_change_batches previous_batch
    WHERE previous_batch.target_role = 'contributor'
      AND previous_batch.canonical_user_id = canonical.id
      AND previous_batch.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Contributor cutover has already completed for this canonical account' USING ERRCODE = '23505';
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.users WHERE id = ANY(p_source_account_ids) AND role = 'office')
    AND EXISTS (SELECT 1 FROM public.users WHERE id = ANY(p_source_account_ids) AND role = 'student_org')
    AND EXISTS (SELECT 1 FROM public.users WHERE id = ANY(p_source_account_ids) AND role = 'department')
  ) THEN
    RAISE EXCEPTION 'source accounts must include office, student_org, and department identities' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users source_user
    WHERE source_user.id = ANY(p_source_account_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.legacy_account_partner_mappings mapping
        WHERE mapping.legacy_user_id = source_user.id
      )
  ) THEN
    RAISE EXCEPTION 'every source account must have a legacy partner mapping' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.users remaining
    WHERE remaining.role IN ('office','student_org','department')
      AND remaining.status = 'active'
      AND remaining.is_active IS TRUE
      AND NOT (remaining.id = ANY(p_source_account_ids))
  ) THEN
    RAISE EXCEPTION 'all active institutional identities must be included in the Contributor cutover source list' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(DISTINCT mapping.partner_id)
      FROM public.legacy_account_partner_mappings mapping
      JOIN public.users source_user ON source_user.id = mapping.legacy_user_id
      JOIN public.partner_entities partner ON partner.id = mapping.partner_id
      WHERE source_user.id = ANY(p_source_account_ids)
        AND partner.classification = 'internal'
        AND partner.lifecycle <> 'merged'
        AND partner.entity_type = CASE source_user.role
          WHEN 'office' THEN 'dyci_office'
          WHEN 'student_org' THEN 'student_organization'
          WHEN 'department' THEN 'academic_department'
        END) < 3 THEN
    RAISE EXCEPTION 'source partner mappings must preserve all three institutional entity types' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.legacy_account_partner_mappings mapping
      WHERE mapping.legacy_user_id = ANY(p_source_account_ids))
     <> (SELECT count(DISTINCT mapping.partner_id) FROM public.legacy_account_partner_mappings mapping
         WHERE mapping.legacy_user_id = ANY(p_source_account_ids)) THEN
    RAISE EXCEPTION 'each source partner mapping must identify a distinct institutional entity' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.role_change_batches(
    target_role, canonical_user_id, source_roles, source_account_ids,
    backup_manifest_hash, migration_version, status, verification
  ) VALUES (
    'contributor', canonical.id,
    ARRAY['office','student_org','department'], p_source_account_ids,
    btrim(p_backup_manifest_hash), '20260928001250', 'started',
    coalesce(p_verification, '{}'::jsonb)
  ) RETURNING id INTO batch_id;

  FOREACH source_id IN ARRAY p_source_account_ids LOOP
    SELECT * INTO source FROM public.users WHERE id = source_id FOR UPDATE;
    IF source.id IS NULL OR source.role NOT IN ('office','student_org','department') THEN
      RAISE EXCEPTION 'source account is not an institutional contributor identity' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.role_history(
      user_id, previous_role, new_role, effective_start, effective_end,
      change_reason, cutover_batch_id, actor_id, source_status, target_status
    ) VALUES (
      source.id, source.role, 'contributor', now(), now(),
      'Institutional contributor role consolidation', batch_id, actor_id,
      source.status, 'suspended'
    );

    -- Do not leave an editable profiling package locked to an identity that
    -- is being retired.  Authorship stays on the original submission; the
    -- next authorized actor must claim it through the normal row-versioned
    -- workflow.  The aggregate count is recorded without copying resident
    -- fields into the cutover metadata.
    UPDATE public.profiling_submissions
    SET current_editor_id = NULL, row_version = row_version + 1, updated_at = now()
    WHERE current_editor_id = source.id
      AND status IN ('draft','returned');
    GET DIAGNOSTICS released_lock_count = ROW_COUNT;
    IF released_lock_count > 0 THEN
      INSERT INTO public.audit_logs(
        user_id, user_email, action, resource_type, resource_id, level, metadata
      )
      SELECT actor_id, operator.email, 'Contributor cutover released ownership locks',
        'profiling_submissions', source.id::text, 'warning',
        jsonb_build_object('source_user_id', source.id, 'released_lock_count', released_lock_count,
          'cutover_batch_id', batch_id)
      FROM public.users operator
      WHERE operator.id = actor_id;
    END IF;

    -- Preserve the old role and identity for historical attribution; only the
    -- account state changes, and Auth session revocation is performed by the
    -- companion server-side cutover script.
    UPDATE public.users
    SET status = 'suspended', is_active = false, must_change_password = false, updated_at = now()
    WHERE id = source.id;

    INSERT INTO public.contributor_partner_links(
      contributor_user_id, partner_id, source_legacy_user_id, status,
      assigned_by, assigned_at, relationship, created_by, updated_at
    )
    SELECT canonical.id, mapping.partner_id, source.id, 'active',
      actor_id, now(), 'legacy_source', actor_id, now()
    FROM public.legacy_account_partner_mappings mapping
    WHERE mapping.legacy_user_id = source.id
    ON CONFLICT (contributor_user_id, partner_id) DO UPDATE
      SET source_legacy_user_id = EXCLUDED.source_legacy_user_id,
          status = 'active', ended_at = NULL, assigned_by = EXCLUDED.assigned_by,
          assigned_at = EXCLUDED.assigned_at, relationship = EXCLUDED.relationship,
          updated_at = now();
    GET DIAGNOSTICS source_count = ROW_COUNT;
    link_count := link_count + source_count;
  END LOOP;

  INSERT INTO public.role_history(
    user_id, previous_role, new_role, change_reason, cutover_batch_id,
    actor_id, source_status, target_status
  ) VALUES (
    canonical.id, NULL, 'contributor', 'Institutional contributor canonical account',
    batch_id, actor_id, canonical.status, 'active'
  );

  IF (SELECT count(*) FROM public.contributor_partner_links
      WHERE contributor_user_id = canonical.id AND status = 'active')
     <> (SELECT count(DISTINCT mapping.partner_id)
         FROM public.legacy_account_partner_mappings mapping
         WHERE mapping.legacy_user_id = ANY(p_source_account_ids)) THEN
    RAISE EXCEPTION 'Contributor cutover did not preserve every distinct active partner link, received %',
      (SELECT count(*) FROM public.contributor_partner_links WHERE contributor_user_id = canonical.id AND status = 'active')
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.users
  SET must_change_password = true, updated_at = now()
  WHERE id = canonical.id;

  UPDATE public.role_change_batches
  SET status = 'completed', completed_at = now(),
      verification = coalesce(p_verification, '{}'::jsonb)
        || jsonb_build_object('contributorPartnerLinks', link_count)
  WHERE id = batch_id;

  RETURN batch_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase_role_cutover_contributor(uuid, uuid[], text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phase_role_cutover_contributor(uuid, uuid[], text, jsonb) TO service_role;

-- The earlier PARAYA consolidation function was originally granted to the
-- authenticated role for its one-time cutover.  Once the active role model is
-- consolidated, leaving that grant in place would let an ordinary Officer
-- invoke an identity-migration RPC with a forged backup marker.  Both role
-- cutovers are operator-only and must run through their audited service-role
-- scripts; historical grants are revoked forward-only here.
DO $old_cutover_guard$
BEGIN
  IF to_regprocedure('public.phase_role_cutover(uuid,uuid[],text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.phase_role_cutover(uuid, uuid[], text, jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.phase_role_cutover(uuid, uuid[], text, jsonb) TO service_role';
  END IF;
END;
$old_cutover_guard$;

COMMENT ON TABLE public.contributor_partner_links IS
  'Maps the single active Contributor identity to preserved office, student organization, and department partner entities; legacy identity and authorship remain unchanged.';
COMMENT ON FUNCTION public.phase_role_cutover_contributor(uuid, uuid[], text, jsonb) IS
  'Controlled, backup-gated consolidation of office, student_org, and department identities into one Contributor account. Auth session revocation is performed by the server-side cutover process.';

COMMIT;
