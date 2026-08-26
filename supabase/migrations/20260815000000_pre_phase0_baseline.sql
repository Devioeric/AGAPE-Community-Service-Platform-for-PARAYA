-- AGAPE private pre-Phase-0 baseline candidate; not approved for deployment.

-- Derived from validated authoritative schema-only capture.

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."get_user_barangay"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT barangay_id FROM users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_barangay"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'volunteer')
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_community_validated"("p_proposal_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  primary_met       BOOLEAN := FALSE;
  supplementary_met BOOLEAN := FALSE;
  has_any_signal    BOOLEAN := FALSE;
BEGIN
  -- ── Primary path: ≥ 2 linked records of any type ────────────────────────
  SELECT (
    (SELECT COUNT(*) FROM public.proposal_validation_links l
      WHERE l.proposal_id = p_proposal_id) >= 2
  ) INTO primary_met;

  -- ── Supplementary path: uploaded evidence + stakeholders ────────────────
  -- Any single validation event with ≥1 file AND ≥3 stakeholders.
  SELECT EXISTS (
    SELECT 1
      FROM public.proposal_validations v
      LEFT JOIN public.proposal_validation_evidence     e ON e.validation_id = v.id
      LEFT JOIN public.proposal_validation_stakeholders s ON s.validation_id = v.id
     WHERE v.proposal_id = p_proposal_id
     GROUP BY v.id
     HAVING COUNT(DISTINCT e.id) >= 1
        AND COUNT(DISTINCT s.id) >= 3
  ) INTO supplementary_met;

  -- ── Don't clobber legacy state for proposals with no new-style records ──
  SELECT (
    EXISTS (SELECT 1 FROM public.proposal_validation_links l WHERE l.proposal_id = p_proposal_id)
    OR EXISTS (SELECT 1 FROM public.proposal_validations v   WHERE v.proposal_id = p_proposal_id)
  ) INTO has_any_signal;

  IF NOT has_any_signal THEN
    RETURN;
  END IF;

  UPDATE public.project_proposals
     SET community_validated     = (primary_met OR supplementary_met),
         community_validated_at  = CASE WHEN (primary_met OR supplementary_met)
                                        THEN now() ELSE community_validated_at END,
         community_validated_by  = CASE WHEN (primary_met OR supplementary_met)
                                        THEN COALESCE(auth.uid(), community_validated_by)
                                        ELSE community_validated_by END
   WHERE id = p_proposal_id;
END;
$$;


ALTER FUNCTION "public"."recompute_community_validated"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_recompute_community_validated"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  affected_proposal UUID;
BEGIN
  -- Resolve the proposal_id depending on which table fired the trigger.
  IF TG_TABLE_NAME = 'proposal_validations' THEN
    IF (TG_OP = 'DELETE') THEN
      affected_proposal := OLD.proposal_id;
    ELSE
      affected_proposal := NEW.proposal_id;
    END IF;
  ELSE
    -- Stakeholders / evidence: look up through validation
    DECLARE
      v_id UUID;
    BEGIN
      IF (TG_OP = 'DELETE') THEN
        v_id := OLD.validation_id;
      ELSE
        v_id := NEW.validation_id;
      END IF;
      SELECT proposal_id INTO affected_proposal
        FROM public.proposal_validations WHERE id = v_id;
    END;
  END IF;

  IF affected_proposal IS NOT NULL THEN
    PERFORM public.recompute_community_validated(affected_proposal);
  END IF;

  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$;


ALTER FUNCTION "public"."trg_recompute_community_validated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_recompute_cv_on_links"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  affected_proposal UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    affected_proposal := OLD.proposal_id;
  ELSE
    affected_proposal := NEW.proposal_id;
  END IF;
  IF affected_proposal IS NOT NULL THEN
    PERFORM public.recompute_community_validated(affected_proposal);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trg_recompute_cv_on_links"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "volunteer_id" "uuid" NOT NULL,
    "program_id" "uuid",
    "date" "date" NOT NULL,
    "hours" numeric(4,1) NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_logs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "caption" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_type" "text" NOT NULL,
    "program_id" "uuid",
    "content" "text" NOT NULL,
    "prompt_used" "text",
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['program'::"text", 'impact'::"text", 'volunteer'::"text", 'sdg'::"text"])))
);


ALTER TABLE "public"."ai_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_type" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "data" "jsonb" NOT NULL,
    "generated_by" "uuid",
    "trigger" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_snapshots_period_type_check" CHECK (("period_type" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "analytics_snapshots_trigger_check" CHECK (("trigger" = ANY (ARRAY['cron'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."analytics_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "volunteer_id" "uuid" NOT NULL,
    "checked_in_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "method" "text" DEFAULT 'otp'::"text" NOT NULL,
    "ip_address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_method_check" CHECK (("method" = ANY (ARRAY['qr'::"text", 'otp'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text",
    "record_id" "uuid",
    "details" "jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_email" "text",
    "resource_type" "text",
    "resource_id" "text",
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barangay_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barangay_id" "uuid" NOT NULL,
    "asset_name" "text" NOT NULL,
    "asset_type" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "condition" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "barangay_assets_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."barangay_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barangay_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barangay_id" "uuid" NOT NULL,
    "skill_name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "practitioner_count" integer DEFAULT 0 NOT NULL,
    "proficiency_level" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "barangay_skills_practitioner_count_check" CHECK (("practitioner_count" >= 0))
);


ALTER TABLE "public"."barangay_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barangays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "municipality" "text" NOT NULL,
    "province" "text" NOT NULL,
    "contact_person" "text",
    "contact_number" "text",
    "email" "text",
    "partnership_start" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "contact_email" "text",
    "total_population" integer,
    "total_households" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_phone" "text",
    CONSTRAINT "barangays_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."barangays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chatbot_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "query" "text" NOT NULL,
    "response" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chatbot_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barangay_id" "uuid" NOT NULL,
    "asset_name" "text" NOT NULL,
    "asset_type" "text" NOT NULL,
    "quantity" integer,
    "condition" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['facility'::"text", 'equipment'::"text", 'manpower'::"text", 'fund'::"text"]))),
    CONSTRAINT "community_assets_condition_check" CHECK (("condition" = ANY (ARRAY['good'::"text", 'fair'::"text", 'poor'::"text"])))
);


ALTER TABLE "public"."community_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_needs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barangay_id" "uuid" NOT NULL,
    "need_description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "priority_score" numeric,
    "source" "text" NOT NULL,
    "survey_id" "uuid",
    "status" "text" DEFAULT 'identified'::"text" NOT NULL,
    "identified_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "submitted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approval_status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "approval_notes" "text",
    "sitio" "text",
    CONSTRAINT "community_needs_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending_captain'::"text", 'approved'::"text", 'rejected'::"text", 'needs_revision'::"text"]))),
    CONSTRAINT "community_needs_category_check" CHECK (("category" = ANY (ARRAY['health'::"text", 'livelihood'::"text", 'education'::"text", 'infrastructure'::"text", 'environment'::"text"]))),
    CONSTRAINT "community_needs_source_check" CHECK (("source" = ANY (ARRAY['survey'::"text", 'assembly'::"text", 'household_profile'::"text"]))),
    CONSTRAINT "community_needs_status_check" CHECK (("status" = ANY (ARRAY['identified'::"text", 'in_progress'::"text", 'addressed'::"text"])))
);


ALTER TABLE "public"."community_needs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discussion_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."discussion_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discussion_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."discussion_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donation_distributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donation_id" "uuid" NOT NULL,
    "distributed_to" "text",
    "barangay_id" "uuid",
    "quantity" numeric NOT NULL,
    "distribution_type" "text" DEFAULT 'regular'::"text" NOT NULL,
    "distribution_date" "date" NOT NULL,
    "distributed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "donation_distributions_distribution_type_check" CHECK (("distribution_type" = ANY (ARRAY['regular'::"text", 'disaster'::"text"])))
);


ALTER TABLE "public"."donation_distributions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_name" "text" NOT NULL,
    "donor_type" "text" DEFAULT 'individual'::"text" NOT NULL,
    "item_type" "text" NOT NULL,
    "item_description" "text",
    "quantity" numeric NOT NULL,
    "unit" "text" DEFAULT 'pcs'::"text" NOT NULL,
    "received_date" "date" NOT NULL,
    "program_id" "uuid",
    "barangay_id" "uuid",
    "received_by" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "donations_donor_type_check" CHECK (("donor_type" = ANY (ARRAY['individual'::"text", 'organization'::"text", 'government'::"text", 'anonymous'::"text"])))
);


ALTER TABLE "public"."donations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "observer_id" "uuid" NOT NULL,
    "barangay_id" "uuid",
    "sitio" "text",
    "observation_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "observation" "text" NOT NULL,
    "category" "text",
    "follow_up_action" "text",
    "promoted_to_need_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "field_observations_category_check" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['environmental'::"text", 'health'::"text", 'economic'::"text", 'social'::"text", 'infrastructure'::"text", 'education'::"text", 'safety'::"text", 'other'::"text"])))),
    CONSTRAINT "field_observations_observation_check" CHECK (("length"(TRIM(BOTH FROM "observation")) >= 10))
);


ALTER TABLE "public"."field_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follow_up_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid",
    "followup_type" "text" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "completed_date" "date",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "follow_up_records_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text", 'completed'::"text"]))),
    CONSTRAINT "follow_up_records_type_check" CHECK (("followup_type" = ANY (ARRAY['immediate'::"text", '6_month'::"text", '12_month'::"text"])))
);


ALTER TABLE "public"."follow_up_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."followup_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "assessment_type" "text" NOT NULL,
    "findings" "text" NOT NULL,
    "assessed_by" "uuid",
    "assessment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "followup_assessments_assessment_type_check" CHECK (("assessment_type" = ANY (ARRAY['6_month'::"text", '12_month'::"text"])))
);


ALTER TABLE "public"."followup_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forum_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forum_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."household_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barangay_id" "uuid" NOT NULL,
    "family_name" "text",
    "members_count" integer,
    "income_level" "text",
    "primary_livelihood" "text",
    "specific_needs" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "household_number" "text" NOT NULL,
    "head_of_household" "text",
    "member_count" integer DEFAULT 1 NOT NULL,
    "income_bracket" "text",
    "primary_needs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "geo_location" "text",
    "notes" "text",
    "collected_by" "uuid",
    "collected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sitio" "text",
    "extended_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "household_profiles_income_level_check" CHECK (("income_level" = ANY (ARRAY['below_poverty'::"text", 'low'::"text", 'middle'::"text"])))
);


ALTER TABLE "public"."household_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."impact_indicators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid",
    "indicator_type" "text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "recorded_date" "date" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."impact_indicators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."impact_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "beneficiaries_count" integer DEFAULT 0 NOT NULL,
    "volunteer_hours" numeric DEFAULT 0 NOT NULL,
    "materials_distributed" integer DEFAULT 0 NOT NULL,
    "trainings_conducted" integer DEFAULT 0 NOT NULL,
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."impact_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."impact_qualitative" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid",
    "type" "text" NOT NULL,
    "subject_name" "text",
    "content" "text" NOT NULL,
    "recorded_date" "date" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "impact_qualitative_type_check" CHECK (("type" = ANY (ARRAY['testimonial'::"text", 'case_study'::"text", 'pre_post_narrative'::"text", 'observation'::"text"])))
);


ALTER TABLE "public"."impact_qualitative" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    CONSTRAINT "notifications_channel_check" CHECK (("channel" = ANY (ARRAY['in_app'::"text", 'email'::"text", 'sms'::"text"]))),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['program'::"text", 'reminder'::"text", 'alert'::"text", 'report'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participation_forms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "volunteer_id" "uuid" NOT NULL,
    "consent_name" boolean DEFAULT false NOT NULL,
    "consent_photo" boolean DEFAULT false NOT NULL,
    "consent_activity" boolean DEFAULT false NOT NULL,
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."participation_forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partnership_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barangay_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "officer_id" "uuid",
    "notes" "text",
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT "partnership_history_event_type_check" CHECK (("event_type" = ANY (ARRAY['moa_signed'::"text", 'program_completed'::"text", 'update'::"text", 'renewal'::"text"])))
);


ALTER TABLE "public"."partnership_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "date" "date" NOT NULL,
    "location" "text",
    "conducted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attendance_otp" "text",
    "attendance_otp_expires_at" timestamp with time zone,
    "attendance_otp_issued_at" timestamp with time zone,
    "attendance_otp_issued_by" "uuid",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "approval_status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "approval_notes" "text",
    "created_by" "uuid",
    "report_1" "text",
    "report_2" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_activities_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "program_activities_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'ongoing'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."program_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "activity_id" "uuid",
    "participant_id" "uuid",
    "check_in_method" "text" NOT NULL,
    "checked_in_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_attendance_check_in_method_check" CHECK (("check_in_method" = ANY (ARRAY['qr_code'::"text", 'otp'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."program_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "allocated" numeric DEFAULT 0 NOT NULL,
    "spent" numeric DEFAULT 0 NOT NULL,
    "remaining_amount" numeric GENERATED ALWAYS AS (("allocated" - "spent")) STORED,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approval_status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "approval_notes" "text",
    "created_by" "uuid",
    "category" "text",
    "notes" "text",
    CONSTRAINT "program_budgets_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."program_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "activity_id" "uuid",
    "report_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "submitted_by" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['midpoint'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."program_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_sdg_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "sdg_goal" integer NOT NULL,
    "actual_indicator" "text" NOT NULL,
    "actual_contribution" "text" NOT NULL,
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_sdg_outcomes_sdg_goal_check" CHECK (("sdg_goal" = ANY (ARRAY[4, 9, 11, 17])))
);


ALTER TABLE "public"."program_sdg_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_signups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "volunteer_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "signed_up_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approval_status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "approval_notes" "text",
    "added_by" "uuid",
    CONSTRAINT "program_signups_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "program_signups_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."program_signups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid",
    "title" "text" NOT NULL,
    "barangay_id" "uuid",
    "coordinator_id" "uuid",
    "status" "text" DEFAULT 'planning'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "description" "text",
    "max_volunteers" integer,
    "budget_allocated" numeric(12,2) DEFAULT 0,
    "budget_spent" numeric(12,2) DEFAULT 0,
    "sdg_alignments" integer[] DEFAULT '{}'::integer[],
    "lead_officer_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'planning'::"text", 'upcoming'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "rationale" "text" NOT NULL,
    "objectives" "text",
    "target_beneficiaries" "text",
    "expected_output" "text",
    "timeline_start" "date",
    "timeline_end" "date",
    "budget" numeric(12,2),
    "barangay_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_income_generating" boolean DEFAULT false NOT NULL,
    "finance_clearance" boolean DEFAULT false NOT NULL,
    "finance_cleared_at" timestamp with time zone,
    "finance_cleared_by" "uuid",
    "finance_notes" "text",
    "prescreening_passed" boolean,
    "prescreening_checks" "jsonb",
    "prescreening_ran_at" timestamp with time zone,
    "revision_count" integer DEFAULT 0 NOT NULL,
    "revision_requested_from" "text",
    "community_validated" boolean DEFAULT false NOT NULL,
    "community_validation_notes" "text",
    "community_validated_at" timestamp with time zone,
    "community_validated_by" "uuid",
    "informed_by_proposals" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    CONSTRAINT "project_proposals_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'pre_screening'::"text", 'sdg_review'::"text", 'finance_review'::"text", 'approved'::"text", 'rejected'::"text", 'revisions_requested'::"text"])))
);


ALTER TABLE "public"."project_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "reviewer_id" "uuid",
    "stage" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "notes" "text",
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proposal_reviews_decision_check" CHECK (("decision" = ANY (ARRAY['approved'::"text", 'rejected'::"text", 'needs_revision'::"text"])))
);


ALTER TABLE "public"."proposal_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_screening" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "stage" "text" NOT NULL,
    "result" "text" NOT NULL,
    "notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proposal_screening_result_check" CHECK (("result" = ANY (ARRAY['passed'::"text", 'failed'::"text", 'needs_revision'::"text"]))),
    CONSTRAINT "proposal_screening_stage_check" CHECK (("stage" = ANY (ARRAY['pre_screening'::"text", 'sdg_review'::"text", 'finance_review'::"text", 'final_approval'::"text"])))
);


ALTER TABLE "public"."proposal_screening" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_sdg_alignment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "sdg_number" integer NOT NULL,
    "indicator" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proposal_sdg_alignment_sdg_number_check" CHECK (("sdg_number" = ANY (ARRAY[4, 9, 11, 17])))
);


ALTER TABLE "public"."proposal_sdg_alignment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_sdg_alignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "sdg_goal" integer NOT NULL,
    "indicator" "text" NOT NULL,
    "contribution" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proposal_sdg_alignments_sdg_goal_check" CHECK (("sdg_goal" = ANY (ARRAY[4, 9, 11, 17])))
);


ALTER TABLE "public"."proposal_sdg_alignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_validation_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "validation_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text",
    "file_size" bigint,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."proposal_validation_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_validation_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "rationale" "text" NOT NULL,
    "linked_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proposal_validation_links_rationale_check" CHECK (("length"(TRIM(BOTH FROM "rationale")) >= 10)),
    CONSTRAINT "proposal_validation_links_source_type_check" CHECK (("source_type" = ANY (ARRAY['community_need'::"text", 'survey'::"text", 'survey_response'::"text", 'field_observation'::"text", 'household_profile'::"text"])))
);


ALTER TABLE "public"."proposal_validation_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_validation_stakeholders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "validation_id" "uuid" NOT NULL,
    "stakeholder_name" "text" NOT NULL,
    "role" "text",
    "present" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proposal_validation_stakeholders_stakeholder_name_check" CHECK (("length"(TRIM(BOTH FROM "stakeholder_name")) >= 2))
);


ALTER TABLE "public"."proposal_validation_stakeholders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "method" "text" NOT NULL,
    "date_conducted" "date" NOT NULL,
    "summary" "text" NOT NULL,
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proposal_validations_method_check" CHECK (("method" = ANY (ARRAY['fgd'::"text", 'key_informant'::"text", 'town_hall'::"text", 'consultation'::"text", 'door_to_door'::"text", 'other'::"text"]))),
    CONSTRAINT "proposal_validations_summary_check" CHECK (("length"(TRIM(BOTH FROM "summary")) >= 20))
);


ALTER TABLE "public"."proposal_validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "rationale" "text" NOT NULL,
    "target_barangay_id" "uuid",
    "target_beneficiaries" "text",
    "start_date" "date",
    "end_date" "date",
    "budget_requested" numeric DEFAULT 0 NOT NULL,
    "budget_approved" numeric,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_income_generating" boolean DEFAULT false NOT NULL,
    "submitted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proposals_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pre_screening'::"text", 'sdg_review'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qualitative_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "data_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "submitted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "qualitative_data_data_type_check" CHECK (("data_type" = ANY (ARRAY['testimonial'::"text", 'case_study'::"text", 'before_after'::"text"])))
);


ALTER TABLE "public"."qualitative_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barangay_id" "uuid" NOT NULL,
    "category_name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."skill_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_answer_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "answer_id" "uuid" NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "coder_id" "uuid" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "survey_answer_codes_label_check" CHECK ((("length"(TRIM(BOTH FROM "label")) >= 1) AND ("length"(TRIM(BOTH FROM "label")) <= 80)))
);


ALTER TABLE "public"."survey_answer_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "response_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "answer_text" "text",
    "answer_value" integer
);


ALTER TABLE "public"."survey_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "question_text" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "options" "jsonb",
    "is_required" boolean DEFAULT true NOT NULL,
    "order_index" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "section_title" "text",
    "conditions" "jsonb",
    CONSTRAINT "survey_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['text'::"text", 'multiple_choice'::"text", 'checkbox'::"text", 'rating'::"text"])))
);


ALTER TABLE "public"."survey_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "respondent_id" "uuid",
    "barangay_id" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "excluded" boolean DEFAULT false NOT NULL,
    "exclusion_reason" "text",
    "excluded_by" "uuid",
    "excluded_at" timestamp with time zone
);


ALTER TABLE "public"."survey_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sections" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."survey_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "template_type" "text" DEFAULT 'custom'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "target_barangay_id" "uuid",
    "created_by" "uuid",
    "published_at" timestamp with time zone,
    "closes_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opens_at" timestamp with time zone,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "is_editable" boolean DEFAULT false NOT NULL,
    "reminder_enabled" boolean DEFAULT false NOT NULL,
    "submission_type" "text" DEFAULT 'once'::"text" NOT NULL,
    "methodology" "text" DEFAULT 'quantitative'::"text" NOT NULL,
    "parent_survey_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "surveys_methodology_check" CHECK (("methodology" = ANY (ARRAY['quantitative'::"text", 'qualitative'::"text", 'mixed'::"text"]))),
    CONSTRAINT "surveys_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'closed'::"text"]))),
    CONSTRAINT "surveys_template_type_check" CHECK (("template_type" = ANY (ARRAY['agriculture'::"text", 'education'::"text", 'health'::"text", 'livelihood'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."surveys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_backups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "backup_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "file_path" "text",
    "performed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_backups_backup_type_check" CHECK (("backup_type" = ANY (ARRAY['full'::"text", 'incremental'::"text"]))),
    CONSTRAINT "system_backups_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failed'::"text", 'in_progress'::"text"])))
);


ALTER TABLE "public"."system_backups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "barangay_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "org_name" "text",
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'finance_officer'::"text", 'volunteer'::"text", 'barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'office'::"text", 'student_org'::"text", 'department'::"text", 'admin'::"text", 'paraya_officer'::"text", 'barangay_official'::"text"]))),
    CONSTRAINT "users_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."volunteer_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "volunteer_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "barangay_id" "uuid",
    "task_description" "text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "assigned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "volunteer_assignments_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'ongoing'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."volunteer_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."volunteer_class_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "volunteer_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "location" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vcs_time_order" CHECK (("end_time" > "start_time")),
    CONSTRAINT "volunteer_class_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."volunteer_class_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."volunteers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "student_id" "text",
    "course" "text",
    "year_level" integer,
    "interests" "text"[],
    "total_hours" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "volunteers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'alumni'::"text"]))),
    CONSTRAINT "volunteers_year_level_check" CHECK ((("year_level" >= 1) AND ("year_level" <= 4)))
);


ALTER TABLE "public"."volunteers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_photos"
    ADD CONSTRAINT "activity_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_snapshots"
    ADD CONSTRAINT "analytics_snapshots_period_type_period_start_key" UNIQUE ("period_type", "period_start");



ALTER TABLE ONLY "public"."analytics_snapshots"
    ADD CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_activity_id_volunteer_id_key" UNIQUE ("activity_id", "volunteer_id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barangay_assets"
    ADD CONSTRAINT "barangay_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barangay_skills"
    ADD CONSTRAINT "barangay_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barangays"
    ADD CONSTRAINT "barangays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_logs"
    ADD CONSTRAINT "chatbot_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_assets"
    ADD CONSTRAINT "community_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_needs"
    ADD CONSTRAINT "community_needs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discussion_posts"
    ADD CONSTRAINT "discussion_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donation_distributions"
    ADD CONSTRAINT "donation_distributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_observations"
    ADD CONSTRAINT "field_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follow_up_records"
    ADD CONSTRAINT "follow_up_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."followup_assessments"
    ADD CONSTRAINT "followup_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."household_profiles"
    ADD CONSTRAINT "household_profiles_brgy_num_key" UNIQUE ("barangay_id", "household_number");



ALTER TABLE ONLY "public"."household_profiles"
    ADD CONSTRAINT "household_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."impact_indicators"
    ADD CONSTRAINT "impact_indicators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."impact_metrics"
    ADD CONSTRAINT "impact_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."impact_qualitative"
    ADD CONSTRAINT "impact_qualitative_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participation_forms"
    ADD CONSTRAINT "participation_forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partnership_history"
    ADD CONSTRAINT "partnership_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_activities"
    ADD CONSTRAINT "program_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_attendance"
    ADD CONSTRAINT "program_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_budgets"
    ADD CONSTRAINT "program_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_reports"
    ADD CONSTRAINT "program_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_sdg_outcomes"
    ADD CONSTRAINT "program_sdg_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_signups"
    ADD CONSTRAINT "program_signups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_signups"
    ADD CONSTRAINT "program_signups_program_id_volunteer_id_key" UNIQUE ("program_id", "volunteer_id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_proposals"
    ADD CONSTRAINT "project_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_reviews"
    ADD CONSTRAINT "proposal_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_screening"
    ADD CONSTRAINT "proposal_screening_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_sdg_alignment"
    ADD CONSTRAINT "proposal_sdg_alignment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_sdg_alignments"
    ADD CONSTRAINT "proposal_sdg_alignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_validation_evidence"
    ADD CONSTRAINT "proposal_validation_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_validation_links"
    ADD CONSTRAINT "proposal_validation_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_validation_stakeholders"
    ADD CONSTRAINT "proposal_validation_stakeholders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_validations"
    ADD CONSTRAINT "proposal_validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qualitative_data"
    ADD CONSTRAINT "qualitative_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_categories"
    ADD CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_answer_codes"
    ADD CONSTRAINT "survey_answer_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_answer_codes"
    ADD CONSTRAINT "survey_answer_codes_unique_per_coder" UNIQUE ("answer_id", "coder_id", "label");



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_questions"
    ADD CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_templates"
    ADD CONSTRAINT "survey_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_backups"
    ADD CONSTRAINT "system_backups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."volunteer_assignments"
    ADD CONSTRAINT "volunteer_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."volunteer_class_schedules"
    ADD CONSTRAINT "volunteer_class_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."volunteers"
    ADD CONSTRAINT "volunteers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."volunteers"
    ADD CONSTRAINT "volunteers_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_activity_photos_activity" ON "public"."activity_photos" USING "btree" ("activity_id");



CREATE INDEX "idx_activity_photos_created" ON "public"."activity_photos" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_al_status" ON "public"."activity_logs" USING "btree" ("status");



CREATE INDEX "idx_al_volunteer_id" ON "public"."activity_logs" USING "btree" ("volunteer_id");



CREATE INDEX "idx_att_activity" ON "public"."attendance" USING "btree" ("activity_id");



CREATE INDEX "idx_att_checked_in" ON "public"."attendance" USING "btree" ("checked_in_at" DESC);



CREATE INDEX "idx_att_volunteer" ON "public"."attendance" USING "btree" ("volunteer_id");



CREATE INDEX "idx_audit_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_created" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_level" ON "public"."audit_logs" USING "btree" ("level");



CREATE INDEX "idx_audit_logs_time" ON "public"."audit_logs" USING "btree" ("created_at");



CREATE INDEX "idx_audit_logs_user" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_audit_user" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_bassets_barangay" ON "public"."barangay_assets" USING "btree" ("barangay_id");



CREATE INDEX "idx_bassets_type" ON "public"."barangay_assets" USING "btree" ("asset_type");



CREATE INDEX "idx_bskills_barangay" ON "public"."barangay_skills" USING "btree" ("barangay_id");



CREATE INDEX "idx_bskills_category" ON "public"."barangay_skills" USING "btree" ("category");



CREATE INDEX "idx_cn_approval_status" ON "public"."community_needs" USING "btree" ("approval_status");



CREATE INDEX "idx_cn_barangay_sitio" ON "public"."community_needs" USING "btree" ("barangay_id", "sitio");



CREATE INDEX "idx_cn_barangay_status" ON "public"."community_needs" USING "btree" ("barangay_id", "approval_status");



CREATE INDEX "idx_community_needs_brgy" ON "public"."community_needs" USING "btree" ("barangay_id");



CREATE INDEX "idx_field_obs_barangay" ON "public"."field_observations" USING "btree" ("barangay_id");



CREATE INDEX "idx_field_obs_date" ON "public"."field_observations" USING "btree" ("observation_date" DESC);



CREATE INDEX "idx_field_obs_observer" ON "public"."field_observations" USING "btree" ("observer_id");



CREATE INDEX "idx_field_obs_promoted" ON "public"."field_observations" USING "btree" ("promoted_to_need_id");



CREATE INDEX "idx_fp_author" ON "public"."forum_posts" USING "btree" ("author_id");



CREATE INDEX "idx_fp_thread" ON "public"."forum_posts" USING "btree" ("thread_id", "created_at");



CREATE INDEX "idx_ft_author" ON "public"."forum_threads" USING "btree" ("author_id");



CREATE INDEX "idx_ft_pinned_created" ON "public"."forum_threads" USING "btree" ("pinned" DESC, "created_at" DESC);



CREATE INDEX "idx_hp_barangay" ON "public"."household_profiles" USING "btree" ("barangay_id");



CREATE INDEX "idx_hp_barangay_sitio" ON "public"."household_profiles" USING "btree" ("barangay_id", "sitio");



CREATE INDEX "idx_hp_collected_at" ON "public"."household_profiles" USING "btree" ("collected_at" DESC);



CREATE INDEX "idx_hp_extended_data_gin" ON "public"."household_profiles" USING "gin" ("extended_data");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("is_read");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_pa_approval_status" ON "public"."program_activities" USING "btree" ("approval_status");



CREATE INDEX "idx_pa_created_at" ON "public"."program_activities" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pa_created_by" ON "public"."program_activities" USING "btree" ("created_by");



CREATE INDEX "idx_pa_otp" ON "public"."program_activities" USING "btree" ("attendance_otp");



CREATE INDEX "idx_pb_approval_status" ON "public"."program_budgets" USING "btree" ("approval_status");



CREATE INDEX "idx_pb_category" ON "public"."program_budgets" USING "btree" ("category");



CREATE INDEX "idx_pb_program_id" ON "public"."program_budgets" USING "btree" ("program_id");



CREATE INDEX "idx_phist_barangay" ON "public"."partnership_history" USING "btree" ("barangay_id");



CREATE INDEX "idx_phist_date" ON "public"."partnership_history" USING "btree" ("date" DESC);



CREATE INDEX "idx_programs_barangay" ON "public"."programs" USING "btree" ("barangay_id");



CREATE INDEX "idx_programs_status" ON "public"."programs" USING "btree" ("status");



CREATE INDEX "idx_proposals_barangay" ON "public"."proposals" USING "btree" ("target_barangay_id");



CREATE INDEX "idx_proposals_informed_by_gin" ON "public"."project_proposals" USING "gin" ("informed_by_proposals");



CREATE INDEX "idx_proposals_status" ON "public"."proposals" USING "btree" ("status");



CREATE INDEX "idx_ps_approval_status" ON "public"."program_signups" USING "btree" ("approval_status");



CREATE INDEX "idx_pv_date" ON "public"."proposal_validations" USING "btree" ("date_conducted" DESC);



CREATE INDEX "idx_pv_proposal" ON "public"."proposal_validations" USING "btree" ("proposal_id");



CREATE INDEX "idx_pve_validation" ON "public"."proposal_validation_evidence" USING "btree" ("validation_id");



CREATE INDEX "idx_pvl_proposal" ON "public"."proposal_validation_links" USING "btree" ("proposal_id");



CREATE INDEX "idx_pvl_source" ON "public"."proposal_validation_links" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_pvs_validation" ON "public"."proposal_validation_stakeholders" USING "btree" ("validation_id");



CREATE INDEX "idx_sac_answer" ON "public"."survey_answer_codes" USING "btree" ("answer_id");



CREATE INDEX "idx_sac_label" ON "public"."survey_answer_codes" USING "btree" ("survey_id", "label");



CREATE INDEX "idx_sac_survey" ON "public"."survey_answer_codes" USING "btree" ("survey_id");



CREATE INDEX "idx_snap_period_start" ON "public"."analytics_snapshots" USING "btree" ("period_start" DESC);



CREATE INDEX "idx_snap_period_type" ON "public"."analytics_snapshots" USING "btree" ("period_type");



CREATE INDEX "idx_survey_responses_excluded" ON "public"."survey_responses" USING "btree" ("survey_id") WHERE ("excluded" = true);



CREATE INDEX "idx_surveys_created_at" ON "public"."surveys" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_surveys_parent" ON "public"."surveys" USING "btree" ("parent_survey_id");



CREATE INDEX "idx_surveys_status" ON "public"."surveys" USING "btree" ("status");



CREATE INDEX "idx_users_barangay" ON "public"."users" USING "btree" ("barangay_id");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_org_name" ON "public"."users" USING "btree" ("org_name") WHERE ("org_name" IS NOT NULL);



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE INDEX "idx_vcs_volunteer" ON "public"."volunteer_class_schedules" USING "btree" ("volunteer_id");



CREATE INDEX "idx_volunteers_user" ON "public"."volunteers" USING "btree" ("user_id");



CREATE UNIQUE INDEX "uq_pvl_proposal_source" ON "public"."proposal_validation_links" USING "btree" ("proposal_id", "source_type", "source_id");



CREATE OR REPLACE TRIGGER "recompute_cv_on_evidence" AFTER INSERT OR DELETE OR UPDATE ON "public"."proposal_validation_evidence" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_community_validated"();



CREATE OR REPLACE TRIGGER "recompute_cv_on_links" AFTER INSERT OR DELETE OR UPDATE ON "public"."proposal_validation_links" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_cv_on_links"();



CREATE OR REPLACE TRIGGER "recompute_cv_on_stakeholders" AFTER INSERT OR DELETE OR UPDATE ON "public"."proposal_validation_stakeholders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_community_validated"();



CREATE OR REPLACE TRIGGER "recompute_cv_on_validations" AFTER INSERT OR DELETE OR UPDATE ON "public"."proposal_validations" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_community_validated"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_photos"
    ADD CONSTRAINT "activity_photos_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."program_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_photos"
    ADD CONSTRAINT "activity_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."analytics_snapshots"
    ADD CONSTRAINT "analytics_snapshots_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."program_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."barangay_assets"
    ADD CONSTRAINT "barangay_assets_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."barangay_assets"
    ADD CONSTRAINT "barangay_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."barangay_skills"
    ADD CONSTRAINT "barangay_skills_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."barangay_skills"
    ADD CONSTRAINT "barangay_skills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chatbot_logs"
    ADD CONSTRAINT "chatbot_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_assets"
    ADD CONSTRAINT "community_assets_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_assets"
    ADD CONSTRAINT "community_assets_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_needs"
    ADD CONSTRAINT "community_needs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_needs"
    ADD CONSTRAINT "community_needs_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_needs"
    ADD CONSTRAINT "community_needs_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_needs"
    ADD CONSTRAINT "community_needs_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discussion_posts"
    ADD CONSTRAINT "discussion_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."discussion_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donation_distributions"
    ADD CONSTRAINT "donation_distributions_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donation_distributions"
    ADD CONSTRAINT "donation_distributions_distributed_by_fkey" FOREIGN KEY ("distributed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."donation_distributions"
    ADD CONSTRAINT "donation_distributions_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."field_observations"
    ADD CONSTRAINT "field_observations_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."field_observations"
    ADD CONSTRAINT "field_observations_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_observations"
    ADD CONSTRAINT "field_observations_promoted_to_need_id_fkey" FOREIGN KEY ("promoted_to_need_id") REFERENCES "public"."community_needs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follow_up_records"
    ADD CONSTRAINT "follow_up_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."follow_up_records"
    ADD CONSTRAINT "follow_up_records_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."followup_assessments"
    ADD CONSTRAINT "followup_assessments_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."followup_assessments"
    ADD CONSTRAINT "followup_assessments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."household_profiles"
    ADD CONSTRAINT "household_profiles_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."household_profiles"
    ADD CONSTRAINT "household_profiles_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."household_profiles"
    ADD CONSTRAINT "household_profiles_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."impact_indicators"
    ADD CONSTRAINT "impact_indicators_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."impact_indicators"
    ADD CONSTRAINT "impact_indicators_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."impact_metrics"
    ADD CONSTRAINT "impact_metrics_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."impact_metrics"
    ADD CONSTRAINT "impact_metrics_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."impact_qualitative"
    ADD CONSTRAINT "impact_qualitative_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."impact_qualitative"
    ADD CONSTRAINT "impact_qualitative_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participation_forms"
    ADD CONSTRAINT "participation_forms_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partnership_history"
    ADD CONSTRAINT "partnership_history_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partnership_history"
    ADD CONSTRAINT "partnership_history_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."partnership_history"
    ADD CONSTRAINT "partnership_history_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_activities"
    ADD CONSTRAINT "program_activities_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_activities"
    ADD CONSTRAINT "program_activities_attendance_otp_issued_by_fkey" FOREIGN KEY ("attendance_otp_issued_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_activities"
    ADD CONSTRAINT "program_activities_conducted_by_fkey" FOREIGN KEY ("conducted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_activities"
    ADD CONSTRAINT "program_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_activities"
    ADD CONSTRAINT "program_activities_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_attendance"
    ADD CONSTRAINT "program_attendance_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."program_activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_attendance"
    ADD CONSTRAINT "program_attendance_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_attendance"
    ADD CONSTRAINT "program_attendance_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_budgets"
    ADD CONSTRAINT "program_budgets_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_budgets"
    ADD CONSTRAINT "program_budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_budgets"
    ADD CONSTRAINT "program_budgets_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_reports"
    ADD CONSTRAINT "program_reports_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."program_activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_reports"
    ADD CONSTRAINT "program_reports_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_reports"
    ADD CONSTRAINT "program_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_sdg_outcomes"
    ADD CONSTRAINT "program_sdg_outcomes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id");



ALTER TABLE ONLY "public"."program_sdg_outcomes"
    ADD CONSTRAINT "program_sdg_outcomes_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."program_signups"
    ADD CONSTRAINT "program_signups_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_signups"
    ADD CONSTRAINT "program_signups_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_signups"
    ADD CONSTRAINT "program_signups_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_signups"
    ADD CONSTRAINT "program_signups_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_lead_officer_id_fkey" FOREIGN KEY ("lead_officer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_proposals"
    ADD CONSTRAINT "project_proposals_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id");



ALTER TABLE ONLY "public"."project_proposals"
    ADD CONSTRAINT "project_proposals_community_validated_by_fkey" FOREIGN KEY ("community_validated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_proposals"
    ADD CONSTRAINT "project_proposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."project_proposals"
    ADD CONSTRAINT "project_proposals_finance_cleared_by_fkey" FOREIGN KEY ("finance_cleared_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposal_reviews"
    ADD CONSTRAINT "proposal_reviews_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_reviews"
    ADD CONSTRAINT "proposal_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."proposal_screening"
    ADD CONSTRAINT "proposal_screening_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_screening"
    ADD CONSTRAINT "proposal_screening_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposal_sdg_alignment"
    ADD CONSTRAINT "proposal_sdg_alignment_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_sdg_alignments"
    ADD CONSTRAINT "proposal_sdg_alignments_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_validation_evidence"
    ADD CONSTRAINT "proposal_validation_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposal_validation_evidence"
    ADD CONSTRAINT "proposal_validation_evidence_validation_id_fkey" FOREIGN KEY ("validation_id") REFERENCES "public"."proposal_validations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_validation_links"
    ADD CONSTRAINT "proposal_validation_links_linked_by_fkey" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposal_validation_links"
    ADD CONSTRAINT "proposal_validation_links_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_validation_stakeholders"
    ADD CONSTRAINT "proposal_validation_stakeholders_validation_id_fkey" FOREIGN KEY ("validation_id") REFERENCES "public"."proposal_validations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_validations"
    ADD CONSTRAINT "proposal_validations_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_validations"
    ADD CONSTRAINT "proposal_validations_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_target_barangay_id_fkey" FOREIGN KEY ("target_barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."qualitative_data"
    ADD CONSTRAINT "qualitative_data_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qualitative_data"
    ADD CONSTRAINT "qualitative_data_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."skill_categories"
    ADD CONSTRAINT "skill_categories_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."skill_categories"
    ADD CONSTRAINT "skill_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_answer_codes"
    ADD CONSTRAINT "survey_answer_codes_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."survey_answers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_answer_codes"
    ADD CONSTRAINT "survey_answer_codes_coder_id_fkey" FOREIGN KEY ("coder_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_answer_codes"
    ADD CONSTRAINT "survey_answer_codes_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."survey_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_questions"
    ADD CONSTRAINT "survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_excluded_by_fkey" FOREIGN KEY ("excluded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_respondent_id_fkey" FOREIGN KEY ("respondent_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_templates"
    ADD CONSTRAINT "survey_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_parent_survey_id_fkey" FOREIGN KEY ("parent_survey_id") REFERENCES "public"."surveys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_target_barangay_id_fkey" FOREIGN KEY ("target_barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_backups"
    ADD CONSTRAINT "system_backups_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."volunteer_assignments"
    ADD CONSTRAINT "volunteer_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."volunteer_assignments"
    ADD CONSTRAINT "volunteer_assignments_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."volunteer_assignments"
    ADD CONSTRAINT "volunteer_assignments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."volunteer_assignments"
    ADD CONSTRAINT "volunteer_assignments_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."volunteer_class_schedules"
    ADD CONSTRAINT "volunteer_class_schedules_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."volunteers"
    ADD CONSTRAINT "volunteers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "All authenticated view programs" ON "public"."programs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Officers manage all signups" ON "public"."program_signups" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "Officers manage programs" ON "public"."programs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "Officers manage proposals" ON "public"."project_proposals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "Officers manage reviews" ON "public"."proposal_reviews" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "Officers manage sdg alignment" ON "public"."proposal_sdg_alignment" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "Officers view reviews" ON "public"."proposal_reviews" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "Officers view sdg alignment" ON "public"."proposal_sdg_alignment" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "Volunteers manage own signups" ON "public"."program_signups" FOR INSERT TO "authenticated" WITH CHECK (("volunteer_id" = "auth"."uid"()));



CREATE POLICY "Volunteers view own signups" ON "public"."program_signups" FOR SELECT TO "authenticated" USING ((("volunteer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"])))))));



CREATE POLICY "Volunteers withdraw own signups" ON "public"."program_signups" FOR UPDATE TO "authenticated" USING (("volunteer_id" = "auth"."uid"()));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_reports_officer_all" ON "public"."ai_reports" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."analytics_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ap_officer_all" ON "public"."activity_photos" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "ap_read" ON "public"."activity_photos" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ap_read_authed" ON "public"."activity_photos" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ap_staff_all" ON "public"."activity_photos" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "assets_brgy_read_own" ON "public"."barangay_assets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) AND ("u"."barangay_id" = "barangay_assets"."barangay_id")))));



CREATE POLICY "assets_officer_all" ON "public"."barangay_assets" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "att_staff_all" ON "public"."attendance" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "att_volunteer_insert_own" ON "public"."attendance" FOR INSERT WITH CHECK (("auth"."uid"() = "volunteer_id"));



CREATE POLICY "att_volunteer_read_own" ON "public"."attendance" FOR SELECT USING (("auth"."uid"() = "volunteer_id"));



ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_admin_all" ON "public"."audit_logs" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text")))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_admin_only" ON "public"."audit_logs" FOR SELECT USING (("public"."get_user_role"() = 'system_admin'::"text"));



CREATE POLICY "audit_logs_insert_service" ON "public"."audit_logs" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."barangay_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."barangay_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."barangays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bassets_brgy_read_own" ON "public"."barangay_assets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'barangay_official'::"text") AND ("u"."barangay_id" = "barangay_assets"."barangay_id")))));



CREATE POLICY "bassets_officer_all" ON "public"."barangay_assets" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "bskills_brgy_read_own" ON "public"."barangay_skills" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'barangay_official'::"text") AND ("u"."barangay_id" = "barangay_skills"."barangay_id")))));



CREATE POLICY "bskills_officer_all" ON "public"."barangay_skills" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."chatbot_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_needs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discussion_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discussion_replies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discussions_insert_auth" ON "public"."discussion_posts" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "discussions_read_all" ON "public"."discussion_posts" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."donation_distributions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."field_observations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fo_brgy_read_own" ON "public"."field_observations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) AND ("u"."barangay_id" = "field_observations"."barangay_id")))));



CREATE POLICY "fo_mother_leader_write" ON "public"."field_observations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['barangay_mother_leader'::"text", 'barangay_official'::"text"]))))));



CREATE POLICY "fo_officer_all" ON "public"."field_observations" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "fo_staff_all" ON "public"."field_observations" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."follow_up_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fp_delete_owner" ON "public"."forum_posts" FOR DELETE USING (("auth"."uid"() = "author_id"));



CREATE POLICY "fp_insert_auth" ON "public"."forum_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "fp_moderate" ON "public"."forum_posts" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "fp_read_all" ON "public"."forum_posts" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "fp_update_owner" ON "public"."forum_posts" FOR UPDATE USING (("auth"."uid"() = "author_id"));



CREATE POLICY "ft_delete_owner" ON "public"."forum_threads" FOR DELETE USING (("auth"."uid"() = "author_id"));



CREATE POLICY "ft_insert_auth" ON "public"."forum_threads" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "ft_moderate" ON "public"."forum_threads" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "ft_read_all" ON "public"."forum_threads" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ft_update_owner" ON "public"."forum_threads" FOR UPDATE USING (("auth"."uid"() = "author_id"));



ALTER TABLE "public"."household_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hp_brgy_read_own" ON "public"."household_profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) AND ("u"."barangay_id" = "household_profiles"."barangay_id")))));



CREATE POLICY "hp_officer_all" ON "public"."household_profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."impact_indicators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."impact_qualitative" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "needs_insert_authorized" ON "public"."community_needs" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['paraya_officer'::"text", 'barangay_official'::"text", 'system_admin'::"text"])));



CREATE POLICY "needs_own_barangay" ON "public"."community_needs" FOR SELECT USING ((("barangay_id" = "public"."get_user_barangay"()) OR ("public"."get_user_role"() = ANY (ARRAY['paraya_officer'::"text", 'system_admin'::"text"]))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_own" ON "public"."notifications" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "officers can delete survey_templates" ON "public"."survey_templates" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))));



CREATE POLICY "officers can insert survey_templates" ON "public"."survey_templates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers can read survey_templates" ON "public"."survey_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_activities" ON "public"."program_activities" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_ai_reports" ON "public"."ai_reports" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_all_logs" ON "public"."activity_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_budgets" ON "public"."program_budgets" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_dist" ON "public"."donation_distributions" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_donations" ON "public"."donations" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_follow_up_records" ON "public"."follow_up_records" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_impact_indicators" ON "public"."impact_indicators" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_impact_qualitative" ON "public"."impact_qualitative" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_proposals" ON "public"."project_proposals" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_reviews" ON "public"."proposal_reviews" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "officers_sdg" ON "public"."proposal_sdg_alignment" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."partnership_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ph_brgy_read_own" ON "public"."partnership_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) AND ("u"."barangay_id" = "partnership_history"."barangay_id")))));



CREATE POLICY "ph_officer_all" ON "public"."partnership_history" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "phist_brgy_read_own" ON "public"."partnership_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'barangay_official'::"text") AND ("u"."barangay_id" = "partnership_history"."barangay_id")))));



CREATE POLICY "phist_officer_all" ON "public"."partnership_history" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "phist_vol_read_own" ON "public"."partnership_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'volunteer'::"text") AND ("u"."barangay_id" = "partnership_history"."barangay_id")))));



ALTER TABLE "public"."program_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_activities_delete" ON "public"."program_activities" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "program_activities_insert" ON "public"."program_activities" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND (EXISTS ( SELECT 1
           FROM ("public"."programs" "pr"
             JOIN "public"."project_proposals" "pp" ON (("pp"."id" = "pr"."proposal_id")))
          WHERE (("pr"."id" = "program_activities"."program_id") AND ("pp"."created_by" = "auth"."uid"()))))))))));



CREATE POLICY "program_activities_select" ON "public"."program_activities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "program_activities_update" ON "public"."program_activities" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND (EXISTS ( SELECT 1
           FROM ("public"."programs" "pr"
             JOIN "public"."project_proposals" "pp" ON (("pp"."id" = "pr"."proposal_id")))
          WHERE (("pr"."id" = "program_activities"."program_id") AND ("pp"."created_by" = "auth"."uid"()))))))))));



ALTER TABLE "public"."program_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_budgets_delete" ON "public"."program_budgets" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "program_budgets_insert" ON "public"."program_budgets" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND (EXISTS ( SELECT 1
           FROM ("public"."programs" "pr"
             JOIN "public"."project_proposals" "pp" ON (("pp"."id" = "pr"."proposal_id")))
          WHERE (("pr"."id" = "program_budgets"."program_id") AND ("pp"."created_by" = "auth"."uid"()))))))))));



CREATE POLICY "program_budgets_select" ON "public"."program_budgets" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "program_budgets_update" ON "public"."program_budgets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND (EXISTS ( SELECT 1
           FROM ("public"."programs" "pr"
             JOIN "public"."project_proposals" "pp" ON (("pp"."id" = "pr"."proposal_id")))
          WHERE (("pr"."id" = "program_budgets"."program_id") AND ("pp"."created_by" = "auth"."uid"()))))))))));



ALTER TABLE "public"."program_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_sdg_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_signups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_signups_delete" ON "public"."program_signups" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = 'volunteer'::"text") AND ("program_signups"."volunteer_id" = "auth"."uid"())))))));



CREATE POLICY "program_signups_insert" ON "public"."program_signups" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = 'volunteer'::"text") AND ("program_signups"."volunteer_id" = "auth"."uid"())) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND (EXISTS ( SELECT 1
           FROM ("public"."programs" "pr"
             JOIN "public"."project_proposals" "pp" ON (("pp"."id" = "pr"."proposal_id")))
          WHERE (("pr"."id" = "program_signups"."program_id") AND ("pp"."created_by" = "auth"."uid"()))))))))));



CREATE POLICY "program_signups_select" ON "public"."program_signups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR ("program_signups"."volunteer_id" = "auth"."uid"()) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND (EXISTS ( SELECT 1
           FROM ("public"."programs" "pr"
             JOIN "public"."project_proposals" "pp" ON (("pp"."id" = "pr"."proposal_id")))
          WHERE (("pr"."id" = "program_signups"."program_id") AND ("pp"."created_by" = "auth"."uid"()))))))))));



CREATE POLICY "program_signups_update" ON "public"."program_signups" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = 'volunteer'::"text") AND ("program_signups"."volunteer_id" = "auth"."uid"())) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND (EXISTS ( SELECT 1
           FROM ("public"."programs" "pr"
             JOIN "public"."project_proposals" "pp" ON (("pp"."id" = "pr"."proposal_id")))
          WHERE (("pr"."id" = "program_signups"."program_id") AND ("pp"."created_by" = "auth"."uid"()))))))))));



ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programs_delete" ON "public"."programs" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "programs_insert" ON "public"."programs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "programs_manage_officers" ON "public"."programs" USING (("public"."get_user_role"() = ANY (ARRAY['paraya_officer'::"text", 'system_admin'::"text"])));



CREATE POLICY "programs_read_all" ON "public"."programs" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "programs_select" ON "public"."programs" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "programs_update" ON "public"."programs" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."project_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposal_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "proposal_reviews_delete" ON "public"."proposal_reviews" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "proposal_reviews_insert" ON "public"."proposal_reviews" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'finance_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "proposal_reviews_select" ON "public"."proposal_reviews" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."project_proposals" "p"
     JOIN "public"."users" "u" ON (("u"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "proposal_reviews"."proposal_id") AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'finance_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND ("p"."created_by" = "auth"."uid"())))))));



CREATE POLICY "proposal_reviews_update" ON "public"."proposal_reviews" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."proposal_sdg_alignment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposal_validation_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposal_validation_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposal_validation_stakeholders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposal_validations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "proposals_create_officers" ON "public"."proposals" FOR INSERT WITH CHECK (("public"."get_user_role"() = 'paraya_officer'::"text"));



CREATE POLICY "proposals_delete" ON "public"."project_proposals" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "proposals_insert" ON "public"."project_proposals" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text", 'office'::"text", 'student_org'::"text", 'department'::"text"])))))));



CREATE POLICY "proposals_read_officers" ON "public"."proposals" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['paraya_officer'::"text", 'system_admin'::"text"])));



CREATE POLICY "proposals_select" ON "public"."project_proposals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'finance_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND ("project_proposals"."created_by" = "auth"."uid"())))))));



CREATE POLICY "proposals_update" ON "public"."project_proposals" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'finance_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND ("project_proposals"."created_by" = "auth"."uid"())))))));



CREATE POLICY "proposals_update_own" ON "public"."proposals" FOR UPDATE USING ((("submitted_by" = "auth"."uid"()) OR ("public"."get_user_role"() = 'system_admin'::"text")));



CREATE POLICY "pv_delete" ON "public"."proposal_validations" FOR DELETE USING ((("recorded_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])))))));



CREATE POLICY "pv_insert" ON "public"."proposal_validations" FOR INSERT WITH CHECK ((("recorded_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."project_proposals" "p"
     JOIN "public"."users" "u" ON (("u"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "proposal_validations"."proposal_id") AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text", 'barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) OR ("p"."created_by" = "auth"."uid"())))))));



CREATE POLICY "pv_select" ON "public"."proposal_validations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."project_proposals" "p"
     JOIN "public"."users" "u" ON (("u"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "proposal_validations"."proposal_id") AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'finance_officer'::"text", 'admin'::"text", 'barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) OR ("p"."created_by" = "auth"."uid"()))))));



CREATE POLICY "pv_update" ON "public"."proposal_validations" FOR UPDATE USING ((("recorded_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])))))));



CREATE POLICY "pve_all" ON "public"."proposal_validation_evidence" USING ((EXISTS ( SELECT 1
   FROM "public"."proposal_validations" "v"
  WHERE ("v"."id" = "proposal_validation_evidence"."validation_id"))));



CREATE POLICY "pvl_delete" ON "public"."proposal_validation_links" FOR DELETE USING ((("linked_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])))))));



CREATE POLICY "pvl_insert" ON "public"."proposal_validation_links" FOR INSERT WITH CHECK ((("linked_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."project_proposals" "p"
     JOIN "public"."users" "u" ON (("u"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "proposal_validation_links"."proposal_id") AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text", 'barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) OR ("p"."created_by" = "auth"."uid"())))))));



CREATE POLICY "pvl_select" ON "public"."proposal_validation_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."project_proposals" "p"
     JOIN "public"."users" "u" ON (("u"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "proposal_validation_links"."proposal_id") AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'finance_officer'::"text", 'admin'::"text", 'barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) OR ("p"."created_by" = "auth"."uid"()))))));



CREATE POLICY "pvs_all" ON "public"."proposal_validation_stakeholders" USING ((EXISTS ( SELECT 1
   FROM "public"."proposal_validations" "v"
  WHERE ("v"."id" = "proposal_validation_stakeholders"."validation_id"))));



CREATE POLICY "replies_insert_auth" ON "public"."discussion_replies" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "replies_read_all" ON "public"."discussion_replies" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "responses_insert_auth" ON "public"."survey_responses" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "responses_own_barangay" ON "public"."survey_responses" FOR SELECT USING ((("respondent_id" = "auth"."uid"()) OR ("public"."get_user_role"() = ANY (ARRAY['paraya_officer'::"text", 'system_admin'::"text"]))));



CREATE POLICY "sa_officer_all" ON "public"."survey_answers" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "sa_own_insert" ON "public"."survey_answers" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."survey_responses" "r"
  WHERE (("r"."id" = "survey_answers"."response_id") AND ("r"."respondent_id" = "auth"."uid"())))));



CREATE POLICY "sa_own_select" ON "public"."survey_answers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."survey_responses" "r"
  WHERE (("r"."id" = "survey_answers"."response_id") AND ("r"."respondent_id" = "auth"."uid"())))));



CREATE POLICY "sac_officer_all" ON "public"."survey_answer_codes" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "sac_staff_all" ON "public"."survey_answer_codes" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "sdg_alignment_delete" ON "public"."proposal_sdg_alignment" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."project_proposals" "p"
     JOIN "public"."users" "u" ON (("u"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "proposal_sdg_alignment"."proposal_id") AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "sdg_alignment_insert" ON "public"."proposal_sdg_alignment" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."project_proposals" "p"
     JOIN "public"."users" "u" ON (("u"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "proposal_sdg_alignment"."proposal_id") AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND ("p"."created_by" = "auth"."uid"())))))));



CREATE POLICY "sdg_alignment_select" ON "public"."proposal_sdg_alignment" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."project_proposals" "p"
  WHERE ("p"."id" = "proposal_sdg_alignment"."proposal_id"))));



CREATE POLICY "sdg_alignment_update" ON "public"."proposal_sdg_alignment" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."project_proposals" "p"
     JOIN "public"."users" "u" ON (("u"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "proposal_sdg_alignment"."proposal_id") AND (("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"])) OR (("u"."role" = ANY (ARRAY['office'::"text", 'student_org'::"text", 'department'::"text"])) AND ("p"."created_by" = "auth"."uid"())))))));



CREATE POLICY "skills_brgy_read_own" ON "public"."barangay_skills" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['barangay_captain'::"text", 'barangay_secretary'::"text", 'barangay_mother_leader'::"text", 'barangay_official'::"text"])) AND ("u"."barangay_id" = "barangay_skills"."barangay_id")))));



CREATE POLICY "skills_officer_all" ON "public"."barangay_skills" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "snap_staff_all" ON "public"."analytics_snapshots" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "sq_officer_all" ON "public"."survey_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "sq_read_published" ON "public"."survey_questions" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."surveys" "s"
  WHERE (("s"."id" = "survey_questions"."survey_id") AND ("s"."status" = 'published'::"text"))))));



CREATE POLICY "sr_officer_all" ON "public"."survey_responses" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "sr_own_insert" ON "public"."survey_responses" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."surveys" "s"
  WHERE (("s"."id" = "survey_responses"."survey_id") AND ("s"."status" = 'published'::"text"))))));



CREATE POLICY "sr_own_select" ON "public"."survey_responses" FOR SELECT USING (("respondent_id" = "auth"."uid"()));



CREATE POLICY "sr_own_update" ON "public"."survey_responses" FOR UPDATE USING (("respondent_id" = "auth"."uid"()));



CREATE POLICY "st_officer_select" ON "public"."survey_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "st_officer_write" ON "public"."survey_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."survey_answer_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."survey_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."survey_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."survey_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."survey_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."surveys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "surveys_manage_officers" ON "public"."surveys" USING (("public"."get_user_role"() = ANY (ARRAY['paraya_officer'::"text", 'system_admin'::"text"])));



CREATE POLICY "surveys_officer_all" ON "public"."surveys" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['paraya_director'::"text", 'paraya_associate'::"text", 'paraya_researcher'::"text", 'paraya_officer'::"text", 'admin'::"text"]))))));



CREATE POLICY "surveys_read_published" ON "public"."surveys" FOR SELECT USING ((("status" = 'published'::"text") AND ("auth"."uid"() IS NOT NULL)));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users_admin_only" ON "public"."users" USING (("public"."get_user_role"() = 'system_admin'::"text"));



CREATE POLICY "users_own_notifications" ON "public"."notifications" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_read_all" ON "public"."users" FOR SELECT USING (true);



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "vcs_delete_own" ON "public"."volunteer_class_schedules" FOR DELETE USING (("auth"."uid"() = "volunteer_id"));



CREATE POLICY "vcs_insert_own" ON "public"."volunteer_class_schedules" FOR INSERT WITH CHECK (("auth"."uid"() = "volunteer_id"));



CREATE POLICY "vcs_select_own" ON "public"."volunteer_class_schedules" FOR SELECT USING (("auth"."uid"() = "volunteer_id"));



CREATE POLICY "vcs_update_own" ON "public"."volunteer_class_schedules" FOR UPDATE USING (("auth"."uid"() = "volunteer_id"));



ALTER TABLE "public"."volunteer_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."volunteer_class_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "volunteer_own_logs" ON "public"."activity_logs" USING (("volunteer_id" = "auth"."uid"()));



ALTER TABLE "public"."volunteers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "volunteers_manage_own" ON "public"."volunteers" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "volunteers_read" ON "public"."volunteers" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("public"."get_user_role"() = ANY (ARRAY['paraya_officer'::"text", 'system_admin'::"text"]))));



CREATE POLICY "volunteers_read_activities" ON "public"."program_activities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_barangay"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_barangay"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_barangay"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_community_validated"("p_proposal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_community_validated"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_community_validated"("p_proposal_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_recompute_community_validated"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_recompute_community_validated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_recompute_community_validated"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_recompute_cv_on_links"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_recompute_cv_on_links"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_recompute_cv_on_links"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."activity_photos" TO "anon";
GRANT ALL ON TABLE "public"."activity_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_photos" TO "service_role";



GRANT ALL ON TABLE "public"."ai_reports" TO "anon";
GRANT ALL ON TABLE "public"."ai_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_reports" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."analytics_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."barangay_assets" TO "anon";
GRANT ALL ON TABLE "public"."barangay_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."barangay_assets" TO "service_role";



GRANT ALL ON TABLE "public"."barangay_skills" TO "anon";
GRANT ALL ON TABLE "public"."barangay_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."barangay_skills" TO "service_role";



GRANT ALL ON TABLE "public"."barangays" TO "anon";
GRANT ALL ON TABLE "public"."barangays" TO "authenticated";
GRANT ALL ON TABLE "public"."barangays" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_logs" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_logs" TO "service_role";



GRANT ALL ON TABLE "public"."community_assets" TO "anon";
GRANT ALL ON TABLE "public"."community_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."community_assets" TO "service_role";



GRANT ALL ON TABLE "public"."community_needs" TO "anon";
GRANT ALL ON TABLE "public"."community_needs" TO "authenticated";
GRANT ALL ON TABLE "public"."community_needs" TO "service_role";



GRANT ALL ON TABLE "public"."discussion_posts" TO "anon";
GRANT ALL ON TABLE "public"."discussion_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."discussion_posts" TO "service_role";



GRANT ALL ON TABLE "public"."discussion_replies" TO "anon";
GRANT ALL ON TABLE "public"."discussion_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."discussion_replies" TO "service_role";



GRANT ALL ON TABLE "public"."donation_distributions" TO "anon";
GRANT ALL ON TABLE "public"."donation_distributions" TO "authenticated";
GRANT ALL ON TABLE "public"."donation_distributions" TO "service_role";



GRANT ALL ON TABLE "public"."donations" TO "anon";
GRANT ALL ON TABLE "public"."donations" TO "authenticated";
GRANT ALL ON TABLE "public"."donations" TO "service_role";



GRANT ALL ON TABLE "public"."field_observations" TO "anon";
GRANT ALL ON TABLE "public"."field_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."field_observations" TO "service_role";



GRANT ALL ON TABLE "public"."follow_up_records" TO "anon";
GRANT ALL ON TABLE "public"."follow_up_records" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_up_records" TO "service_role";



GRANT ALL ON TABLE "public"."followup_assessments" TO "anon";
GRANT ALL ON TABLE "public"."followup_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."followup_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."forum_posts" TO "anon";
GRANT ALL ON TABLE "public"."forum_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_posts" TO "service_role";



GRANT ALL ON TABLE "public"."forum_threads" TO "anon";
GRANT ALL ON TABLE "public"."forum_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_threads" TO "service_role";



GRANT ALL ON TABLE "public"."household_profiles" TO "anon";
GRANT ALL ON TABLE "public"."household_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."household_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."impact_indicators" TO "anon";
GRANT ALL ON TABLE "public"."impact_indicators" TO "authenticated";
GRANT ALL ON TABLE "public"."impact_indicators" TO "service_role";



GRANT ALL ON TABLE "public"."impact_metrics" TO "anon";
GRANT ALL ON TABLE "public"."impact_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."impact_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."impact_qualitative" TO "anon";
GRANT ALL ON TABLE "public"."impact_qualitative" TO "authenticated";
GRANT ALL ON TABLE "public"."impact_qualitative" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."participation_forms" TO "anon";
GRANT ALL ON TABLE "public"."participation_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."participation_forms" TO "service_role";



GRANT ALL ON TABLE "public"."partnership_history" TO "anon";
GRANT ALL ON TABLE "public"."partnership_history" TO "authenticated";
GRANT ALL ON TABLE "public"."partnership_history" TO "service_role";



GRANT ALL ON TABLE "public"."program_activities" TO "anon";
GRANT ALL ON TABLE "public"."program_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."program_activities" TO "service_role";



GRANT ALL ON TABLE "public"."program_attendance" TO "anon";
GRANT ALL ON TABLE "public"."program_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."program_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."program_budgets" TO "anon";
GRANT ALL ON TABLE "public"."program_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."program_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."program_reports" TO "anon";
GRANT ALL ON TABLE "public"."program_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."program_reports" TO "service_role";



GRANT ALL ON TABLE "public"."program_sdg_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."program_sdg_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."program_sdg_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."program_signups" TO "anon";
GRANT ALL ON TABLE "public"."program_signups" TO "authenticated";
GRANT ALL ON TABLE "public"."program_signups" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."project_proposals" TO "anon";
GRANT ALL ON TABLE "public"."project_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."project_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_reviews" TO "anon";
GRANT ALL ON TABLE "public"."proposal_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_screening" TO "anon";
GRANT ALL ON TABLE "public"."proposal_screening" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_screening" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_sdg_alignment" TO "anon";
GRANT ALL ON TABLE "public"."proposal_sdg_alignment" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_sdg_alignment" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_sdg_alignments" TO "anon";
GRANT ALL ON TABLE "public"."proposal_sdg_alignments" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_sdg_alignments" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_validation_evidence" TO "anon";
GRANT ALL ON TABLE "public"."proposal_validation_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_validation_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_validation_links" TO "anon";
GRANT ALL ON TABLE "public"."proposal_validation_links" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_validation_links" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_validation_stakeholders" TO "anon";
GRANT ALL ON TABLE "public"."proposal_validation_stakeholders" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_validation_stakeholders" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_validations" TO "anon";
GRANT ALL ON TABLE "public"."proposal_validations" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_validations" TO "service_role";



GRANT ALL ON TABLE "public"."proposals" TO "anon";
GRANT ALL ON TABLE "public"."proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."proposals" TO "service_role";



GRANT ALL ON TABLE "public"."qualitative_data" TO "anon";
GRANT ALL ON TABLE "public"."qualitative_data" TO "authenticated";
GRANT ALL ON TABLE "public"."qualitative_data" TO "service_role";



GRANT ALL ON TABLE "public"."skill_categories" TO "anon";
GRANT ALL ON TABLE "public"."skill_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_categories" TO "service_role";



GRANT ALL ON TABLE "public"."survey_answer_codes" TO "anon";
GRANT ALL ON TABLE "public"."survey_answer_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_answer_codes" TO "service_role";



GRANT ALL ON TABLE "public"."survey_answers" TO "anon";
GRANT ALL ON TABLE "public"."survey_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_answers" TO "service_role";



GRANT ALL ON TABLE "public"."survey_questions" TO "anon";
GRANT ALL ON TABLE "public"."survey_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_questions" TO "service_role";



GRANT ALL ON TABLE "public"."survey_responses" TO "anon";
GRANT ALL ON TABLE "public"."survey_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_responses" TO "service_role";



GRANT ALL ON TABLE "public"."survey_templates" TO "anon";
GRANT ALL ON TABLE "public"."survey_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_templates" TO "service_role";



GRANT ALL ON TABLE "public"."surveys" TO "anon";
GRANT ALL ON TABLE "public"."surveys" TO "authenticated";
GRANT ALL ON TABLE "public"."surveys" TO "service_role";



GRANT ALL ON TABLE "public"."system_backups" TO "anon";
GRANT ALL ON TABLE "public"."system_backups" TO "authenticated";
GRANT ALL ON TABLE "public"."system_backups" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."volunteer_assignments" TO "anon";
GRANT ALL ON TABLE "public"."volunteer_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."volunteer_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."volunteer_class_schedules" TO "anon";
GRANT ALL ON TABLE "public"."volunteer_class_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."volunteer_class_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."volunteers" TO "anon";
GRANT ALL ON TABLE "public"."volunteers" TO "authenticated";
GRANT ALL ON TABLE "public"."volunteers" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

CREATE POLICY "Authenticated Upload Activity Photos" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Users View Own Activity Photos" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1]));

CREATE POLICY "auth users can upload" ON "storage"."objects" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "users view own files" ON "storage"."objects" FOR SELECT USING ((("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1]));

