// Canonical list of public-schema tables included in manual backups.
// Order matters for restore: parents come before their children so foreign
// key references resolve when rows are upserted top-down.
//
// auth.users is intentionally NOT in this list — Supabase manages auth
// accounts separately and we never want to overwrite credentials from a
// backup file. The public.users table mirrors profile data for those
// accounts and IS included.

export const BACKUP_TABLES: readonly string[] = [
  // Reference / parent tables
  "barangays",
  "users",
  "survey_templates",

  // Partnership history
  "partnership_history",

  // Proposals and pipeline
  "project_proposals",
  "proposal_reviews",
  "proposal_sdg_alignment",

  // Programs and dependents
  "programs",
  "program_activities",
  "program_budgets",
  "program_signups",
  "program_attendance",
  "attendance",
  "activity_logs",

  // Community Needs Assessment
  "community_needs",
  "household_profiles",
  "field_observations",

  // Surveys
  "surveys",
  "survey_questions",
  "survey_responses",
  "survey_answers",

  // Skills & assets
  "barangay_skills",
  "barangay_assets",

  // Donations
  "donations",
  "donation_distributions",

  // Impact
  "impact_indicators",
  "impact_qualitative",
  "follow_up_records",

  // Volunteer extras
  "volunteer_class_schedules",
  "volunteers",

  // Communication & system
  "notifications",
  "forum_threads",
  "forum_posts",
  "ai_reports",
  "analytics_snapshots",
  "audit_logs",
] as const;

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupFile {
  version:        number;
  generated_at:   string;
  generated_by:   { id: string; email: string } | null;
  app:            string;
  row_count:      number;
  tables:         Record<string, unknown[]>;
}
