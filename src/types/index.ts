// ─────────────────────────────────────────────
// Enums / Literals
// ─────────────────────────────────────────────

export type UserRole = "paraya_officer" | "volunteer" | "barangay_official" | "admin";
export type AccountStatus = "active" | "suspended" | "pending";
export type ProposalStatus = "draft" | "submitted" | "pre_screening" | "sdg_review" | "finance_review" | "approved" | "rejected";
export type ProgramStatus = "planning" | "active" | "completed" | "cancelled";
export type ActivityLogStatus = "pending" | "approved" | "rejected";
export type DonationType = "in_kind" | "cash" | "equipment" | "food" | "other";
export type DistributionType = "disaster" | "regular";
export type NeedsCategory = "health" | "economic" | "environmental" | "social";
export type SurveyStatus = "draft" | "published" | "closed";
export type QuestionType = "text" | "multiple_choice" | "checkbox" | "rating" | "date";
export type AIReportStatus = "draft" | "reviewed" | "approved";
export type FollowUpPeriod = "6_months" | "12_months";
export type NotificationType = "info" | "warning" | "success" | "reminder";
export type SDG = 4 | 9 | 11 | 17;

// ─────────────────────────────────────────────
// Users & Auth
// ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  status: AccountStatus;
  avatar_url?: string;
  phone?: string;
  barangay_id?: string;
  student_id?: string;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────
// Partnerships & Barangays
// ─────────────────────────────────────────────

export interface Barangay {
  id: string;
  name: string;
  municipality: string;
  province: string;
  contact_person: string;
  contact_phone?: string;
  contact_email?: string;
  latitude?: number;
  longitude?: number;
  total_population?: number;
  total_households?: number;
  partnership_start?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnershipHistory {
  id: string;
  barangay_id: string;
  officer_id: string;
  event_type: string;
  notes?: string;
  date: string;
  created_at: string;
}

export interface BarangayContact {
  id: string;
  barangay_id: string;
  name: string;
  position: string;
  phone?: string;
  email?: string;
  is_primary: boolean;
}

// ─────────────────────────────────────────────
// Project Proposals
// ─────────────────────────────────────────────

export interface ProjectProposal {
  id: string;
  title: string;
  rationale: string;
  objectives: string;
  target_beneficiaries: string;
  expected_beneficiary_count: number;
  barangay_id: string;
  start_date: string;
  end_date: string;
  budget: number;
  status: ProposalStatus;
  sdg_alignments: SDG[];
  created_by: string;
  reviewed_by?: string;
  is_income_generating: boolean;
  finance_clearance: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProposalReview {
  id: string;
  proposal_id: string;
  reviewer_id: string;
  stage: string;
  decision: "approved" | "rejected" | "needs_revision";
  comments?: string;
  reviewed_at: string;
}

export interface ProposalSDGAlignment {
  id: string;
  proposal_id: string;
  sdg: SDG;
  indicators: string[];
}

// ─────────────────────────────────────────────
// Community Needs Assessment
// ─────────────────────────────────────────────

export interface CommunityNeed {
  id: string;
  barangay_id: string;
  category: NeedsCategory;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  assessment_date: string;
  assessed_by: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface HouseholdProfile {
  id: string;
  barangay_id: string;
  household_number: string;
  head_of_household?: string;
  member_count: number;
  income_bracket?: string;
  primary_needs: NeedsCategory[];
  geo_location?: string;
  collected_by: string;
  collected_at: string;
}

export interface Survey {
  id: string;
  title: string;
  description?: string;
  category: NeedsCategory;
  status: SurveyStatus;
  target_barangay_id?: string;
  created_by: string;
  published_at?: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
  questions?: SurveyQuestion[];
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  is_required: boolean;
  order: number;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  respondent_id?: string;
  barangay_id?: string;
  submitted_at: string;
  answers?: SurveyAnswer[];
}

export interface SurveyAnswer {
  id: string;
  response_id: string;
  question_id: string;
  answer_text?: string;
  answer_options?: string[];
}

// ─────────────────────────────────────────────
// Volunteers
// ─────────────────────────────────────────────

export interface Volunteer {
  id: string;
  user_id: string;
  student_id: string;
  department: string;
  year_level: number;
  total_hours: number;
  consented_to_photo_use: boolean;
  created_at: string;
  updated_at: string;
  profile?: UserProfile;
}

export interface ProgramSignup {
  id: string;
  volunteer_id: string;
  program_id: string;
  status: "pending" | "confirmed" | "cancelled";
  signed_up_at: string;
  confirmed_at?: string;
}

export interface ActivityLog {
  id: string;
  volunteer_id: string;
  program_id: string | null;
  date: string;
  hours: number;
  description: string | null;
  status: ActivityLogStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VolunteerHours {
  volunteer_id: string;
  total_hours: number;
  approved_hours: number;
  pending_hours: number;
  by_program: { program_id: string; program_name: string; hours: number }[];
}

// ─────────────────────────────────────────────
// Skills & Assets
// ─────────────────────────────────────────────

export interface CommunitySkill {
  id: string;
  barangay_id: string;
  skill_name: string;
  description?: string;
  available_count?: number;
  documented_by: string;
  documented_at: string;
}

export interface CommunityAsset {
  id: string;
  barangay_id: string;
  asset_name: string;
  asset_type: string;
  description?: string;
  condition: "excellent" | "good" | "fair" | "poor";
  documented_by: string;
  documented_at: string;
}

// ─────────────────────────────────────────────
// Programs & Activities
// ─────────────────────────────────────────────

export interface Program {
  id: string;
  proposal_id?: string;
  title: string;
  description: string;
  barangay_id: string;
  start_date: string;
  end_date: string;
  status: ProgramStatus;
  budget_allocated: number;
  budget_spent: number;
  sdg_alignments: SDG[];
  lead_officer_id: string;
  created_at: string;
  updated_at: string;
  barangay?: Barangay;
}

export interface ProgramActivity {
  id: string;
  program_id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  volunteer_count: number;
  beneficiary_count: number;
  report_count: number;
  created_by: string;
  created_at: string;
}

export interface ProgramBudget {
  id: string;
  program_id: string;
  category: string;
  allocated: number;
  spent: number;
  notes?: string;
}

export interface ProgramAttendance {
  id: string;
  activity_id: string;
  volunteer_id: string;
  check_in_method: "qr" | "otp" | "manual";
  checked_in_at: string;
}

// ─────────────────────────────────────────────
// Donations
// ─────────────────────────────────────────────

export interface Donation {
  id: string;
  donor_name: string;
  donor_type: "individual" | "organization" | "company";
  donation_type: DonationType;
  description: string;
  quantity?: number;
  unit?: string;
  estimated_value?: number;
  received_date: string;
  received_by: string;
  program_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DonationDistribution {
  id: string;
  donation_id: string;
  barangay_id: string;
  distribution_type: DistributionType;
  quantity: number;
  beneficiary_count: number;
  distributed_by: string;
  distributed_at: string;
  notes?: string;
}

// ─────────────────────────────────────────────
// Analytics & AI Reports
// ─────────────────────────────────────────────

export interface AnalyticsSnapshot {
  id: string;
  period: "monthly" | "quarterly" | "yearly";
  period_start: string;
  period_end: string;
  total_programs: number;
  total_volunteers: number;
  total_volunteer_hours: number;
  total_beneficiaries: number;
  total_donations_value: number;
  sdg_scores: Record<string, number>;
  created_at: string;
}

export interface AIReport {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  narrative: string;
  status: AIReportStatus;
  generated_by: string;
  reviewed_by?: string;
  approved_at?: string;
  snapshot_id?: string;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────
// Impact Measurement
// ─────────────────────────────────────────────

export interface ImpactIndicator {
  id: string;
  program_id: string;
  beneficiaries_reached: number;
  volunteer_hours: number;
  materials_distributed: number;
  trainings_conducted: number;
  sdg_alignment: SDG[];
  recorded_at: string;
  recorded_by: string;
}

export interface ImpactQualitative {
  id: string;
  program_id: string;
  type: "testimonial" | "case_study" | "pre_narrative" | "post_narrative";
  content: string;
  author?: string;
  media_url?: string;
  created_at: string;
}

export interface FollowUpRecord {
  id: string;
  program_id: string;
  barangay_id: string;
  period: FollowUpPeriod;
  follow_up_date: string;
  findings: string;
  conducted_by: string;
  created_at: string;
}

// ─────────────────────────────────────────────
// System
// ─────────────────────────────────────────────

export interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface SystemConfig {
  id: string;
  key: string;
  value: string;
  description?: string;
  updated_by: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

export interface ForumPost {
  id: string;
  author_id: string;
  program_id?: string;
  title: string;
  content: string;
  is_pinned: boolean;
  reply_count: number;
  created_at: string;
  updated_at: string;
  author?: UserProfile;
}

// ─────────────────────────────────────────────
// API Response Wrappers
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
}
