import { hasCapability, type PermissionOverrides } from "@/lib/auth/capabilities";
import { capChatbotContext } from "@/lib/ai/chatbot-token-budget";
import { NAVIGATION_CATALOG, getDiscoverableNavigationEntries, getNavigationEntry, navigationMatchScore, navigationPathForPrompt, type NavigationAvailability, type NavigationFeatureFlags, type ResolvedNavigationEntry } from "./catalog";

export type ChatbotNavigationLink = { id: string; label: string; href: string; description: string; availability: NavigationAvailability };
export const NAVIGATION_MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", partnerships: "Partnerships", proposals: "Proposals", phase2: "Structured Proposals & Finance",
  profiling: "Community Profile", community_profile: "Legacy Household Data", needs: "Community Needs", surveys: "Surveys",
  observations: "Field Observations", volunteers: "Volunteers", attendance: "Attendance", skills_assets: "Skills & Assets",
  programs: "Programs", donations: "Donations", analytics: "Analytics", impact: "Impact", reports: "Reporting", forum: "Communication",
  notifications: "Notifications", profile: "Profile Settings", schedule: "My Schedule", activity_logs: "Activity Logs", hours: "My Hours",
  budget: "Budget", ai_assistance: "AI Assistant", user_management: "Users", audit_logs: "Audit Logs", backup: "Backup & Recovery",
  financial_integrity: "Financial Integrity", communication: "Communication Delivery", readiness: "System Readiness",
};

export function isNavigationQuestion(message: string): boolean {
  return /\b(how (?:do|can|to|should)|where|which (?:page|route|tab)|steps to|instructions|workflow|approval pipeline|requirements|paano|saan|nasaan|buksan|navigate|take me|open|show me (?:the )?(?:system|modules|pages)|what can i do|what is this page)\b/i.test(message);
}

export function isBroadNavigationQuestion(message: string): boolean {
  return /\b(show me (?:the )?system|all (?:the )?(?:modules|pages|features)|system tour|what (?:features|modules) (?:can|do) i)\b/i.test(message);
}

/** Static catalog retrieval only: no Supabase or provider IO. */
export function resolveAssistantNavigation(input: {
  role: string; permissions?: PermissionOverrides; message: string; module?: string | null;
  topics?: readonly string[]; currentRouteId?: string | null; featureFlags?: NavigationFeatureFlags;
}): { context: string; links: ChatbotNavigationLink[]; routeIds: string[] } {
  if (!hasCapability(input.role, input.permissions, "ai.assist")) return { context: "", links: [], routeIds: [] };
  const allowed = getDiscoverableNavigationEntries(input.role, input.permissions, input.featureFlags);
  const moduleAliases: Record<string, string> = { classes: "schedule", skills: "skills_assets", assets: "skills_assets" };
  const moduleKey = input.module ? moduleAliases[input.module] ?? input.module : null;
  const candidates = moduleKey ? allowed.filter(item => item.module === moduleKey || (moduleKey === "budget" && item.id === "officer.phase2.finance")) : allowed;
  let selected: ResolvedNavigationEntry[] = [];
  const broad = !moduleKey && isBroadNavigationQuestion(input.message);
  if (broad) {
    const seen = new Set<string>();
    selected = candidates.filter(item => {
      if (seen.has(item.module) || item.status !== "active") return false;
      seen.add(item.module); return true;
    });
  } else {
    const scored = candidates.map(item => ({ item, score: navigationMatchScore(item, input.message) }))
      .filter(row => row.score > 0).sort((a, b) => b.score - a.score);
    selected = scored.slice(0, 2).map(row => row.item);
    if (!selected.length && moduleKey) selected = candidates.slice(0, 2);
    if (!selected.length && input.topics?.length) {
      const keys = new Set(input.topics);
      selected = candidates.filter(item => keys.has(item.id) || keys.has(item.module)).slice(0, 2);
    }
    if (!selected.length && /\b(here|this page|dito|page na ito)\b/i.test(input.message)) {
      selected = candidates.filter(item => item.id === input.currentRouteId).slice(0, 1);
    }
    if (!selected.length && /\b(that|those|them|same|more|what about|continue)\b/i.test(input.message)) {
      selected = candidates.filter(item => input.topics?.includes(item.id)).slice(0, 2);
    }
    // Only public, already-authorized canonical targets replace retired aliases.
    if (!selected.length) {
      const redirect = NAVIGATION_CATALOG.find(item => item.status === "retired_redirect" && navigationMatchScore(item, input.message) > 0);
      if (redirect) selected = candidates.filter(item => item.href === redirect.redirectTo).slice(0, 1);
    }
  }
  if (!selected.length) return {
    context: input.topics?.length ? "" : "No verified authorized destination matched. Ask which feature the user means; do not invent a route, reveal restricted paths, or claim a feature is available.", links: [], routeIds: [],
  };
  const lines: string[] = [];
  const links: ChatbotNavigationLink[] = [];
  for (const item of selected) {
    const href = navigationPathForPrompt(item);
    if (!href) continue;
    const status = item.availability === "disabled" ? "disabled in this environment" : item.availability === "check_page" ? "check feature/database readiness on the page" : "page available; record/action prerequisites still apply";
    const title = broad ? NAVIGATION_MODULE_LABELS[item.module] ?? item.label : item.assistantLabel ?? item.label;
    const steps = broad ? "" : (item.workflowSteps ?? []).join(" ");
    const line = `${title} → ${href} [${status}]. ${broad ? "" : item.assistantDescription + " " + steps}`.trim();
    // Enforce a separate 4k static guidance budget at complete-entry boundaries.
    if (lines.join("\n").length + line.length + 1 > 4_000) break;
    lines.push(line);
    if (item.availability !== "disabled") links.push({ id: item.id, label: item.assistantLabel ?? item.label, href, description: item.assistantDescription, availability: item.availability });
  }
  return { context: capChatbotContext(lines.join("\n")), links, routeIds: selected.slice(0, 2).map(item => item.id) };
}

/** Defense in depth for metadata only; never turns model prose into a link. */
export function validNavigationLinks(value: unknown): value is ChatbotNavigationLink[] {
  return Array.isArray(value) && value.length <= 24 && value.every(link => {
    if (!link || typeof link !== "object") return false;
    const item = getNavigationEntry(link.id);
    return item && item.status !== "retired_redirect" && item.status !== "coming_soon" &&
      link.href === navigationPathForPrompt(item) && link.label === (item.assistantLabel ?? item.label) && link.description === item.assistantDescription &&
      ["available", "check_page"].includes(link.availability);
  }) && new Set(value.map(item => item.id)).size === value.length;
}
