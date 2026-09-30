import { allowedChatbotTopics, getAvailableModules, topicsForModule } from "@/lib/ai/chatbot-modules";
import type { PermissionOverrides } from "@/lib/auth/capabilities";
import { CHATBOT_LIMITS, normalizeConversationMemory, type ChatbotConversationMemory } from "./chatbot-token-budget";
import { getDiscoverableNavigationEntries } from "@/lib/navigation/catalog";
import { isNavigationQuestion, resolveAssistantNavigation } from "@/lib/navigation/assistant";

// Specific concepts precede broader ones (activity logs before general programs).
const PATTERNS: Record<string, RegExp> = {
  budget: /\b(budget|finance|funding|cost|expense|spending|liquidation|financial)\b/i,
  donations: /\b(donations?|donors?|gifts?|contributions?)\b/i,
  surveys: /\b(surveys?|questionnaire|responses?)\b/i,
  partnerships: /\b(partnerships?|partner barangays?|barangay partner)\b/i,
  needs: /\b(community needs?|needs? assessment|issues?|concerns?)\b/i,
  activity_logs: /\b(activity logs?|log entr(?:y|ies)|pending log|approved log)\b/i,
  hours: /\b(hours?|service hours?)\b/i,
  classes: /\b(class(?:es)?|class schedule|school schedule|subjects?)\b/i,
  attendance: /\b(attendance|attend|check[- ]?in|qr code|otp)\b/i,
  schedule: /\b(schedule|upcoming|tomorrow|next week|this week|events?|calendar)\b/i,
  proposals: /\b(proposals?|pipeline|sdgs?|alignment)\b/i,
  programs: /\b(programs?|projects?|activities|activity)\b/i,
  volunteers: /\b(volunteers?)\b/i,
  impact: /\b(impact|beneficiaries|indicators?|outcomes?|measurement|testimonials?|case study)\b/i,
  skills: /\b(skills?|expertise|capabilit(?:y|ies))\b/i,
  assets: /\b(assets?|community resources?|equipment)\b/i,
  forum: /\b(forum|discussions?|threads?|communication)\b/i,
  reports: /\b(reports?|narrative)\b/i,
};

export type ChatbotContextPlan = {
  kind: "navigation" | "topics" | "baseline" | "general";
  topics: string[];
  memory: ChatbotConversationMemory;
};

export function planChatbotContext(message: string, module: string | null | undefined, role: string,
  permissions?: PermissionOverrides, memory?: Partial<ChatbotConversationMemory>): ChatbotContextPlan {
  const allowed = allowedChatbotTopics(role, permissions);
  const memoryTopics = new Set(Array.from(allowed).concat(getDiscoverableNavigationEntries(role, permissions).map(item => item.id)));
  const normalized = normalizeConversationMemory(memory, memoryTopics, new Set(getAvailableModules(role, permissions).map(item => item.key)));
  const forced = module ? topicsForModule(module, role, permissions) : null;
  let topics = forced ?? Object.keys(PATTERNS).filter(topic => allowed.has(topic) && PATTERNS[topic].test(message)).slice(0, CHATBOT_LIMITS.automaticTopics);
  const navigation = isNavigationQuestion(message);
  // Explicit follow-ups reuse only identifiers, then query fresh authorized data.
  if (!topics.length && /\b(those|them|that|these|same|more|what about|and pending)\b/i.test(message)) topics = normalized.topics.slice(0, CHATBOT_LIMITS.automaticTopics);
  if (navigation) topics = resolveAssistantNavigation({ role, permissions, message, module, topics: normalized.topics }).routeIds;
  const updated = normalizeConversationMemory({ topics: [...topics, ...normalized.topics], modules: [...(module && forced ? [module] : []), ...normalized.modules] }, memoryTopics, new Set(getAvailableModules(role, permissions).map(item => item.key)));
  if (navigation) return { kind: "navigation", topics, memory: updated };
  if (topics.length) return { kind: "topics", topics, memory: updated };
  if (/\b(status|summary|summarize|overview|pending|what needs attention)\b/i.test(message)) return { kind: "baseline", topics: [], memory: updated };
  return { kind: "general", topics: [], memory: updated };
}
