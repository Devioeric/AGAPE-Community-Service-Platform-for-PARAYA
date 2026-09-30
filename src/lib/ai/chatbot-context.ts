import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isParayaStaff, isBarangayRole } from "@/lib/auth/roles";
import { hasCapability, type Capability, type PermissionOverrides } from "@/lib/auth/capabilities";
import { capChatbotContext, CONTEXT_UNAVAILABLE } from "./chatbot-token-budget";
import { communityProfileDataSchema } from "@/lib/community-profile/schema";
import { keyFigures } from "@/lib/community-profile/server";
import { formatPercent } from "@/lib/community-profile/stats";

interface BuildContextInput {
  supabase: SupabaseClient;
  userId: string;
  role: string;
  permissions: PermissionOverrides;
  barangayId?: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
function plusDays(days: number): string {
  const date = new Date(); date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
function semesterStart(): string {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() >= 7 ? "08" : "01"}-01`;
}

const CONTRIBUTOR_STATUS_LABEL: Record<string, string> = {
  draft: "draft (not yet submitted)", submitted: "submitted, waiting for pre-screening", pre_screening: "in pre-screening",
  evidence_review: "in evidence review", finance_review: "in finance review", director_review: "in final PARAYA Officer review",
  revisions_requested: "returned for revisions", approved: "approved", rejected: "not approved",
};

/**
 * Live data for a Contributor: only proposals this account created, with their
 * workflow stage, schedule, requested cash, and the latest reviewer remark.
 */
export async function contributorProposalContext(userId: string): Promise<string> {
  const admin = createAdminClient();
  const owned = await admin.from("project_proposals").select("id,title,updated_at").throwOnError()
    .eq("created_by", userId).order("updated_at", { ascending: false }).limit(50);
  const proposals = owned.data ?? [];
  if (proposals.length === 0) return "Your proposals: none yet. You can create one on My Proposals.";
  const ids = proposals.map((row) => row.id);
  const [profiles, events] = await Promise.all([
    admin.from("proposal_v2_profiles").select("proposal_id,workflow_status,starts_on,ends_on,active_budget_revision_id").throwOnError().in("proposal_id", ids),
    admin.from("proposal_workflow_events_v2").select("proposal_id,action,remarks,occurred_at").throwOnError()
      .in("proposal_id", ids).not("remarks", "is", null).order("occurred_at", { ascending: false }).limit(100),
  ]);
  const profileById = new Map((profiles.data ?? []).map((row) => [row.proposal_id, row]));
  const revisionIds = (profiles.data ?? []).map((row) => row.active_budget_revision_id).filter((id): id is string => typeof id === "string");
  const budgets = revisionIds.length
    ? await admin.from("proposal_budget_revisions").select("id,cash_total,in_kind_total").throwOnError().in("id", revisionIds)
    : { data: [] as Array<{ id: string; cash_total: number | string; in_kind_total: number | string }> };
  const budgetById = new Map((budgets.data ?? []).map((row) => [row.id, row]));
  const remarkById = new Map<string, { remarks: string; occurred_at: string }>();
  for (const event of events.data ?? []) if (!remarkById.has(event.proposal_id)) remarkById.set(event.proposal_id, event);

  const byStatus: Record<string, number> = {};
  const lines = proposals.map((row) => {
    const profile = profileById.get(row.id);
    const status = profile?.workflow_status ?? "draft";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const budget = profile?.active_budget_revision_id ? budgetById.get(profile.active_budget_revision_id) : undefined;
    const cash = budget ? Number(budget.cash_total) : 0;
    const remark = remarkById.get(row.id);
    return [
      `- ${row.title}: ${CONTRIBUTOR_STATUS_LABEL[status] ?? status}`,
      profile?.starts_on ? `, ${profile.starts_on} to ${profile.ends_on ?? "?"}` : "",
      Number.isFinite(cash) && cash > 0 ? `, cash requested PHP ${cash.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "",
      remark ? `. Latest reviewer remark (${remark.occurred_at.slice(0, 10)}): "${remark.remarks.slice(0, 300)}"` : "",
    ].join("");
  });
  return [
    `Your proposals (${proposals.length}, only proposals you created):`,
    `By stage: ${Object.entries(byStatus).map(([status, n]) => `${CONTRIBUTOR_STATUS_LABEL[status] ?? status} ${n}`).join("; ")}`,
    lines.slice(0, 15).join("\n"),
  ].join("\n");
}

/** The broad baseline is compact, capability-filtered, and never combined with topic data. */
export async function buildChatbotContext(input: BuildContextInput): Promise<string> {
  const { userId, role, permissions, barangayId } = input;
  const can = (capability: Capability) => hasCapability(role, permissions, capability);
  if (!can("ai.assist")) return "";
  if (isBarangayRole(role) && !barangayId) return CONTEXT_UNAVAILABLE;
  const admin = createAdminClient();
  const jobs: Array<Promise<string>> = [];
  const count = (label: string, query: PromiseLike<{ count: number | null; error: unknown }>) => {
    jobs.push(Promise.resolve(query).then(result => {
      if (result.error || result.count === null) return `${label}: unavailable; do not infer a count.`;
      return `${label}: ${result.count}`;
    }).catch(() => `${label}: unavailable; do not infer a count.`));
  };
  const selectCount = (table: string) => admin.from(table).select("id", { count: "exact", head: true });

  if (isParayaStaff(role)) {
    if (can("program.read")) count("Active programs", selectCount("programs").eq("status", "active"));
    if (can("proposal.read")) count("Proposals awaiting review (any stage)", selectCount("project_proposals").in("status", ["submitted", "pre_screening", "sdg_review", "finance_review"]));
    if (can("community_need.read")) count("Community needs submitted in last 30 days", selectCount("community_needs").gte("created_at", plusDays(-30)));
    if (can("community_need.validate")) count("Community needs awaiting PARAYA Officer review", selectCount("community_needs").eq("approval_status", "pending_paraya_review"));
    if (can("profiling.aggregate.read")) count("Barangays with a community profile", selectCount("barangay_community_profiles"));
  } else if (isBarangayRole(role)) {
    if (can("community_need.read")) {
      count("Community needs awaiting PARAYA review", selectCount("community_needs").eq("barangay_id", barangayId!).eq("approval_status", "pending_paraya_review"));
      count("Community needs needing revision", selectCount("community_needs").eq("barangay_id", barangayId!).eq("approval_status", "needs_revision"));
    }
    if (can("profiling.aggregate.read")) jobs.push((async () => {
      const result = await admin.from("barangay_community_profiles").select("respondent_households, data").eq("barangay_id", barangayId!).maybeSingle();
      if (result.error) return "Community profile: unavailable; do not infer figures.";
      if (!result.data) return "Community profile: not recorded yet by PARAYA.";
      const parsed = communityProfileDataSchema.safeParse(result.data.data);
      const figures = keyFigures(parsed.success ? parsed.data : {}).map((figure) => `${figure.label} ${formatPercent(figure.percent)}`).join("; ");
      return `Community profile (aggregate, sample-based): ${result.data.respondent_households ?? "unknown"} households surveyed; ${figures}.`;
    })().catch(() => "Community profile: unavailable; do not infer figures."));
  } else if (role === "contributor") {
    if (can("contributor.proposal.read")) jobs.push(contributorProposalContext(userId).catch(() => CONTEXT_UNAVAILABLE));
  } else if (role === "finance_officer") {
    if (can("proposal.finance")) count("Proposals awaiting finance clearance", selectCount("project_proposals").eq("status", "finance_review").eq("finance_clearance", false));
  } else if (role === "volunteer") {
    if (can("activity_log.self")) {
      jobs.push((async () => {
        const result = await admin.from("activity_logs").select("hours").throwOnError()
          .eq("volunteer_id", userId).eq("status", "approved").gte("date", semesterStart());
        if (!result.data) return CONTEXT_UNAVAILABLE;
        const hours = result.data.reduce((sum, row) => sum + Number(row.hours), 0);
        return Number.isFinite(hours) ? `Approved service hours this semester: ${hours.toFixed(1)}` : CONTEXT_UNAVAILABLE;
      })().catch(() => CONTEXT_UNAVAILABLE));
    }
    if (can("volunteer.self") && can("program.read")) {
      jobs.push((async () => {
        const [joined, upcoming] = await Promise.all([
          admin.from("program_signups").select("status, programs(title, status, start_date)").throwOnError()
            .eq("volunteer_id", userId).neq("status", "withdrawn").limit(5),
          admin.from("program_signups").select("programs(title, start_date)").throwOnError()
            .eq("volunteer_id", userId).neq("status", "withdrawn")
            .gte("programs.start_date", today()).lte("programs.start_date", plusDays(7)).limit(5),
        ]);
        if (!joined.data || !upcoming.data) return CONTEXT_UNAVAILABLE;
        const joinedLines = joined.data.flatMap(row => {
          const program = Array.isArray(row.programs) ? row.programs[0] : row.programs;
          return program ? [`- ${program.title} (${program.status}, starts ${program.start_date ?? "TBA"})`] : [];
        });
        const upcomingLines = upcoming.data.flatMap(row => {
          const program = Array.isArray(row.programs) ? row.programs[0] : row.programs;
          return program ? [`- ${program.title} on ${program.start_date}`] : [];
        });
        return `Joined programs:\n${joinedLines.join("\n") || "none"}\nUpcoming this week:\n${upcomingLines.join("\n") || "none"}`;
      })().catch(() => CONTEXT_UNAVAILABLE));
    }
  }
  return capChatbotContext((await Promise.all(jobs)).join("\n") || "No authorized operational aggregate is available.");
}
