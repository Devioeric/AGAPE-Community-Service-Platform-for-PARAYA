import { hasCapability, type Capability, type PermissionOverrides } from "@/lib/auth/capabilities";

export interface ChatbotModule { key: string; label: string; topics: string[] }

const MODULES: Array<ChatbotModule & { any: readonly Capability[] }> = [
  { key: "proposals", label: "Proposals", topics: ["proposals"], any: ["proposal.read"] },
  { key: "programs", label: "Programs", topics: ["programs", "schedule"], any: ["program.read"] },
  { key: "surveys", label: "Surveys", topics: ["surveys"], any: ["survey.read"] },
  { key: "volunteers", label: "Volunteers", topics: ["volunteers"], any: ["volunteer.directory.read"] },
  { key: "partnerships", label: "Partnerships", topics: ["partnerships"], any: ["partnership.read"] },
  { key: "donations", label: "Donations", topics: ["donations"], any: ["donation.read"] },
  { key: "needs", label: "Community Needs", topics: ["needs"], any: ["community_need.read"] },
  { key: "skills_assets", label: "Skills & Assets", topics: ["skills", "assets"], any: ["skill_asset.read"] },
  { key: "impact", label: "Impact", topics: ["impact"], any: ["impact.read"] },
  { key: "budget", label: "Budget", topics: ["budget"], any: ["proposal.read", "proposal.finance"] },
  { key: "reports", label: "Reports", topics: ["reports"], any: ["report.read"] },
  { key: "forum", label: "Communication", topics: ["forum"], any: ["communication.read"] },
  { key: "attendance", label: "Attendance", topics: ["attendance"], any: ["attendance.self", "attendance.manage"] },
  { key: "hours", label: "Volunteer Hours", topics: ["hours"], any: ["volunteer.self", "volunteer.manage"] },
  { key: "activity_logs", label: "Activity Logs", topics: ["activity_logs"], any: ["activity_log.self", "activity_log.manage"] },
  { key: "classes", label: "My Classes", topics: ["classes"], any: ["volunteer.self"] },
];

export function getAvailableModules(role: string, overrides?: PermissionOverrides): ChatbotModule[] {
  if (!hasCapability(role, overrides, "ai.assist")) return [];
  return MODULES.filter((module) => module.any.some((capability) => hasCapability(role, overrides, capability)))
    .map(({ key, label, topics }) => ({ key, label, topics }));
}

export function topicsForModule(key: string, role?: string, overrides?: PermissionOverrides): string[] | null {
  const selectedModule = MODULES.find((candidate) => candidate.key === key);
  if (!selectedModule) return null;
  if (role && !getAvailableModules(role, overrides).some((candidate) => candidate.key === key)) return null;
  return selectedModule.topics;
}

export function allowedChatbotTopics(role: string, overrides?: PermissionOverrides): Set<string> {
  return new Set(getAvailableModules(role, overrides).flatMap((module) => module.topics));
}
