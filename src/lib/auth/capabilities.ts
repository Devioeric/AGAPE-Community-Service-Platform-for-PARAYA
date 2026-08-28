import type { Role } from "@/lib/auth/roles";

export const CAPABILITIES = [
  "admin.users.manage", "admin.audit.read", "admin.recovery.read",
  "legacy_partner.history.read",
  "partnership.read", "partnership.manage",
  "partner.contact.read", "partner.contact.manage", "partner.document.read", "partner.document.manage",
  "partner.renew", "partner.policy.manage", "partner.legacy_mapping.manage",
  "historical_program.read", "historical_program.create", "historical_program.import", "historical_program.review",
  "proposal.read", "proposal.create", "proposal.review", "proposal.validation.record", "proposal.decide", "proposal.finance",
  "proposal.catalog.manage", "proposal.submit", "proposal.evidence.confirm", "proposal.handoff",
  "program.read", "program.manage",
  "budget.read", "budget.prepare", "budget.review", "budget.actual.record", "budget.liquidation.review", "budget.category.manage",
  "integrity.finance.read", "integrity.finance.request", "integrity.provider.manage",
  "volunteer.self", "volunteer.directory.read", "volunteer.manage",
  "volunteer.match.read", "volunteer.preferences.manage", "volunteer.invitation.manage", "volunteer.waitlist.review",
  "survey.read", "survey.respond", "survey.manage", "survey.analyze",
  "community_need.read", "community_need.submit", "community_need.validate", "community_need.manage",
  "observation.read", "observation.manage",
  "skill_asset.read", "skill_asset.manage",
  "attendance.self", "attendance.manage",
  "activity_log.self", "activity_log.manage",
  "donation.read", "donation.manage",
  "impact.read", "impact.manage",
  "analytics.aggregate.read",
  "report.read", "report.manage",
  "communication.read", "communication.write", "communication.manage", "communication.moderate", "communication.provider.manage",
  "ai.assist", "ai.recommendation.review", "ai.recommendation.configure",
  "profiling.cycle.manage", "profiling.collect", "profiling.validate", "profiling.endorse",
  "profiling.detail.read", "profiling.aggregate.read", "profiling.privacy.configure",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type PermissionOverrides = Record<string, boolean | undefined> | null | undefined;

export type PermissionModule = { key: string; label: string; description: string };

export const PERMISSION_MODULES = {
  user_management: { key: "user_management", label: "User management", description: "Accounts, invitations, roles, and account status." },
  audit_logs: { key: "audit_logs", label: "Audit logs", description: "Append-only security and operational audit history." },
  backup: { key: "backup", label: "Backup and recovery", description: "Purpose-bound infrastructure recovery controls." },
  historical_records: { key: "historical_records", label: "Historical records", description: "Read-only legacy proposal and program summaries." },
  partnerships: { key: "partnerships", label: "Partnerships", description: "Partner barangay and organization records." },
  partner_documents: { key: "partner_documents", label: "Partner documents", description: "Private agreements and supporting documents." },
  historical_programs: { key: "historical_programs", label: "Historical programs", description: "Retrospective program intake, provenance, and review." },
  proposals: { key: "proposals", label: "Proposals", description: "Proposal preparation and human review workflow." },
  programs: { key: "programs", label: "Programs", description: "Program planning, participation, and monitoring." },
  budgets: { key: "budgets", label: "Budgets and finance", description: "Proposal budgets, monitored actuals, and liquidation review." },
  financial_integrity: { key: "financial_integrity", label: "Financial integrity", description: "Tamper-evident proofs for cleared budgets and verified liquidations." },
  volunteers: { key: "volunteers", label: "Volunteers", description: "Volunteer profile, roster, and assignment functions." },
  surveys: { key: "surveys", label: "Surveys", description: "Survey design, response, and analysis." },
  community_needs: { key: "community_needs", label: "Community needs", description: "Need submission, validation, and monitoring." },
  observations: { key: "observations", label: "Field observations", description: "Community field observations and evidence." },
  skills_assets: { key: "skills_assets", label: "Skills and assets", description: "Community skill and asset documentation." },
  attendance: { key: "attendance", label: "Attendance", description: "Program attendance and check-in records." },
  activity_logs: { key: "activity_logs", label: "Activity logs", description: "Volunteer and program activity records." },
  donations: { key: "donations", label: "Donations", description: "Donation inventory and distribution." },
  impact: { key: "impact", label: "Impact", description: "Impact indicators, qualitative evidence, and follow-up." },
  analytics: { key: "analytics", label: "Analytics", description: "Approved aggregate statistics and visualizations." },
  reports: { key: "reports", label: "Reports", description: "Structured and AI-assisted report drafts." },
  communication: { key: "communication", label: "Communication", description: "Notifications, forum, and coordination." },
  ai_assistance: { key: "ai_assistance", label: "AI assistance", description: "Role-scoped advisory AI assistance using approved data." },
  profiling: { key: "profiling", label: "Resident profiling", description: "Sampled, consented, cycle-aware profiling." },
} as const satisfies Record<string, PermissionModule>;

export const CAPABILITY_MODULE: Record<Capability, keyof typeof PERMISSION_MODULES> = {
  "admin.users.manage": "user_management", "admin.audit.read": "audit_logs", "admin.recovery.read": "backup",
  "legacy_partner.history.read": "historical_records",
  "partnership.read": "partnerships", "partnership.manage": "partnerships",
  "partner.contact.read": "partnerships", "partner.contact.manage": "partnerships",
  "partner.document.read": "partner_documents", "partner.document.manage": "partner_documents",
  "partner.renew": "partnerships", "partner.policy.manage": "partnerships", "partner.legacy_mapping.manage": "partnerships",
  "historical_program.read": "historical_programs", "historical_program.create": "historical_programs",
  "historical_program.import": "historical_programs", "historical_program.review": "historical_programs",
  "proposal.read": "proposals", "proposal.create": "proposals", "proposal.review": "proposals",
  "proposal.validation.record": "proposals", "proposal.decide": "proposals", "proposal.finance": "proposals",
  "proposal.catalog.manage": "proposals", "proposal.submit": "proposals",
  "proposal.evidence.confirm": "proposals", "proposal.handoff": "proposals",
  "program.read": "programs", "program.manage": "programs",
  "budget.read": "budgets", "budget.prepare": "budgets", "budget.review": "budgets",
  "budget.actual.record": "budgets", "budget.liquidation.review": "budgets", "budget.category.manage": "budgets",
  "integrity.finance.read": "financial_integrity", "integrity.finance.request": "financial_integrity",
  "integrity.provider.manage": "financial_integrity",
  "volunteer.self": "volunteers", "volunteer.directory.read": "volunteers", "volunteer.manage": "volunteers",
  "volunteer.match.read": "volunteers", "volunteer.preferences.manage": "volunteers",
  "volunteer.invitation.manage": "volunteers", "volunteer.waitlist.review": "volunteers",
  "survey.read": "surveys", "survey.respond": "surveys", "survey.manage": "surveys", "survey.analyze": "surveys",
  "community_need.read": "community_needs", "community_need.submit": "community_needs",
  "community_need.validate": "community_needs", "community_need.manage": "community_needs",
  "observation.read": "observations", "observation.manage": "observations",
  "skill_asset.read": "skills_assets", "skill_asset.manage": "skills_assets",
  "attendance.self": "attendance", "attendance.manage": "attendance",
  "activity_log.self": "activity_logs", "activity_log.manage": "activity_logs",
  "donation.read": "donations", "donation.manage": "donations",
  "impact.read": "impact", "impact.manage": "impact",
  "analytics.aggregate.read": "analytics",
  "report.read": "reports", "report.manage": "reports",
  "communication.read": "communication", "communication.write": "communication", "communication.manage": "communication", "communication.moderate": "communication", "communication.provider.manage": "communication",
  "ai.assist": "ai_assistance", "ai.recommendation.review": "ai_assistance", "ai.recommendation.configure": "ai_assistance",
  "profiling.cycle.manage": "profiling", "profiling.collect": "profiling", "profiling.validate": "profiling",
  "profiling.endorse": "profiling", "profiling.detail.read": "profiling", "profiling.aggregate.read": "profiling",
  "profiling.privacy.configure": "profiling",
};

const PARAYA_READ: Capability[] = [
  "partnership.read", "proposal.read", "program.read", "volunteer.directory.read", "volunteer.manage",
  "volunteer.match.read", "volunteer.invitation.manage", "volunteer.waitlist.review",
  "survey.read", "survey.analyze", "community_need.read", "observation.read", "skill_asset.read",
  "attendance.manage", "activity_log.manage", "donation.read", "impact.read", "analytics.aggregate.read",
  "report.read", "communication.read", "ai.assist", "profiling.aggregate.read",
];

const PARTNER_V2_READ: Capability[] = [
  "partner.contact.read", "partner.document.read", "historical_program.read", "budget.read",
];

const PARTNER_V2_OPERATE: Capability[] = [
  "partner.contact.manage", "partner.document.manage", "partner.renew",
  "historical_program.create", "historical_program.import", "proposal.submit", "proposal.handoff", "budget.prepare",
];

const PARAYA_OPERATE: Capability[] = [
  "partnership.manage", "proposal.create", "proposal.review", "proposal.validation.record", "program.manage", "survey.manage",
  "community_need.manage", "observation.manage", "skill_asset.manage", "donation.manage", "impact.manage",
  "report.manage", "communication.write", "communication.manage", "communication.moderate",
];

export const ROLE_CAPABILITIES: Readonly<Partial<Record<Role, readonly Capability[]>>> = {
  paraya_director: [...PARAYA_READ, ...PARAYA_OPERATE, ...PARTNER_V2_READ, ...PARTNER_V2_OPERATE,
    "proposal.decide", "proposal.catalog.manage", "proposal.evidence.confirm", "partner.policy.manage", "partner.legacy_mapping.manage",
    "historical_program.review", "budget.category.manage", "integrity.finance.read", "integrity.finance.request",
    "profiling.privacy.configure", "ai.recommendation.review", "ai.recommendation.configure"],
  paraya_associate: [...PARAYA_READ, ...PARAYA_OPERATE, ...PARTNER_V2_READ, ...PARTNER_V2_OPERATE, "budget.actual.record"],
  paraya_researcher: [...PARAYA_READ, ...PARAYA_OPERATE, ...PARTNER_V2_READ, ...PARTNER_V2_OPERATE,
    "historical_program.review", "proposal.evidence.confirm", "budget.actual.record",
    "profiling.cycle.manage", "profiling.collect", "profiling.detail.read", "ai.recommendation.review"],
  finance_officer: ["proposal.read", "proposal.finance", "budget.read", "budget.review", "budget.liquidation.review", "integrity.finance.read", "integrity.finance.request"],
  barangay_captain: ["partnership.read", "historical_program.read", "proposal.validation.record", "survey.read", "survey.respond", "community_need.read", "community_need.submit", "community_need.validate", "observation.read", "skill_asset.read", "report.read", "communication.read", "communication.write", "ai.assist", "profiling.detail.read", "profiling.aggregate.read", "profiling.endorse"],
  barangay_secretary: ["partnership.read", "historical_program.read", "proposal.validation.record", "survey.read", "survey.respond", "community_need.read", "community_need.submit", "observation.read", "skill_asset.read", "report.read", "communication.read", "communication.write", "ai.assist", "profiling.detail.read", "profiling.aggregate.read", "profiling.validate"],
  barangay_mother_leader: ["partnership.read", "proposal.validation.record", "survey.read", "survey.respond", "community_need.read", "community_need.submit", "observation.read", "skill_asset.read", "skill_asset.manage", "communication.read", "communication.write", "ai.assist", "profiling.collect"],
  volunteer: ["program.read", "volunteer.self", "volunteer.preferences.manage", "survey.read", "survey.respond", "attendance.self", "activity_log.self", "communication.read", "communication.write", "ai.assist"],
  office: ["legacy_partner.history.read"], student_org: ["legacy_partner.history.read"], department: ["legacy_partner.history.read"],
  admin: ["admin.users.manage", "admin.audit.read", "admin.recovery.read", "integrity.provider.manage", "communication.provider.manage"],
  paraya_officer: [], barangay_official: [],
};

export const UNMAPPED_LEGACY_LOGIN_ROLES = ["paraya_officer", "barangay_official"] as const;

/** Role grants are authoritative. A false module override can only subtract. */
export function hasCapability(role: string | null | undefined, overrides: PermissionOverrides, capability: Capability): boolean {
  if (!role) return false;
  if (!(ROLE_CAPABILITIES[role as Role] ?? []).includes(capability)) return false;
  return overrides?.[CAPABILITY_MODULE[capability]] !== false;
}

export function allowedPermissionModules(role: string): string[] {
  return Array.from(new Set((ROLE_CAPABILITIES[role as Role] ?? []).map((capability) => CAPABILITY_MODULE[capability]))).sort();
}

export function permissionModulesForRole(role: string): PermissionModule[] {
  return allowedPermissionModules(role).map((key) => PERMISSION_MODULES[key as keyof typeof PERMISSION_MODULES]);
}

export function normalizeDenyOnlyOverrides(role: string, input: unknown): Record<string, false> {
  if (input === null || input === undefined) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("permissions must be an object");
  const allowed = new Set(allowedPermissionModules(role));
  const normalized: Record<string, false> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(key)) throw new Error(`Unknown permission module: ${key}`);
    if (typeof value !== "boolean") throw new Error(`Permission ${key} must be boolean`);
    if (value === false) normalized[key] = false;
  }
  return normalized;
}
