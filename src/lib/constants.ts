export const APP_NAME = "AGAPE";
export const APP_TAGLINE = "Empowering Communities Through Service";
export const ORG_NAME = "PARAYA — Dr. Yanga's Colleges, Inc.";

// Role labels live in src/lib/auth/roles.ts (single source of truth).
// Re-exported here for backward compatibility with existing imports.
export { ROLE_LABELS } from "@/lib/auth/roles";

export const SDG_LABELS: Record<number, string> = {
  4: "Quality Education",
  9: "Industry, Innovation & Infrastructure",
  11: "Sustainable Cities & Communities",
  17: "Partnerships for the Goals",
};

export const SDG_COLORS: Record<number, string> = {
  4: "#C5192D",
  9: "#FD6925",
  11: "#FD9D24",
  17: "#19486A",
};

export const NEEDS_CATEGORIES = [
  { value: "health", label: "Health" },
  { value: "economic", label: "Economic" },
  { value: "environmental", label: "Environmental" },
  { value: "social", label: "Social" },
] as const;

export const DONATION_TYPES = [
  { value: "in_kind", label: "In-Kind" },
  { value: "cash", label: "Cash" },
  { value: "equipment", label: "Equipment" },
  { value: "food", label: "Food" },
  { value: "other", label: "Other" },
] as const;

export const ITEMS_PER_PAGE = 10;

// ─── DYCI Org directories ────────────────────────────────────────────────────
//
// Seed lists used by the admin "Add User" dialog when creating partner / volunteer
// accounts. Edit here to add/remove options without touching the UI.

export const DYCI_DEPARTMENTS = [
  "College of Computer Studies (CCS)",
  "College of Engineering (COE)",
  "College of Business Administration (CBA)",
  "College of Arts and Sciences (CAS)",
  "College of Education (COED)",
  "College of Nursing (CN)",
  "College of Hospitality and Tourism Management (CHTM)",
  "Senior High School (SHS)",
  "Junior High School (JHS)",
] as const;

export const DYCI_OFFICES = [
  "Office of the President",
  "Office of the Vice President for Academic Affairs",
  "Office of Student Affairs and Services (OSAS)",
  "Office of the Registrar",
  "Office of the Guidance Counselor",
  "Finance Office",
  "Human Resources Office",
  "Library Services",
  "DYCI Center for Community Engagement",
  "DYCI for Sustainability",
] as const;

export const DYCI_STUDENT_ORGS = [
  "Central Student Government (CSG)",
  "Junior Philippine Computer Society (JPCS)",
  "Junior Philippine Institute of Accountants (JPIA)",
  "Society of Engineering Students",
  "Future Educators Society",
  "Nursing Students Association",
  "Hospitality Management Society",
  "DYCI Red Cross Youth Council",
  "DYCI Supreme Student Council",
] as const;

// ─── Module catalogs per role ────────────────────────────────────────────────
//
// Each role's module list defines:
//   (a) what shows in the admin permissions toggle dialog
//   (b) which keys can be turned on/off per-user (via users.permissions JSONB)
//
// The 3 PARAYA roles share a common base (full system access) and the 3
// barangay roles share their own base. The exact defaults differ per role —
// e.g., Captain gets the approval queue, Mother Leader gets sitio profiling.

type Module = { key: string; label: string; description: string };

// Module labels here mirror the scope-aligned modules surfaced in the sidebar
// (Partnership Management, Project Proposal & Approval Workflow, etc.) so the
// admin permissions toggle dialog speaks the same language as the Scope and
// Delimitation document.
const PARAYA_FULL_MODULES: Module[] = [
  { key: "profiling",         label: "Resident Profiling",               description: "Role-scoped cycle and approved-sample profiling access" },
  { key: "partnerships",      label: "Partnership Management",          description: "Manage barangay partnerships and contact directories" },
  { key: "proposals",         label: "Project Proposal & Approval Workflow", description: "Create proposals, run the validation queue, and clear them through the approval pipeline" },
  { key: "community_profile", label: "Community Needs Assessment",      description: "Conduct household profiling, field observations, and survey analysis" },
  { key: "surveys",           label: "Survey Builder",                  description: "Create, publish, and analyze community surveys" },
  { key: "field_observations", label: "Field Observations",             description: "Open-ended observation journal (Phase I of the Action Research Cycle)" },
  { key: "volunteers",        label: "Volunteer Management",            description: "Assign volunteers to programs, manage records, and run attendance check-in" },
  { key: "attendance",        label: "Attendance",                      description: "Generate QR codes / OTPs for activity check-in and view rosters" },
  { key: "skills_assets",     label: "Skill & Asset Documentation",     description: "Document community-level skills and assets per barangay" },
  { key: "programs",          label: "Program Tracking & Monitoring",   description: "Manage active programs, activities, Activity Reports, and Financial Reports" },
  { key: "donations",         label: "Donation & Resource Management",  description: "Log and track donations and their distribution" },
  { key: "analytics",         label: "Analytics",                       description: "View dashboards, the SDG Impact Tracker, and cross-tabulations" },
  { key: "impact",            label: "Impact Measurement",              description: "Record and view program impact indicators and qualitative data" },
  { key: "reports",           label: "Reporting & AI Narrative Reports",description: "Generate organized reports and AI-powered narratives in PDF and Excel" },
  { key: "forum",             label: "Communication (Forum)",           description: "Participate in and moderate the community discussion forum" },
];

const VOLUNTEER_MODULES: Module[] = [
  { key: "barangay",     label: "Partnership Management",      description: "View assigned barangay profile and partnership history" },
  { key: "programs",     label: "Volunteer Management",        description: "Sign up for programs, view schedule, check in, log activity, and track hours" },
  { key: "schedule",     label: "Schedule",                    description: "View calendar of upcoming program activities" },
  { key: "check_in",     label: "Check In",                    description: "Check in at activities via QR code or attendance code" },
  { key: "log_activity", label: "Log Activity",                description: "Submit activity logs and service hours" },
  { key: "hours",        label: "My Hours",                    description: "View accumulated volunteer hours and summaries" },
  { key: "surveys",      label: "Community Needs Assessment",  description: "Answer surveys on behalf of beneficiaries during interviews" },
  { key: "forum",        label: "Communication (Forum)",       description: "Participate in the discussion forum with peers and officers" },
];

const BARANGAY_MODULES: Module[] = [
  { key: "profiling",    label: "Resident Profiling",           description: "Collect, validate, endorse, or view profiles according to barangay role" },
  { key: "partnership",  label: "Partnership Management",      description: "View own barangay profile, contacts, and partnership history" },
  { key: "submit_needs", label: "Community Needs Assessment",  description: "Submit and update community needs assessments" },
  { key: "approvals",    label: "Community Needs Approval",    description: "Captain-only: review and approve community needs submitted by Secretary or Mother Leader" },
  { key: "surveys",      label: "Survey Responses",            description: "Respond to surveys published by PARAYA officers" },
  { key: "reports",      label: "Reporting",                   description: "Access barangay-specific program and impact reports" },
  { key: "forum",        label: "Communication (Forum)",       description: "Participate in the discussion forum with PARAYA staff and volunteers" },
];

export const ROLE_MODULES: Record<string, Module[]> = {
  // New roles
  paraya_director:        PARAYA_FULL_MODULES,
  paraya_associate:       PARAYA_FULL_MODULES,
  paraya_researcher:      PARAYA_FULL_MODULES,
  volunteer:              VOLUNTEER_MODULES,
  barangay_captain:       BARANGAY_MODULES,
  barangay_secretary:     BARANGAY_MODULES,
  barangay_mother_leader: BARANGAY_MODULES,

  // Legacy aliases — kept identical so existing users continue working
  paraya_officer:         PARAYA_FULL_MODULES,
  barangay_official:      BARANGAY_MODULES,
};
