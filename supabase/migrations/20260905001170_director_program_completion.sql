BEGIN;

-- Confirmed 2026-09-05: completion checks are mandatory. Existing completed
-- rows are grandfathered; no historical evidence is manufactured or rechecked.
ALTER TABLE public.programs
 ADD COLUMN completion_verified_at timestamptz,
 ADD COLUMN completion_evidence_version bigint NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.programs.completion_verified_at IS 'Set only by a successful post-2026-09-05 completion transition; null on historical completed rows.';
COMMENT ON COLUMN public.programs.completion_evidence_version IS 'Internal synchronization counter for completion evidence writes.';

-- The legacy generic-write guard originally used JWT claims to distinguish
-- trusted calls. That also blocked private signup/evidence counter updates
-- executed by definer workflows with an authenticated JWT. Actual SQL invoker
-- identity is not request-controlled: retain every direct-write allowlist while
-- allowing authorized private definer functions to synchronize their parent.
CREATE OR REPLACE FUNCTION public.guard_phase0_workflow_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  claim_role text;
  actor_id uuid;
  payload jsonb;
  previous_payload jsonb;
  allowed_columns text[];
  changed_columns text[];
BEGIN
  claim_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.role()
  );
  actor_id := auth.uid();

  -- Database-owner and service-role workflows are authorized in trusted server
  -- code. The trigger constrains direct anon/authenticated PostgREST requests.
  IF current_user::text NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF actor_id IS NULL OR NOT public.phase0_current_account_is_paraya() THEN
    RAISE EXCEPTION
      'Only an active PARAYA officer may mutate this record directly'
      USING ERRCODE = '42501';
  END IF;

  payload := to_jsonb(NEW);

  IF TG_OP = 'INSERT' THEN
    IF payload ->> 'created_by' IS DISTINCT FROM actor_id::text THEN
      RAISE EXCEPTION
        'created_by must match the authenticated PARAYA officer'
        USING ERRCODE = '42501';
    END IF;

    IF TG_TABLE_NAME = 'project_proposals' THEN
      IF payload ->> 'status' IS DISTINCT FROM 'draft'
         OR COALESCE((payload ->> 'finance_clearance')::boolean, false)
         OR payload ->> 'finance_cleared_at' IS NOT NULL
         OR payload ->> 'finance_cleared_by' IS NOT NULL
         OR payload ->> 'finance_notes' IS NOT NULL
         OR payload ->> 'prescreening_passed' IS NOT NULL
         OR payload ->> 'prescreening_checks' IS NOT NULL
         OR payload ->> 'prescreening_ran_at' IS NOT NULL
         OR COALESCE((payload ->> 'community_validated')::boolean, false)
         OR payload ->> 'community_validation_notes' IS NOT NULL
         OR payload ->> 'community_validated_at' IS NOT NULL
         OR payload ->> 'community_validated_by' IS NOT NULL
         OR payload ->> 'reviewed_by' IS NOT NULL
         OR payload ->> 'reviewed_at' IS NOT NULL
         OR payload ->> 'approved_by' IS NOT NULL
         OR payload ->> 'approved_at' IS NOT NULL
         OR payload ->> 'rejected_by' IS NOT NULL
         OR payload ->> 'rejected_at' IS NOT NULL
         OR COALESCE((payload ->> 'revision_count')::integer, 0) <> 0
         OR payload ->> 'revision_requested_from' IS NOT NULL
      THEN
        RAISE EXCEPTION
          'New proposals must start as unreviewed drafts without finance or approval state'
          USING ERRCODE = '42501';
      END IF;
    ELSIF TG_TABLE_NAME = 'programs' AND payload ->> 'status' IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION
        'Direct program inserts must start as drafts'
        USING ERRCODE = '42501';
    ELSIF TG_TABLE_NAME = 'program_activities' THEN
      IF payload ->> 'status' NOT IN ('planned', 'ongoing', 'completed', 'cancelled')
         OR payload ->> 'approval_status' IS DISTINCT FROM 'approved'
         OR payload ->> 'approved_by' IS NOT NULL
         OR payload ->> 'approved_at' IS NOT NULL
         OR payload ->> 'approval_notes' IS NOT NULL
         OR payload ->> 'attendance_otp' IS NOT NULL
         OR payload ->> 'attendance_otp_expires_at' IS NOT NULL
         OR payload ->> 'attendance_otp_issued_at' IS NOT NULL
         OR payload ->> 'attendance_otp_issued_by' IS NOT NULL
         OR COALESCE((payload ->> 'volunteer_count')::integer, 0) <> 0
         OR COALESCE((payload ->> 'beneficiary_count')::integer, 0) <> 0
         OR payload ->> 'report_1' IS NOT NULL
         OR payload ->> 'report_2' IS NOT NULL
      THEN
        RAISE EXCEPTION
          'New activities cannot set approval, attendance, count, report, or audit state'
          USING ERRCODE = '42501';
      END IF;
    ELSIF TG_TABLE_NAME = 'program_budgets' THEN
      IF payload ->> 'approval_status' IS DISTINCT FROM 'approved'
         OR payload ->> 'approved_by' IS NOT NULL
         OR payload ->> 'approved_at' IS NOT NULL
         OR payload ->> 'approval_notes' IS NOT NULL
      THEN
        RAISE EXCEPTION
          'New budget lines cannot set approval or audit state'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  previous_payload := to_jsonb(OLD);
  CASE TG_TABLE_NAME
    WHEN 'project_proposals' THEN
      allowed_columns := ARRAY[
        'title',
        'rationale',
        'objectives',
        'target_beneficiaries',
        'expected_beneficiary_count',
        'expected_output',
        'timeline_start',
        'timeline_end',
        'budget',
        'barangay_id',
        'is_income_generating',
        'informed_by_proposals',
        'updated_at'
      ];

      IF previous_payload ->> 'status' NOT IN ('draft', 'revisions_requested') THEN
        RAISE EXCEPTION
          'Proposal content can be edited directly only while draft or revisions are requested'
          USING ERRCODE = '42501';
      END IF;
    WHEN 'programs' THEN
      allowed_columns := ARRAY[
        'title',
        'description',
        'barangay_id',
        'start_date',
        'end_date',
        'status',
        'max_volunteers',
        'updated_at'
      ];
    WHEN 'program_activities' THEN
      allowed_columns := ARRAY[
        'title',
        'description',
        'date',
        'location',
        'status',
        'report_1',
        'report_2',
        'updated_at'
      ];
    WHEN 'program_budgets' THEN
      allowed_columns := ARRAY[
        'category',
        'allocated',
        'spent',
        'notes',
        'updated_at'
      ];
    ELSE
      RAISE EXCEPTION 'Unsupported Phase 0 workflow table' USING ERRCODE = '42501';
  END CASE;

  SELECT array_agg(column_name ORDER BY column_name)
    INTO changed_columns
    FROM jsonb_object_keys(payload) AS columns(column_name)
   WHERE NOT (column_name = ANY (allowed_columns))
     AND (previous_payload -> column_name)
         IS DISTINCT FROM
         (payload -> column_name);

  IF COALESCE(cardinality(changed_columns), 0) > 0 THEN
    RAISE EXCEPTION
      'Workflow-controlled columns cannot be changed through a generic update'
      USING
        ERRCODE = '42501',
        DETAIL = format(
          'Protected columns in this update: %s',
          array_to_string(changed_columns, ', ')
        ),
        HINT = 'Use the dedicated human workflow action.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.phase8_program_completion_missing(p_program_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE missing text[]:='{}'; activity_count bigint; budget_count bigint; allocated numeric; spent numeric;
BEGIN
 SELECT count(*) INTO activity_count FROM public.program_activities WHERE program_id=p_program_id;
 IF activity_count=0 THEN missing:=array_append(missing,'activities'); END IF;
 IF EXISTS(SELECT 1 FROM public.program_activities WHERE program_id=p_program_id
   AND (coalesce(report_1,'') !~ '[^[:space:]]' OR coalesce(report_2,'') !~ '[^[:space:]]')) THEN
  missing:=array_append(missing,'activity_reports');
 END IF;
 IF EXISTS(SELECT 1 FROM public.program_activities a WHERE a.program_id=p_program_id
   AND NOT EXISTS(SELECT 1 FROM public.activity_photos photo WHERE photo.activity_id=a.id)) THEN
  missing:=array_append(missing,'activity_photos');
 END IF;
 SELECT count(*),coalesce(sum(b.allocated),0),coalesce(sum(b.spent),0) INTO budget_count,allocated,spent
  FROM public.program_budgets b WHERE b.program_id=p_program_id;
 IF budget_count=0 THEN missing:=array_append(missing,'budget_items'); END IF;
 IF spent>allocated THEN missing:=array_append(missing,'budget_balance'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.program_signups WHERE program_id=p_program_id AND status<>'withdrawn') THEN
  missing:=array_append(missing,'volunteer_signups');
 END IF;
 RETURN missing;
END;
$function$;

CREATE FUNCTION public.phase8_assert_program_completion(p_program_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE missing text[];
BEGIN
 missing:=public.phase8_program_completion_missing(p_program_id);
 IF cardinality(missing)>0 THEN
  RAISE EXCEPTION 'Program completion prerequisites are not satisfied'
   USING ERRCODE='23514',DETAIL=array_to_string(missing,','),
   HINT='Complete the required activity reports, photos, budget and volunteer evidence, or reopen the program before removing required evidence.';
 END IF;
END;
$function$;

CREATE FUNCTION public.phase8_guard_program_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.completion_verified_at:=NULL;
  NEW.completion_evidence_version:=0;
  IF NEW.status='completed' THEN
   -- A new parent has no valid child evidence yet. The same predicate catches
   -- insert-completed bypasses, including service/admin generic API requests.
   PERFORM public.phase8_assert_program_completion(NEW.id);
   NEW.completion_verified_at:=clock_timestamp();
  END IF;
 ELSE
  -- A client cannot clear or forge the historical/new-completion distinction.
  NEW.completion_verified_at:=OLD.completion_verified_at;
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
   PERFORM public.phase8_assert_program_completion(NEW.id);
   NEW.completion_verified_at:=clock_timestamp();
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER phase8_program_completion_guard BEFORE INSERT OR UPDATE ON public.programs
 FOR EACH ROW EXECUTE FUNCTION public.phase8_guard_program_completion();

CREATE FUNCTION public.phase8_sync_program_completion_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE old_parent uuid; new_parent uuid; parent_id uuid; parent_status text; verified_at timestamptz;
BEGIN
 IF TG_TABLE_NAME='activity_photos' THEN
  IF TG_OP<>'INSERT' THEN SELECT program_id INTO old_parent FROM public.program_activities WHERE id=OLD.activity_id; END IF;
  IF TG_OP<>'DELETE' THEN SELECT program_id INTO new_parent FROM public.program_activities WHERE id=NEW.activity_id; END IF;
  -- Activity cascades can remove their parent row before photo DELETE fires;
  -- the activity's own trigger already owns the program lock and final check.
 ELSE
  IF TG_OP<>'INSERT' THEN old_parent:=OLD.program_id; END IF;
  IF TG_OP<>'DELETE' THEN new_parent:=NEW.program_id; END IF;
 END IF;
 FOR parent_id IN SELECT DISTINCT value FROM unnest(ARRAY[old_parent,new_parent]) value WHERE value IS NOT NULL ORDER BY value LOOP
  IF TG_WHEN='BEFORE' THEN
   -- A real parent write, not merely an advisory/read lock, also protects
   -- repeatable-read clients from completing against an obsolete snapshot.
   UPDATE public.programs SET completion_evidence_version=completion_evidence_version+1 WHERE id=parent_id;
  ELSE
   SELECT status,completion_verified_at INTO parent_status,verified_at FROM public.programs WHERE id=parent_id FOR UPDATE;
   IF parent_status='completed' AND verified_at IS NOT NULL THEN
    PERFORM public.phase8_assert_program_completion(parent_id);
   END IF;
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$function$;

-- Evidence remains editable. Required completeness is retained for newly
-- verified completed programs; a deliberate reopen permits incomplete edits.
-- No permanent archive state, date cutoff or extra activity status is imposed.
CREATE TRIGGER phase8_completion_evidence_lock BEFORE INSERT OR UPDATE OR DELETE ON public.program_activities
 FOR EACH ROW EXECUTE FUNCTION public.phase8_sync_program_completion_evidence();
CREATE TRIGGER phase8_completion_evidence_check AFTER INSERT OR UPDATE OR DELETE ON public.program_activities
 FOR EACH ROW EXECUTE FUNCTION public.phase8_sync_program_completion_evidence();
CREATE TRIGGER phase8_completion_evidence_lock BEFORE INSERT OR UPDATE OR DELETE ON public.activity_photos
 FOR EACH ROW EXECUTE FUNCTION public.phase8_sync_program_completion_evidence();
CREATE TRIGGER phase8_completion_evidence_check AFTER INSERT OR UPDATE OR DELETE ON public.activity_photos
 FOR EACH ROW EXECUTE FUNCTION public.phase8_sync_program_completion_evidence();
CREATE TRIGGER phase8_completion_evidence_lock BEFORE INSERT OR UPDATE OR DELETE ON public.program_budgets
 FOR EACH ROW EXECUTE FUNCTION public.phase8_sync_program_completion_evidence();
CREATE TRIGGER phase8_completion_evidence_check AFTER INSERT OR UPDATE OR DELETE ON public.program_budgets
 FOR EACH ROW EXECUTE FUNCTION public.phase8_sync_program_completion_evidence();
CREATE TRIGGER phase8_completion_evidence_lock BEFORE INSERT OR UPDATE OR DELETE ON public.program_signups
 FOR EACH ROW EXECUTE FUNCTION public.phase8_sync_program_completion_evidence();
CREATE TRIGGER phase8_completion_evidence_check AFTER INSERT OR UPDATE OR DELETE ON public.program_signups
 FOR EACH ROW EXECUTE FUNCTION public.phase8_sync_program_completion_evidence();

REVOKE ALL ON FUNCTION public.phase8_program_completion_missing(uuid),public.phase8_assert_program_completion(uuid),
 public.phase8_guard_program_completion(),public.phase8_sync_program_completion_evidence()
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
