import {
  ACTIVE_LOGIN_ROLES,
  type ActiveLoginRole,
  PARAYA_ROLES,
  ROLE_HOME,
} from "@/lib/auth/roles";
import { canAccessPage, hasCapability, type Capability, type PermissionOverrides } from "@/lib/auth/capabilities";

export type NavigationStatus = "active" | "embedded" | "detail" | "coming_soon" | "retired_redirect";
export type NavigationSurface = "sidebar" | "header" | "assistant";

export type NavigationFeatureFlags = Readonly<Record<string, boolean | undefined>>;

export type NavigationEntry = {
  id: string;
  label: string;
  href?: string;
  routeTemplate?: string;
  parentId?: string;
  /** Tab strip this entry belongs to; unlike parentId, it does not inherit visibility. */
  section?: string;
  /** Short label for the section tab strip; falls back to label. */
  tabLabel?: string;
  module: string;
  aliases: readonly string[];
  /** Role ids are kept as strings here so the catalog can describe a role
   * during a forward migration before the auth role union is updated. The
   * server-side active-role and capability checks remain authoritative. */
  roles?: readonly string[];
  readCapabilities: readonly Capability[];
  allReadCapabilities?: readonly Capability[];
  sidebarLabel?: string;
  /** Informational only. The assistant never invokes these actions. */
  actionCapabilities?: readonly Capability[];
  status: NavigationStatus;
  redirectTo?: string;
  featureGate?: string;
  assistantDescription: string;
  assistantLabel?: string;
  workflowSteps?: readonly string[];
  surfaces?: readonly NavigationSurface[];
  order?: number;
};

const PARAYA_AND_FINANCE = [...PARAYA_ROLES, "finance_officer"] as const;

function entry(entry: NavigationEntry): NavigationEntry {
  return Object.freeze({ ...entry, aliases: Object.freeze([...entry.aliases]) });
}

/**
 * The framework-neutral navigation source of truth. UI icons and rendering
 * stay in the client; access, labels, aliases, and route status live here.
 */
export const NAVIGATION_CATALOG: readonly NavigationEntry[] = [
  entry({ id: "officer.dashboard", label: "Dashboard", href: "/officer", module: "dashboard", aliases: ["dashboard", "home", "overview"], roles: PARAYA_AND_FINANCE, readCapabilities: [], status: "active", assistantDescription: "Open the PARAYA dashboard.", surfaces: ["sidebar", "assistant"], order: 1 }),
  entry({ id: "officer.partnerships", label: "Partnership Management", href: "/officer/partnerships", module: "partnerships", aliases: ["partnership", "partners", "barangay partners"], roles: PARAYA_ROLES, readCapabilities: ["partnership.read"], status: "active", assistantDescription: "Manage partner barangay records and partnership history.", surfaces: ["sidebar", "assistant"], order: 2 }),
  entry({ id: "officer.proposals", label: "Project Proposals", tabLabel: "All proposals", assistantLabel: "Proposals", href: "/officer/proposals", module: "proposals", aliases: ["proposal", "project proposal", "proposal pipeline"], roles: PARAYA_AND_FINANCE, readCapabilities: ["proposal.read"], actionCapabilities: ["proposal.create", "proposal.review", "proposal.decide"], status: "active", assistantDescription: "Open project proposals. Human review and final decisions happen on this page.", workflowSteps: ["Open a proposal from the list.", "Review only the actions available to your role.", "Complete any required human decision on the page."], surfaces: ["sidebar", "assistant"], order: 4 }),
  entry({ id: "officer.finance", label: "Finance Clearance", href: "/officer/finance", section: "officer.proposals", tabLabel: "Finance clearance", module: "budget", aliases: ["finance clearance", "budget clearance", "financial review"], roles: ["finance_officer"], readCapabilities: ["budget.review"], actionCapabilities: ["proposal.finance"], status: "active", assistantDescription: "Review proposal finance clearance. Finance actions remain human-only.", surfaces: ["sidebar", "assistant"], order: 3 }),
  entry({ id: "officer.phase2", label: "Structured Proposals & Finance", href: "/officer/phase-2", section: "officer.proposals", tabLabel: "Structured proposals & finance", module: "phase2", aliases: ["phase 2", "structured proposals", "finance monitoring"], roles: PARAYA_AND_FINANCE, readCapabilities: ["proposal.read", "budget.read", "partnership.read", "historical_program.read"], status: "active", assistantDescription: "Open the Phase 2 workspace. Its tabs can be capability- or feature-gated.", workflowSteps: ["Open the workspace.", "Choose a visible tab.", "If a tab is disabled, follow the readiness or feature-gate message shown there."], surfaces: ["assistant"], order: 5 }),
  entry({ id: "officer.profiling", label: "Community Profile", href: "/officer/profiling", module: "profiling", aliases: ["community profile", "barangay profile", "profiling", "community profiling"], roles: PARAYA_ROLES, readCapabilities: ["profiling.aggregate.read"], status: "active", assistantDescription: "Open Community Profile to see each barangay's aggregate profile from its profiling report, or to edit it.", workflowSteps: ["Pick a barangay from the list.", "Read its profile by section.", "Edit the counts when a new report arrives."], surfaces: ["sidebar", "assistant"], order: 6 }),
  entry({ id: "officer.community-profile-detail", label: "Barangay Profile", routeTemplate: "/officer/profiling/:id", parentId: "officer.profiling", module: "profiling", aliases: [], roles: PARAYA_ROLES, readCapabilities: ["profiling.aggregate.read"], status: "detail", surfaces: ["assistant"], assistantDescription: "Select a barangay from Community Profile before opening its profile.", order: 38 }),
  entry({ id: "officer.community-profile", label: "Legacy Household Data", href: "/officer/profiling/legacy", parentId: "officer.profiling", module: "community_profile", aliases: [], roles: PARAYA_ROLES, readCapabilities: ["profiling.detail.read"], status: "retired_redirect", redirectTo: "/officer/profiling", assistantDescription: "This legacy bookmark redirects to Community Profile.", surfaces: ["assistant"], order: 7 }),
  entry({ id: "officer.community-needs", label: "Community Needs", tabLabel: "Needs", href: "/officer/community-needs", module: "needs", aliases: ["community needs", "needs assessment", "needs intake", "submit need", "submit a need", "needs review", "review community needs", "needs review queue", "approve community needs", "suggested needs", "need suggestions", "data-derived needs"], roles: PARAYA_ROLES, readCapabilities: ["community_need.manage"], actionCapabilities: ["community_need.submit", "community_need.validate"], status: "active", assistantDescription: "Open Community Needs to submit, filter, and review needs. Pending needs are approved, returned for revision, or rejected on this page by an authorized PARAYA Officer.", surfaces: ["sidebar", "assistant"], order: 8 }),
  entry({ id: "officer.community-needs-review", label: "Needs Review Queue (legacy URL)", href: "/officer/community-needs/review", parentId: "officer.community-needs", module: "needs", aliases: [], roles: ["paraya_officer"], readCapabilities: ["community_need.validate"], actionCapabilities: ["community_need.validate"], status: "retired_redirect", redirectTo: "/officer/community-needs?status=pending_paraya_review", assistantDescription: "This legacy review bookmark redirects to the Community Needs list with pending Officer review filtered.", surfaces: ["assistant"], order: 9 }),
  entry({ id: "officer.surveys", label: "Surveys", tabLabel: "Builder", href: "/officer/surveys", module: "surveys", aliases: ["survey builder", "create survey", "surveys"], roles: PARAYA_ROLES, readCapabilities: ["survey.read"], actionCapabilities: ["survey.manage"], status: "active", assistantDescription: "Open Surveys to create and manage community surveys. Analysis and Pre/post comparison are tabs on the same page.", surfaces: ["sidebar", "assistant"], order: 10 }),
  entry({ id: "officer.survey-analysis", label: "Survey Analysis", href: "/officer/surveys/analysis", parentId: "officer.surveys", section: "officer.surveys", tabLabel: "Analysis", module: "surveys", aliases: ["survey analysis", "analyze survey"], roles: PARAYA_ROLES, readCapabilities: ["survey.read"], actionCapabilities: ["survey.analyze"], status: "active", assistantDescription: "Analyze survey responses.", surfaces: ["assistant"], order: 11 }),
  entry({ id: "officer.survey-compare", label: "Pre/Post Comparison", href: "/officer/surveys/compare", parentId: "officer.surveys", section: "officer.surveys", tabLabel: "Pre/post comparison", module: "surveys", aliases: ["pre post", "pre/post compare", "compare surveys"], roles: PARAYA_ROLES, readCapabilities: ["survey.read"], actionCapabilities: ["survey.analyze"], status: "active", assistantDescription: "Compare pre- and post-survey results.", surfaces: ["assistant"], order: 12 }),
  entry({ id: "officer.observations", label: "Field Observations", tabLabel: "Observations", href: "/officer/community-needs/observations", section: "officer.community-needs", module: "observations", aliases: ["field observations", "observation journal", "observations"], roles: PARAYA_ROLES, readCapabilities: ["observation.read"], actionCapabilities: ["observation.manage"], status: "active", assistantDescription: "Read and manage field observations within Community Needs Assessment.", surfaces: ["assistant"], order: 13 }),
  entry({ id: "officer.volunteers", label: "Volunteer Management", tabLabel: "Directory", href: "/officer/volunteers", module: "volunteers", aliases: ["volunteer directory", "volunteer management"], roles: PARAYA_ROLES, readCapabilities: ["volunteer.directory.read"], actionCapabilities: ["volunteer.manage"], status: "active", assistantDescription: "Open the PARAYA volunteer directory and management surface.", surfaces: ["sidebar", "assistant"], order: 14 }),
  entry({ id: "officer.attendance", label: "Attendance", href: "/officer/attendance", section: "officer.volunteers", tabLabel: "Attendance", module: "attendance", aliases: ["attendance", "check in records", "qr attendance"], roles: PARAYA_ROLES, readCapabilities: ["attendance.manage"], actionCapabilities: ["attendance.manage"], status: "active", assistantDescription: "Manage program attendance and check-in records.", surfaces: ["assistant"], order: 15 }),
  entry({ id: "officer.skills-assets", label: "Skill & Asset Documentation", href: "/officer/skills-assets", module: "skills_assets", aliases: ["skills", "assets", "skills and assets", "community resources"], roles: PARAYA_ROLES, readCapabilities: ["skill_asset.read"], actionCapabilities: ["skill_asset.manage"], status: "active", assistantDescription: "Document community skills and assets.", surfaces: ["sidebar", "assistant"], order: 16 }),
  entry({ id: "officer.programs", label: "Program Tracking", href: "/officer/programs", module: "programs", aliases: ["programs", "program tracking", "activities"], roles: PARAYA_ROLES, readCapabilities: ["program.read"], actionCapabilities: ["program.manage"], status: "active", assistantDescription: "Track programs, activities, reports, budgets, and completion readiness.", workflowSteps: ["Open a program from the list.", "Use its tabs for activities, volunteers, reports, finance, and evidence.", "Completion requires the configured program prerequisites."], surfaces: ["sidebar", "assistant"], order: 17 }),
  entry({ id: "officer.program-analytics", label: "Program Analytics", routeTemplate: "/officer/programs/:id/analytics", parentId: "officer.programs", module: "programs", aliases: ["program analytics", "program detail analytics"], roles: PARAYA_ROLES, readCapabilities: ["program.read"], status: "detail", assistantDescription: "Select a program from Program Tracking to view its analytics.", surfaces: ["assistant"], order: 18 }),
  entry({ id: "officer.donations", label: "Donation Management", href: "/officer/donations", module: "donations", aliases: ["donations", "donation management", "resources"], roles: PARAYA_ROLES, readCapabilities: ["donation.read"], actionCapabilities: ["donation.manage"], status: "active", assistantDescription: "Manage donations and their distribution records.", surfaces: ["sidebar", "assistant"], order: 19 }),
  entry({ id: "officer.analytics", label: "Analytics", tabLabel: "Overview", href: "/officer/analytics", module: "analytics", aliases: ["analytics", "analytics overview"], roles: PARAYA_ROLES, readCapabilities: ["analytics.aggregate.read"], status: "active", assistantDescription: "Open Analytics. Overview, SDG impact, Volunteers, Community needs, Proposals, Recommendations, and Snapshots are tabs on the same page.", surfaces: ["sidebar", "assistant"], order: 20 }),
  entry({ id: "officer.analytics.sdg", label: "SDG Impact Tracker", href: "/officer/analytics/sdg", parentId: "officer.analytics", section: "officer.analytics", tabLabel: "SDG impact", module: "analytics", aliases: ["sdg", "sdg impact", "sustainable development goals"], roles: PARAYA_ROLES, readCapabilities: ["analytics.aggregate.read"], status: "active", assistantDescription: "View AGAPE's four approved focus SDGs: 4, 9, 11, and 17.", surfaces: ["assistant"], order: 21 }),
  entry({ id: "officer.analytics.volunteers", label: "Volunteer Analytics", href: "/officer/analytics/volunteers", parentId: "officer.analytics", section: "officer.analytics", tabLabel: "Volunteers", module: "analytics", aliases: ["volunteer analytics", "volunteer statistics"], roles: PARAYA_ROLES, readCapabilities: ["analytics.aggregate.read"], status: "active", assistantDescription: "View aggregate volunteer analytics.", surfaces: ["assistant"], order: 22 }),
  entry({ id: "officer.analytics.community-needs", label: "Community Needs Analytics", href: "/officer/analytics/community-needs", parentId: "officer.analytics", section: "officer.analytics", tabLabel: "Community needs", module: "analytics", aliases: ["needs analytics", "community needs analytics"], roles: PARAYA_ROLES, readCapabilities: ["analytics.aggregate.read"], status: "active", assistantDescription: "View aggregate community-needs analytics.", surfaces: ["assistant"], order: 23 }),
  entry({ id: "officer.analytics.proposals", label: "Proposal Pipeline", href: "/officer/analytics/proposals", parentId: "officer.analytics", section: "officer.analytics", tabLabel: "Proposals", module: "analytics", aliases: ["proposal analytics", "proposal pipeline analytics"], roles: PARAYA_ROLES, readCapabilities: ["analytics.aggregate.read"], status: "active", assistantDescription: "View aggregate proposal pipeline analytics.", surfaces: ["assistant"], order: 24 }),
  entry({ id: "officer.analytics.recommendations", label: "Advisory Recommendations", href: "/officer/analytics/recommendations", parentId: "officer.analytics", section: "officer.analytics", tabLabel: "Recommendations", module: "analytics", aliases: ["recommendations", "advisory recommendations"], roles: PARAYA_ROLES, readCapabilities: ["analytics.aggregate.read"], allReadCapabilities: ["ai.assist"], status: "active", assistantDescription: "Review advisory recommendations; the assistant cannot apply them automatically.", surfaces: ["assistant"], order: 25 }),
  entry({ id: "officer.analytics.snapshots", label: "Report Snapshots", href: "/officer/analytics/snapshots", parentId: "officer.analytics", section: "officer.analytics", tabLabel: "Snapshots", module: "analytics", aliases: ["snapshots", "report snapshots"], roles: PARAYA_ROLES, readCapabilities: ["analytics.aggregate.read"], status: "active", assistantDescription: "View generated aggregate report snapshots.", surfaces: ["assistant"], order: 26 }),
  entry({ id: "officer.impact", label: "Impact Measurement", tabLabel: "Overview", href: "/officer/impact", module: "impact", aliases: ["impact", "impact measurement", "outcomes"], roles: PARAYA_ROLES, readCapabilities: ["impact.read"], actionCapabilities: ["impact.manage"], status: "active", assistantDescription: "Open Impact Measurement. Overview, Programs, Barangays, and Records are tabs; open a program or barangay for its own impact.", surfaces: ["sidebar", "assistant"], order: 27 }),
  entry({ id: "officer.impact.programs", label: "Program Impact", href: "/officer/impact/programs", parentId: "officer.impact", section: "officer.impact", tabLabel: "Programs", module: "impact", aliases: ["program impact", "program outcomes"], roles: PARAYA_ROLES, readCapabilities: ["impact.read"], status: "active", assistantDescription: "Compare impact results, targets, stories, and follow-ups for each program.", surfaces: ["assistant"], order: 27.1 }),
  entry({ id: "officer.impact.barangays", label: "Barangay Impact", href: "/officer/impact/barangays", parentId: "officer.impact", section: "officer.impact", tabLabel: "Barangays", module: "impact", aliases: ["barangay impact", "barangay outcomes"], roles: PARAYA_ROLES, readCapabilities: ["impact.read"], status: "active", assistantDescription: "Compare program impact across authorized barangays.", surfaces: ["assistant"], order: 27.2 }),
  entry({ id: "officer.impact.records", label: "Impact Records", href: "/officer/impact/records", parentId: "officer.impact", section: "officer.impact", tabLabel: "Records", module: "impact", aliases: ["impact records", "impact ledger"], roles: PARAYA_ROLES, readCapabilities: ["impact.read"], actionCapabilities: ["impact.manage"], status: "active", assistantDescription: "Record and correct impact metrics, stories, and follow-ups.", surfaces: ["assistant"], order: 27.3 }),
  entry({ id: "officer.impact.program-detail", label: "Program Impact Report", routeTemplate: "/officer/impact/programs/:id", parentId: "officer.impact.programs", module: "impact", aliases: ["program impact report"], roles: PARAYA_ROLES, readCapabilities: ["impact.read"], status: "detail", assistantDescription: "Select a program from Program Impact before opening its report.", surfaces: ["assistant"], order: 27.4 }),
  entry({ id: "officer.impact.barangay-detail", label: "Barangay Impact Report", routeTemplate: "/officer/impact/barangays/:id", parentId: "officer.impact.barangays", module: "impact", aliases: ["barangay impact report"], roles: PARAYA_ROLES, readCapabilities: ["impact.read"], status: "detail", assistantDescription: "Select a barangay from Barangay Impact before opening its report.", surfaces: ["assistant"], order: 27.5 }),
  entry({ id: "officer.reports", label: "Reporting", href: "/officer/reports", module: "reports", aliases: ["reports", "reporting", "narrative reports"], roles: PARAYA_ROLES, readCapabilities: ["report.read"], actionCapabilities: ["report.manage"], status: "active", assistantDescription: "Open reporting and AI-assisted report drafts. Human review remains required.", surfaces: ["sidebar", "assistant"], order: 28 }),
  entry({ id: "officer.report-print", label: "Report Print View", routeTemplate: "/officer/reports/:id/print", parentId: "officer.reports", module: "reports", aliases: ["print report", "report print"], roles: PARAYA_ROLES, readCapabilities: ["report.read"], status: "detail", assistantDescription: "Select a report from Reporting before opening its print view.", surfaces: ["assistant"], order: 29 }),
  entry({ id: "officer.forum", label: "Discussion Forum", href: "/officer/forum", module: "forum", aliases: ["forum", "discussion", "communication"], roles: PARAYA_ROLES, readCapabilities: ["communication.read"], actionCapabilities: ["communication.write", "communication.moderate"], status: "active", assistantDescription: "Participate in the PARAYA discussion forum.", surfaces: ["sidebar", "assistant"], order: 30 }),
  entry({ id: "officer.notifications", label: "Notifications", href: "/officer/notifications", module: "notifications", aliases: ["notifications", "notification inbox"], roles: ["paraya_officer", "finance_officer"], readCapabilities: [], status: "active", assistantDescription: "Open your self-scoped notification inbox.", surfaces: ["header", "assistant"], order: 31 }),
  entry({ id: "officer.profile", label: "Profile Settings", href: "/officer/profile", module: "profile", aliases: ["profile", "account settings", "profile settings"], roles: PARAYA_AND_FINANCE, readCapabilities: [], status: "active", assistantDescription: "Open your profile settings.", surfaces: ["header", "assistant"], order: 32 }),
  entry({ id: "officer.proposal-ppf", label: "Proposal Print Form", routeTemplate: "/officer/proposals/:id/ppf", parentId: "officer.proposals", module: "proposals", aliases: ["proposal print form", "ppf"], roles: PARAYA_ROLES, readCapabilities: ["proposal.read"], status: "detail", assistantDescription: "Select a proposal from Project Proposals before opening its print form.", surfaces: ["assistant"], order: 33 }),
  entry({ id: "officer.analytics-cross-tabs", label: "Survey Cross-Tabulations", href: "/officer/analytics/cross-tabs", module: "analytics", aliases: ["cross tabs", "cross-tabulations"], roles: PARAYA_ROLES, readCapabilities: ["analytics.aggregate.read"], status: "retired_redirect", redirectTo: "/officer/profiling", assistantDescription: "This legacy bookmark redirects to Community Profile.", surfaces: ["assistant"], order: 34 }),
  entry({ id: "officer.validations", label: "Validations", href: "/officer/validations", module: "proposals", aliases: ["validations", "proposal validations"], roles: PARAYA_ROLES, readCapabilities: ["proposal.read"], status: "retired_redirect", redirectTo: "/officer/proposals", assistantDescription: "This legacy bookmark redirects to Project Proposals.", surfaces: ["assistant"], order: 35 }),
  entry({ id: "officer.observations-retired-url", label: "Field Observations (legacy URL)", href: "/officer/observations", module: "observations", aliases: ["legacy field observations"], roles: PARAYA_ROLES, readCapabilities: ["observation.read"], status: "retired_redirect", redirectTo: "/officer/community-needs/observations", assistantDescription: "This legacy bookmark redirects to Field Observations inside Community Needs Assessment.", surfaces: ["assistant"], order: 36 }),
  entry({ id: "officer.community-profile-retired-url", label: "Legacy Household Data (legacy URL)", href: "/officer/community-profile", module: "community_profile", aliases: [], roles: PARAYA_ROLES, readCapabilities: ["profiling.detail.read"], status: "retired_redirect", redirectTo: "/officer/profiling", assistantDescription: "This legacy bookmark redirects to Community Profile.", surfaces: ["assistant"], order: 37 }),

  entry({ id: "barangay.dashboard", label: "Dashboard", href: "/barangay", module: "dashboard", roles: ["barangay_secretary"], aliases: ["dashboard", "home", "overview"], readCapabilities: [], status: "active", assistantDescription: "Open the barangay Secretary dashboard.", surfaces: ["sidebar", "assistant"], order: 1 }),
  entry({ id: "barangay.partnership", label: "Partnership Management", href: "/barangay/partnership", module: "partnerships", roles: ["barangay_secretary"], aliases: ["partnership", "our partnership"], readCapabilities: ["partnership.read"], status: "active", assistantDescription: "View your assigned barangay's partnership information.", surfaces: ["sidebar", "assistant"], order: 2 }),
  // Landing entry for the Secretary's Community Needs Assessment tabs. It has no
  // route of its own: the Sidebar link opens the first tab the Secretary can use.
  entry({ id: "barangay.needs-assessment", label: "Community Needs Assessment", module: "needs", roles: ["barangay_secretary"], aliases: ["community needs assessment"], readCapabilities: ["profiling.collect", "profiling.aggregate.read", "community_need.submit", "survey.read"], status: "embedded", assistantDescription: "Community Profile, Community Needs, and Surveys are tabs of Community Needs Assessment.", surfaces: [] }),
  entry({ id: "barangay.profiling", label: "Community Profile", href: "/barangay/profiling", section: "barangay.needs-assessment", tabLabel: "Community profile", module: "profiling", roles: ["barangay_secretary"], aliases: ["community profile", "barangay profile", "profiling"], readCapabilities: ["profiling.aggregate.read"], status: "active", assistantDescription: "See your barangay's aggregate community profile, recorded by PARAYA.", workflowSteps: ["Open Community profile.", "Read each section's counts and shares."], surfaces: ["sidebar", "assistant"], order: 3 }),
  entry({ id: "barangay.submit-needs", label: "Submit Community Needs", href: "/barangay/submit-needs", section: "barangay.needs-assessment", tabLabel: "Community needs", module: "needs", roles: ["barangay_secretary"], aliases: ["submit needs", "submit need", "submit a need", "community needs", "needs assessment"], readCapabilities: ["community_need.submit"], actionCapabilities: ["community_need.submit"], status: "active", assistantDescription: "Submit and revise community needs for your own barangay inside Community Needs Assessment.", workflowSteps: ["Create or edit the need.", "Submit it for PARAYA Officer review.", "Revise it if the Officer requests changes."], surfaces: ["sidebar", "assistant"], order: 4 }),
  entry({ id: "barangay.surveys", label: "Survey Responses", href: "/barangay/surveys", section: "barangay.needs-assessment", tabLabel: "Surveys", module: "surveys", roles: ["barangay_secretary"], aliases: ["survey responses", "surveys"], readCapabilities: ["survey.read"], status: "active", assistantDescription: "Open survey responses available to your barangay.", surfaces: ["sidebar", "assistant"], order: 5 }),
  entry({ id: "barangay.skills-assets", label: "Skill & Asset Documentation", href: "/barangay/skills-assets", module: "skills_assets", roles: ["barangay_secretary"], aliases: ["skills", "assets", "skills and assets"], readCapabilities: ["skill_asset.read"], actionCapabilities: ["skill_asset.manage"], status: "active", assistantDescription: "Manage skills and assets for your assigned barangay.", surfaces: ["sidebar", "assistant"], order: 6 }),
  entry({ id: "barangay.reports", label: "Reporting", href: "/barangay/reports", module: "reports", roles: ["barangay_secretary"], aliases: ["reports", "reporting"], readCapabilities: ["report.read"], status: "active", assistantDescription: "View barangay-specific reports.", surfaces: ["sidebar", "assistant"], order: 7 }),
  entry({ id: "barangay.forum", label: "Discussion Forum", href: "/barangay/forum", module: "forum", roles: ["barangay_secretary"], aliases: ["forum", "discussion", "communication"], readCapabilities: ["communication.read"], actionCapabilities: ["communication.write"], status: "active", assistantDescription: "Participate in the discussion forum.", surfaces: ["sidebar", "assistant"], order: 8 }),
  entry({ id: "barangay.notifications", label: "Notifications", href: "/barangay/notifications", module: "notifications", roles: ["barangay_secretary"], aliases: ["notifications", "notification inbox"], readCapabilities: [], status: "active", assistantDescription: "Open your self-scoped notification inbox.", surfaces: ["header", "assistant"], order: 9 }),
  entry({ id: "barangay.profile", label: "Profile Settings", href: "/barangay/profile", module: "profile", roles: ["barangay_secretary"], aliases: ["profile", "account settings"], readCapabilities: [], status: "active", assistantDescription: "Open your profile settings.", surfaces: ["header", "assistant"], order: 10 }),
  entry({ id: "barangay.approvals", label: "Legacy Approvals", href: "/barangay/approvals", module: "needs", roles: ["barangay_secretary"], aliases: ["captain approvals", "barangay approvals"], readCapabilities: ["community_need.submit"], status: "retired_redirect", redirectTo: "/barangay/submit-needs", assistantDescription: "This retired bookmark redirects to Submit Community Needs.", surfaces: ["assistant"], order: 11 }),

  entry({ id: "contributor.dashboard", label: "Dashboard", href: "/contributor", module: "dashboard", roles: ["contributor"], aliases: ["dashboard", "home", "overview"], readCapabilities: [], featureGate: "AGAPE_CONTRIBUTOR_ROLE_V1_ENABLED", status: "active", assistantDescription: "Open the Contributor dashboard.", surfaces: ["sidebar", "assistant"], order: 1 }),
  entry({ id: "contributor.proposals", label: "My Proposals", href: "/contributor/proposals", module: "proposals", roles: ["contributor"], aliases: ["my proposals", "create proposal", "submit proposal", "project proposal"], readCapabilities: ["contributor.proposal.read"], actionCapabilities: ["contributor.proposal.create", "contributor.proposal.submit"], featureGate: "AGAPE_CONTRIBUTOR_ROLE_V1_ENABLED", status: "active", assistantDescription: "Create and submit proposals for PARAYA Officer review. The server limits this surface to the assigned contributor organization.", workflowSteps: ["Choose one assigned DYCI office, student organization, or academic department.", "Create a draft with the target community and supporting details.", "Submit the draft for PARAYA Officer review; approval is never automatic."], surfaces: ["sidebar", "assistant"], order: 2 }),
  entry({ id: "contributor.chatbot", label: "AI Assistant", href: "/contributor/chatbot", module: "ai_assistance", roles: ["contributor"], aliases: ["ai assistant", "chatbot", "proposal help"], readCapabilities: ["ai.assist"], featureGate: "AGAPE_CONTRIBUTOR_ROLE_V1_ENABLED", status: "active", assistantDescription: "Open the advisory assistant. It answers from your own proposals only and never submits or changes them.", surfaces: ["assistant"], order: 5 }),
  entry({ id: "contributor.notifications", label: "Notifications", href: "/contributor/notifications", module: "notifications", roles: ["contributor"], aliases: ["notifications", "notification inbox"], readCapabilities: [], featureGate: "AGAPE_CONTRIBUTOR_ROLE_V1_ENABLED", status: "active", assistantDescription: "Open your self-scoped contributor notifications.", surfaces: ["header", "assistant"], order: 3 }),
  entry({ id: "contributor.profile", label: "Profile Settings", href: "/contributor/profile", module: "profile", roles: ["contributor"], aliases: ["profile", "account settings"], readCapabilities: [], featureGate: "AGAPE_CONTRIBUTOR_ROLE_V1_ENABLED", status: "active", assistantDescription: "Open contributor profile settings.", surfaces: ["header", "assistant"], order: 4 }),

  entry({ id: "volunteer.dashboard", label: "Dashboard", href: "/volunteer", module: "dashboard", roles: ["volunteer"], aliases: ["dashboard", "home", "overview"], readCapabilities: [], status: "active", assistantDescription: "Open the student volunteer dashboard.", surfaces: ["sidebar", "assistant"], order: 1 }),
  entry({ id: "volunteer.barangay", label: "Partnership Management", href: "/volunteer/barangay", module: "partnerships", roles: ["volunteer"], aliases: ["barangay", "partner barangay", "partnership"], readCapabilities: ["volunteer.self"], status: "active", assistantDescription: "View the barangay information assigned to your volunteer work.", surfaces: ["sidebar", "assistant"], order: 2 }),
  entry({ id: "volunteer.programs", label: "Available Programs", href: "/volunteer/programs", module: "programs", roles: ["volunteer"], aliases: ["programs", "available programs", "join program"], readCapabilities: ["program.read"], status: "active", assistantDescription: "Browse programs available for volunteer sign-up.", surfaces: ["sidebar", "assistant"], order: 3 }),
  entry({ id: "volunteer.schedule", label: "My Schedule", href: "/volunteer/schedule", module: "schedule", roles: ["volunteer"], aliases: ["schedule", "calendar", "classes", "class schedule", "upcoming"], readCapabilities: ["volunteer.self"], status: "active", assistantDescription: "View your volunteer schedule; class schedules are included here.", surfaces: ["sidebar", "assistant"], order: 4 }),
  entry({ id: "volunteer.check-in", label: "Check In", href: "/volunteer/check-in", module: "attendance", roles: ["volunteer"], aliases: ["attendance", "check in", "qr", "otp"], readCapabilities: ["attendance.self"], actionCapabilities: ["attendance.self"], status: "active", assistantDescription: "Check in to an eligible activity using the provided code.", surfaces: ["sidebar", "assistant"], order: 5 }),
  entry({ id: "volunteer.log-activity", label: "Log Activity", href: "/volunteer/log-activity", module: "activity_logs", roles: ["volunteer"], aliases: ["log activity", "activity log", "service log"], readCapabilities: ["activity_log.self"], actionCapabilities: ["activity_log.self"], status: "active", assistantDescription: "Submit your own activity log for review.", surfaces: ["sidebar", "assistant"], order: 6 }),
  entry({ id: "volunteer.hours", label: "My Hours", href: "/volunteer/hours", module: "hours", roles: ["volunteer"], aliases: ["hours", "volunteer hours", "service hours"], readCapabilities: ["volunteer.self"], status: "active", assistantDescription: "View your approved volunteer hours.", surfaces: ["sidebar", "assistant"], order: 7 }),
  entry({ id: "volunteer.surveys", label: "Beneficiary Surveys", href: "/volunteer/surveys", module: "surveys", roles: ["volunteer"], aliases: ["surveys", "beneficiary survey"], readCapabilities: ["survey.read"], actionCapabilities: ["survey.respond"], status: "active", assistantDescription: "Open surveys assigned to volunteer data collection.", surfaces: ["sidebar", "assistant"], order: 8 }),
  entry({ id: "volunteer.forum", label: "Discussion Forum", href: "/volunteer/forum", module: "forum", roles: ["volunteer"], aliases: ["forum", "discussion", "communication"], readCapabilities: ["communication.read"], actionCapabilities: ["communication.write"], status: "active", assistantDescription: "Participate in the volunteer discussion forum.", surfaces: ["sidebar", "assistant"], order: 9 }),
  entry({ id: "volunteer.notifications", label: "Notifications", href: "/volunteer/notifications", module: "notifications", roles: ["volunteer"], aliases: ["notifications", "notification inbox"], readCapabilities: [], status: "active", assistantDescription: "Open your self-scoped notification inbox.", surfaces: ["header", "assistant"], order: 10 }),
  entry({ id: "volunteer.profile", label: "Profile Settings", href: "/volunteer/profile", module: "profile", roles: ["volunteer"], aliases: ["profile", "account settings"], readCapabilities: [], status: "active", assistantDescription: "Open your profile settings.", surfaces: ["header", "assistant"], order: 11 }),

  entry({ id: "admin.dashboard", label: "Dashboard", href: "/admin", module: "dashboard", roles: ["admin"], aliases: ["dashboard", "home", "overview"], readCapabilities: [], status: "active", assistantDescription: "Open the system administrator dashboard.", surfaces: ["sidebar", "assistant"], order: 1 }),
  entry({ id: "admin.users", label: "Users", href: "/admin/users", module: "user_management", roles: ["admin"], aliases: ["users", "user management", "accounts"], readCapabilities: ["admin.users.manage"], actionCapabilities: ["admin.users.manage"], status: "active", assistantDescription: "Manage application accounts and invitations.", surfaces: ["sidebar", "assistant"], order: 2 }),
  entry({ id: "admin.audit", label: "Audit Logs", href: "/admin/audit-logs", module: "audit_logs", roles: ["admin"], aliases: ["audit", "audit logs"], readCapabilities: ["admin.audit.read"], status: "active", assistantDescription: "Review append-only audit history.", surfaces: ["sidebar", "assistant"], order: 3 }),
  entry({ id: "admin.backup", label: "Backup & Recovery", href: "/admin/backup", module: "backup", roles: ["admin"], aliases: ["backup", "recovery"], readCapabilities: ["admin.recovery.read"], status: "active", assistantDescription: "Open purpose-bound backup and recovery information.", surfaces: ["sidebar", "assistant"], order: 4 }),
  entry({ id: "admin.integrity", label: "Financial Integrity", href: "/admin/integrity", module: "financial_integrity", roles: ["admin"], aliases: ["financial integrity", "integrity"], readCapabilities: ["integrity.provider.manage"], status: "active", assistantDescription: "Open financial integrity provider controls.", surfaces: ["sidebar", "assistant"], order: 5 }),
  entry({ id: "admin.communications", label: "Communication Delivery", href: "/admin/communications", module: "communication", roles: ["admin"], aliases: ["communication delivery", "delivery"], readCapabilities: ["communication.provider.manage"], status: "active", assistantDescription: "Open communication delivery controls.", surfaces: ["sidebar", "assistant"], order: 6 }),
  entry({ id: "admin.readiness", label: "System Readiness", href: "/admin/readiness", module: "readiness", roles: ["admin"], aliases: ["readiness", "system readiness"], readCapabilities: ["admin.audit.read"], status: "active", assistantDescription: "Review system readiness information.", surfaces: ["sidebar", "assistant"], order: 7 }),
  entry({ id: "admin.notifications", label: "Notifications", href: "/admin/notifications", module: "notifications", roles: ["admin"], aliases: ["notifications", "notification inbox"], readCapabilities: [], status: "active", assistantDescription: "Open your self-scoped notification inbox.", surfaces: ["header", "assistant"], order: 8 }),
  entry({ id: "admin.profile", label: "Profile Settings", href: "/admin/profile", module: "profile", roles: ["admin"], aliases: ["profile", "account settings"], readCapabilities: [], status: "active", assistantDescription: "Open your profile settings.", surfaces: ["header", "assistant"], order: 9 }),

  // Dedicated placeholders are not working links; Secretary/Volunteer still use the floating widget.
  entry({ id: "admin.chatbot", label: "AI Assistant", href: "/admin/chatbot", module: "ai_assistance", roles: ["admin"], aliases: ["ai assistant"], readCapabilities: [], status: "coming_soon", assistantDescription: "The administrator assistant surface is not available in this build.", surfaces: ["assistant"] }),
  entry({ id: "barangay.chatbot", label: "AI Assistant", href: "/barangay/chatbot", module: "ai_assistance", roles: ["barangay_secretary"], aliases: ["ai assistant", "chatbot"], readCapabilities: ["ai.assist"], status: "active", assistantDescription: "Open the advisory assistant. It answers from your own barangay's records only and never submits or changes them.", surfaces: ["assistant"] }),
  entry({ id: "volunteer.chatbot", label: "AI Assistant", href: "/volunteer/chatbot", module: "ai_assistance", roles: ["volunteer"], aliases: ["ai assistant"], readCapabilities: [], status: "coming_soon", assistantDescription: "The volunteer dedicated assistant surface is not available in this build.", surfaces: ["assistant"] }),
  entry({ id: "officer.chatbot", label: "Conversational AI Chatbot", sidebarLabel: "AI Assistant", href: "/officer/chatbot", module: "ai_assistance", aliases: ["ai assistant", "chatbot"], roles: PARAYA_ROLES, readCapabilities: ["ai.assist"], status: "active", assistantDescription: "Open the dedicated advisory assistant. No workflow decisions are automated.", surfaces: ["assistant"] }),
  ...([
    ["partners", "Partner registry", "partnership.read", "AGAPE_PARTNER_REGISTRY_V2_ENABLED", ["partner registry", "partner documents", "renew partnership"]],
    ["history", "Historical programs", "historical_program.read", "AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED", ["historical programs", "historical import", "past programs"]],
    ["proposals", "Structured proposals", "proposal.read", "AGAPE_PROPOSALS_V2_ENABLED", ["structured proposals", "structured proposal", "phase 2 proposals"]],
    ["finance", "Finance monitoring", "budget.read", "AGAPE_PROGRAM_FINANCE_V2_ENABLED", ["finance monitoring", "liquidation", "expenditures", "budget"]],
  ] as const).map(([id, label, capability, featureGate, aliases]) => entry({
    id: `officer.phase2.${id}`, label, parentId: "officer.phase2", module: "phase2",
    roles: PARAYA_AND_FINANCE, aliases, readCapabilities: [capability], featureGate, status: "embedded",
    assistantDescription: `In Structured Proposals & Finance, select the ${label} tab. The page's database mode and readiness checks remain authoritative.`,
    workflowSteps: [`Open the workspace and select ${label}.`, "Check the tab's feature and database readiness messages before proceeding."],
    surfaces: ["assistant"],
  })),

];

const catalogById = new Map(NAVIGATION_CATALOG.map((item) => [item.id, item]));

export function getNavigationEntry(id: string | null | undefined): NavigationEntry | null {
  return id ? catalogById.get(id) ?? null : null;
}

export function routeMatchesEntry(pathname: string, entry: NavigationEntry): boolean {
  if (entry.href) return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
  if (!entry.routeTemplate) return false;
  const pattern = entry.routeTemplate.split("/").map((part) => part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/");
  return new RegExp(`^${pattern}(?:/|$)`).test(pathname);
}

export function getNavigationEntryForPath(pathname: string): NavigationEntry | null {
  return NAVIGATION_CATALOG
    .filter((item) => routeMatchesEntry(pathname, item))
    .sort((a, b) => (b.href ?? b.routeTemplate ?? "").length - (a.href ?? a.routeTemplate ?? "").length)[0] ?? null;
}

export function getRouteIdForPath(pathname: string): string | null {
  return getNavigationEntryForPath(pathname)?.id ?? null;
}

export type NavigationAvailability = "available" | "disabled" | "check_page";
export type ResolvedNavigationEntry = NavigationEntry & { availability: NavigationAvailability };

export function navigationAvailability(item: NavigationEntry, flags?: NavigationFeatureFlags): NavigationAvailability {
  if (!item.featureGate) return "available";
  if (flags?.[item.featureGate] === false) return "disabled";
  // An enabled environment flag is NOT proof of database readiness.
  return "check_page";
}

/** Discovery never substitutes for middleware, per-action APIs or RLS. */
export function isNavigationEntryVisible(
  item: NavigationEntry,
  role: string | null | undefined,
  permissions?: PermissionOverrides,
  featureFlags?: NavigationFeatureFlags,
  includeNonActive = false,
): boolean {
  if (!role || !ACTIVE_LOGIN_ROLES.includes(role as ActiveLoginRole)) return false;
  if (item.status === "retired_redirect" || item.status === "coming_soon") return false;
  if (!includeNonActive && item.status !== "active" && item.status !== "embedded") return false;
  if (item.featureGate && featureFlags?.[item.featureGate] === false) return false;
  if (item.roles && !item.roles.includes(role as ActiveLoginRole)) return false;
  const parent = item.parentId ? getNavigationEntry(item.parentId) : null;
  const path = item.href ?? parent?.href;
  const home = ROLE_HOME[role];
  if (!path || !home || !(path === home || path.startsWith(home + "/"))) return false;
  if (!canAccessPage(role, permissions, path)) return false;
  if (item.readCapabilities.length && !item.readCapabilities.some(capability => hasCapability(role, permissions, capability))) return false;
  if (item.allReadCapabilities?.some(capability => !hasCapability(role, permissions, capability))) return false;
  if (parent && !isNavigationEntryVisible(parent, role, permissions, featureFlags)) return false;
  return true;
}

export function getVisibleNavigationEntries(options: {
  role: string;
  permissions?: PermissionOverrides;
  featureFlags?: NavigationFeatureFlags;
  surface?: NavigationSurface;
  includeNonActive?: boolean;
}): ResolvedNavigationEntry[] {
  return NAVIGATION_CATALOG
    .filter(item => !options.surface || item.surfaces?.includes(options.surface))
    .filter(item => isNavigationEntryVisible(item, options.role, options.permissions, options.featureFlags, options.includeNonActive))
    .map(item => ({ ...item, availability: navigationAvailability(item, options.featureFlags) }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

/** Ordered tabs of a section that this user may open, including the landing entry. */
export function getSectionTabs(
  sectionId: string,
  role: string | null | undefined,
  permissions?: PermissionOverrides,
): NavigationEntry[] {
  if (!role) return [];
  return NAVIGATION_CATALOG
    .filter((item) => item.id === sectionId || item.section === sectionId)
    .filter((item) => item.status === "active" && Boolean(item.href) && isNavigationEntryVisible(item, role, permissions))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export function getDiscoverableNavigationEntries(role: string, permissions?: PermissionOverrides, featureFlags?: NavigationFeatureFlags): ResolvedNavigationEntry[] {
  return getVisibleNavigationEntries({ role, permissions, featureFlags, surface: "assistant", includeNonActive: true });
}

export function getNavigationEntriesForTopics(role: string, topics: readonly string[], permissions?: PermissionOverrides, featureFlags?: NavigationFeatureFlags): ResolvedNavigationEntry[] {
  const aliases: Record<string, string> = { skills: "skills_assets", assets: "skills_assets", classes: "schedule" };
  const keys = new Set(topics.map(topic => aliases[topic] ?? topic));
  const available = getDiscoverableNavigationEntries(role, permissions, featureFlags).filter(item => item.status === "active");
  const exact = available.filter(item => keys.has(item.id));
  const moduleMatches = available.filter(item => keys.has(item.module) && !exact.some(candidate => candidate.module === item.module));
  return [...exact, ...moduleMatches].filter((item, index, items) => items.findIndex(candidate => candidate.module === item.module) === index).slice(0, 2);
}

export function normalizeNavigationText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function navigationMatchScore(item: NavigationEntry, message: string): number {
  const text = " " + normalizeNavigationText(message) + " ";
  return Math.max(0, ...[item.label, ...item.aliases].map(alias => {
    const value = normalizeNavigationText(alias);
    return text.includes(" " + value + " ") ? value.length : 0;
  }));
}

export function findNavigationEntries(message: string, role: string, permissions?: PermissionOverrides, featureFlags?: NavigationFeatureFlags): ResolvedNavigationEntry[] {
  return getDiscoverableNavigationEntries(role, permissions, featureFlags)
    .map(item => ({ item, score: navigationMatchScore(item, message) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2).map(row => row.item);
}

export function navigationPathForPrompt(item: NavigationEntry): string {
  // No dynamic template/record IDs are sent to a provider.
  return item.href ?? (item.parentId ? getNavigationEntry(item.parentId)?.href : undefined) ?? "";
}
