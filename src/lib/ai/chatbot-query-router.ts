import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffOrAdmin, isParayaStaff, isBarangayRole, isPartner, isAdmin } from "@/lib/auth/roles";
import { allowedChatbotTopics, topicsForModule } from "@/lib/ai/chatbot-modules";
import type { PermissionOverrides } from "@/lib/auth/capabilities";

interface RouterInput {
  /** User-session client — used only to look up the caller's own profile (barangay_id, etc.). */
  supabase: SupabaseClient;
  userId:   string;
  role:     string;
  permissions?: PermissionOverrides;
  barangayId?: string | null;
  message:  string;
  /** Optional: when set, bypasses keyword detection and runs only the matching module's topics. */
  module?:  string | null;
}

type Topic =
  | "budget"
  | "donations"
  | "surveys"
  | "partnerships"
  | "needs"
  | "volunteers"
  | "proposals"
  | "programs"
  | "schedule"
  | "attendance"
  | "households"
  | "impact"
  | "hours"
  | "classes"
  | "skills"
  | "assets"
  | "activity_logs"
  | "forum"
  | "reports"
  | "users"
  | "audit";

const TOPIC_PATTERNS: Record<Topic, RegExp> = {
  budget:        /\b(budget|finance|funding|cost|expense|spending|liquidation|financial)\b/i,
  donations:     /\b(donation|donations|donor|donors|gift|gifts|contribution|contributions)\b/i,
  surveys:       /\b(survey|surveys|questionnaire|response|responses)\b/i,
  partnerships:  /\b(partnership|partnerships|partner barangay|partner barangays|barangay partner)\b/i,
  needs:         /\b(community need|community needs|need assessment|needs assessment|\bissue|concern)\b/i,
  volunteers:    /\b(volunteer|volunteers|student volunteer)\b/i,
  proposals:     /\b(proposal|proposals|project proposal|pipeline)\b/i,
  programs:      /\b(program|programs|project|projects|activity|activities|ongoing program)\b/i,
  schedule:      /\b(schedule|upcoming|tomorrow|next week|this week|event|events|calendar)\b/i,
  attendance:    /\b(attendance|attend|check[- ]?in|qr code|otp)\b/i,
  households:    /\b(household|households|sitio|sitios|family|families)\b/i,
  impact:        /\b(impact|beneficiar|indicator|outcome|outcomes|measurement|testimon|case stud)\b/i,
  hours:         /\b(service hour|service hours|\bhours?\b|logged hour|approved hour)\b/i,
  classes:       /\b(class|classes|class schedule|school schedule|subject|subjects)\b/i,
  skills:        /\b(skill|skills|expertise|capability|capabilities)\b/i,
  assets:        /\b(asset|assets|community resource|community resources|equipment)\b/i,
  activity_logs: /\b(activity log|activity logs|log entry|log entries|pending log|approved log)\b/i,
  forum:         /\b(forum|discussion|discussions|thread|threads|forum post|forum posts)\b/i,
  reports:       /\b(ai report|narrative report|generated report|report draft|monthly report|quarterly report|annual report)\b/i,
  users:         /\b(\buser\b|\busers\b|account|accounts|registered member|registered members|registered user|registered users)\b/i,
  audit:         /\b(audit|audit log|audit logs|security log|access log)\b/i,
};

function detectTopics(message: string): Topic[] {
  return (Object.keys(TOPIC_PATTERNS) as Topic[]).filter((t) =>
    TOPIC_PATTERNS[t].test(message)
  );
}

async function safe<T>(p: Promise<T>, label?: string): Promise<T | null> {
  try { return await p; }
  catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[chatbot-router] handler${label ? ` "${label}"` : ""} failed:`, err);
    }
    return null;
  }
}

function section(title: string, lines: string[]): string {
  if (!lines.length) return `${title}: none visible to you`;
  return `${title}:\n${lines.join("\n")}`;
}

const today = () => new Date().toISOString().slice(0, 10);

function daysAgo(days: number): string {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysAhead(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function semesterStart(): string {
  const now = new Date();
  return now.getMonth() >= 7 ? `${now.getFullYear()}-08-01` : `${now.getFullYear()}-01-01`;
}

export async function buildQueryAwareContext({
  userId,
  role,
  permissions,
  barangayId,
  message,
  module,
}: RouterInput): Promise<string> {
  if (isPartner(role) || isAdmin(role)) return "";
  // If the user pinned a module via the UI dropdown, run only its topics —
  // skips keyword detection entirely and keeps the DATA block focused.
  const forced = module ? topicsForModule(module, role, permissions) : null;
  const allowedTopics = allowedChatbotTopics(role, permissions);
  let topics = forced
    ? (forced as Topic[])
    : detectTopics(message);
  topics = topics.filter((topic) => allowedTopics.has(topic));
  if (!topics.length) return "";

  const admin = createAdminClient();

  const handlers: Partial<Record<Topic, () => Promise<string | null>>> = {
    budget:         () => fetchBudget(admin, role),
    donations:      () => fetchDonations(admin, role),
    surveys:        () => fetchSurveys(admin, role),
    partnerships:   () => fetchPartnerships(admin, role, barangayId),
    needs:          () => fetchNeeds(admin, role, barangayId),
    volunteers:     () => fetchVolunteers(admin, role),
    proposals:      () => fetchProposals(admin, role, userId),
    programs:       () => fetchPrograms(admin, role),
    schedule:       () => fetchSchedule(admin, role, userId),
    attendance:     () => fetchAttendance(admin, role, userId),
    households:     async () => null,
    impact:         () => fetchImpact(admin, role),
    hours:          () => fetchHours(admin, role, userId),
    classes:        () => fetchClasses(admin, role, userId),
    skills:         () => fetchSkills(admin, role, barangayId),
    assets:         () => fetchAssets(admin, role, barangayId),
    activity_logs:  () => fetchActivityLogs(admin, role, userId),
    forum:          () => fetchForum(admin),
    reports:        () => fetchReports(admin, role),
    users:          () => fetchUsers(admin, role),
    audit:          () => fetchAudit(admin, role),
  };

  const blocks = await Promise.all(
    topics.map((t) => safe(handlers[t]!(), t).then((r) => r ?? null))
  );

  const filtered = blocks.filter((b): b is string => !!b);
  if (!filtered.length) return "";

  return `=== ADDITIONAL DATA (matched your question) ===\n${filtered.join("\n\n")}`;
}

// ─── Topic handlers ─────────────────────────────────────────────────────────

async function fetchBudget(supabase: SupabaseClient, role: string): Promise<string | null> {
  if (!isStaffOrAdmin(role) && role !== "finance_officer" && !isPartner(role)) return null;

  const { data } = await supabase
    .from("program_budgets")
    .select("approval_status")
    .order("updated_at", { ascending: false })
    .limit(200);

  const byStatus = (data ?? []).reduce<Record<string, number>>((counts, row) => {
    const status = typeof row.approval_status === "string" ? row.approval_status : "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  const lines = [`- Budget records: ${data?.length ?? 0}`,
    ...Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right)).map(([status, count]) => `- ${status}: ${count}`)];
  return section("Budget review summary", lines);
}

async function fetchDonations(supabase: SupabaseClient, role: string): Promise<string | null> {
  if (!isStaffOrAdmin(role)) return null;

  const [recent, totals] = await Promise.all([
    supabase.from("donations").select("item_type, quantity, received_date").is("archived_at", null).order("received_date", { ascending: false }).limit(5),
    supabase.from("donations").select("quantity").is("archived_at", null),
  ]);

  const totalQty = (totals.data ?? []).reduce((s, d) => s + (Number(d.quantity) ?? 0), 0);
  const lines = (recent.data ?? []).map((d) => `- ${d.received_date}: ${d.quantity} × ${d.item_type}`);

  return [
    `Total donation records: ${totals.data?.length ?? 0}`,
    `Total items received: ${totalQty}`,
    section("Recent donations", lines),
  ].join("\n\n");
}

async function fetchSurveys(supabase: SupabaseClient, role: string): Promise<string | null> {
  const isStaffish = isStaffOrAdmin(role);

  let query = supabase.from("surveys").select("title, status, target_barangay_id, barangays(name)").limit(10);
  if (!isStaffish) query = query.eq("status", "published");
  query = query.order("created_at", { ascending: false });

  const { data } = await query;

  const byStatus: Record<string, number> = {};
  (data ?? []).forEach((s) => { byStatus[s.status] = (byStatus[s.status] ?? 0) + 1; });
  const statusLine = Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(", ");

  const lines = (data ?? []).map((s) => {
    const b = Array.isArray(s.barangays) ? s.barangays[0] : (s.barangays as { name?: string } | null);
    return `- ${s.title} (${s.status})${b?.name ? ` — for ${b.name}` : ""}`;
  });

  return [
    statusLine ? `Surveys by status: ${statusLine}` : "",
    section("Surveys", lines),
  ].filter(Boolean).join("\n\n");
}

async function fetchPartnerships(supabase: SupabaseClient, role: string, barangayId?: string | null): Promise<string | null> {
  if (isBarangayRole(role) && !barangayId) return null;
  let query = supabase
    .from("barangays")
    .select("name, partnership_start, is_active, total_population, total_households")
    .order("name", { ascending: true })
    .limit(25);
  if (isBarangayRole(role)) query = query.eq("id", barangayId!);
  const { data } = await query;

  const active   = (data ?? []).filter((b) => b.is_active !== false);
  const inactive = (data ?? []).filter((b) => b.is_active === false);

  const totalPop  = (data ?? []).reduce((s, b) => s + (Number(b.total_population) ?? 0), 0);
  const totalHh   = (data ?? []).reduce((s, b) => s + (Number(b.total_households) ?? 0), 0);

  const lines = active.map(
    (b) => `- ${b.name}${b.partnership_start ? ` (since ${b.partnership_start})` : ""}`
  );

  const blocks: string[] = [
    `Total partner barangays: ${data?.length ?? 0}${inactive.length ? ` (${inactive.length} inactive)` : ""}`,
    `Combined population: ${totalPop.toLocaleString()}, households: ${totalHh.toLocaleString()}`,
    section("Partner barangays", lines),
  ];
  return blocks.join("\n\n");
}

async function fetchNeeds(admin: SupabaseClient, role: string, barangayId?: string | null): Promise<string | null> {
  if (isBarangayRole(role) && !barangayId) return null;
  let query = admin
    .from("community_needs")
    .select("category, priority, approval_status, sitio, barangays(name)")
    .order("created_at", { ascending: false })
    .limit(5);

  if (isBarangayRole(role)) query = query.eq("barangay_id", barangayId!);

  let priorityQuery = admin.from("community_needs").select("priority");
  let statusQuery = admin.from("community_needs").select("approval_status");
  if (isBarangayRole(role)) {
    priorityQuery = priorityQuery.eq("barangay_id", barangayId!);
    statusQuery = statusQuery.eq("barangay_id", barangayId!);
  }

  const [recent, byPriority, byStatus] = await Promise.all([
    query,
    priorityQuery,
    statusQuery,
  ]);

  const priorityCounts: Record<string, number> = {};
  (byPriority.data ?? []).forEach((n) => { priorityCounts[n.priority] = (priorityCounts[n.priority] ?? 0) + 1; });

  const statusCounts: Record<string, number> = {};
  (byStatus.data ?? []).forEach((n) => { statusCounts[n.approval_status] = (statusCounts[n.approval_status] ?? 0) + 1; });

  const lines = (recent.data ?? []).map((n) => {
    const b = Array.isArray(n.barangays) ? n.barangays[0] : (n.barangays as { name?: string } | null);
    const where = n.sitio ? `${b?.name ?? "?"} / ${n.sitio}` : b?.name ?? "?";
    return `- [${n.priority}] ${n.category} in ${where} — ${n.approval_status}`;
  });

  return [
    `Total community needs: ${byPriority.data?.length ?? 0}`,
    `By priority: ${Object.entries(priorityCounts).map(([k, v]) => `${k} (${v})`).join(", ") || "n/a"}`,
    `By approval: ${Object.entries(statusCounts).map(([k, v]) => `${k} (${v})`).join(", ") || "n/a"}`,
    section("Recent community needs", lines),
  ].join("\n\n");
}

async function fetchVolunteers(supabase: SupabaseClient, role: string): Promise<string | null> {
  if (!isStaffOrAdmin(role) && !isPartner(role)) return null;

  const [countRes, byDept] = await Promise.all([
    supabase.from("volunteers").select("id", { count: "exact", head: true }),
    supabase.from("volunteers").select("department").limit(200),
  ]);

  const deptCounts: Record<string, number> = {};
  (byDept.data ?? []).forEach((v) => {
    const d = (v.department ?? "Unassigned") as string;
    deptCounts[d] = (deptCounts[d] ?? 0) + 1;
  });
  const deptLines = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `- ${k}: ${v}`);

  return [
    `Total volunteers: ${countRes.count ?? 0}`,
    section("Top departments by volunteer count", deptLines),
  ].join("\n\n");
}

async function fetchProposals(supabase: SupabaseClient, role: string, userId: string): Promise<string | null> {
  let query = supabase
    .from("project_proposals")
    .select("title, status, is_income_generating, finance_clearance, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (isPartner(role)) query = query.eq("created_by", userId);
  else if (!isParayaStaff(role) && !isAdmin(role) && role !== "finance_officer") return null;

  const { data } = await query;

  const byStatus: Record<string, number> = {};
  (data ?? []).forEach((p) => { byStatus[p.status] = (byStatus[p.status] ?? 0) + 1; });

  const lines = (data ?? []).slice(0, 5).map((p) => {
    const flags: string[] = [];
    if (p.is_income_generating) flags.push("income-generating");
    if (p.finance_clearance)    flags.push("finance cleared");
    return `- ${p.title} — ${p.status}${flags.length ? ` [${flags.join(", ")}]` : ""}`;
  });

  return [
    `Total proposals: ${data?.length ?? 0}`,
    `By status: ${Object.entries(byStatus).map(([k, v]) => `${k} (${v})`).join(", ") || "n/a"}`,
    section("Recent proposals", lines),
  ].join("\n\n");
}

async function fetchPrograms(supabase: SupabaseClient, role: string): Promise<string | null> {
  let query = supabase
    .from("programs")
    .select("title, status, start_date, end_date, barangays(name)")
    .order("start_date", { ascending: false })
    .limit(10);

  if (role === "volunteer") {
    query = query.in("status", ["upcoming", "active"]);
  }

  const { data } = await query;

  const byStatus: Record<string, number> = {};
  (data ?? []).forEach((p) => { byStatus[p.status] = (byStatus[p.status] ?? 0) + 1; });

  const lines = (data ?? []).slice(0, 5).map((p) => {
    const b = Array.isArray(p.barangays) ? p.barangays[0] : (p.barangays as { name?: string } | null);
    return `- ${p.title} (${p.status}, ${p.start_date ?? "TBA"})${b?.name ? ` — ${b.name}` : ""}`;
  });

  return [
    `Total programs: ${data?.length ?? 0}`,
    `By status: ${Object.entries(byStatus).map(([k, v]) => `${k} (${v})`).join(", ") || "n/a"}`,
    section("Programs", lines),
  ].join("\n\n");
}

async function fetchSchedule(supabase: SupabaseClient, role: string, userId: string): Promise<string | null> {
  if (role === "volunteer") {
    const { data } = await supabase
      .from("program_activities")
      .select("title, scheduled_date, programs!inner(title, program_signups!inner(volunteer_id))")
      .eq("programs.program_signups.volunteer_id", userId)
      .gte("scheduled_date", today())
      .lte("scheduled_date", daysAhead(7))
      .order("scheduled_date", { ascending: true })
      .limit(10);

    const lines = (data ?? []).map((a) => {
      const p = Array.isArray(a.programs) ? a.programs[0] : (a.programs as { title?: string } | null);
      return `- ${a.scheduled_date}: ${a.title} (${p?.title ?? ""})`;
    });
    return section("Your activities this week", lines);
  }

  const { data } = await supabase
    .from("program_activities")
    .select("title, scheduled_date, programs(title)")
    .gte("scheduled_date", today())
    .lte("scheduled_date", daysAhead(7))
    .order("scheduled_date", { ascending: true })
    .limit(10);

  const lines = (data ?? []).map((a) => {
    const p = Array.isArray(a.programs) ? a.programs[0] : (a.programs as { title?: string } | null);
    return `- ${a.scheduled_date}: ${a.title} (${p?.title ?? ""})`;
  });
  return section("Activities this week (system-wide)", lines);
}

async function fetchAttendance(supabase: SupabaseClient, role: string, userId: string): Promise<string | null> {
  if (role === "volunteer") {
    const { count } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("volunteer_id", userId);
    return `Your total attendance check-ins: ${count ?? 0}`;
  }
  if (!isStaffOrAdmin(role)) return null;

  const [todayRes, weekRes] = await Promise.all([
    supabase.from("attendance").select("id", { count: "exact", head: true }).gte("checked_in_at", today()),
    supabase.from("attendance").select("id", { count: "exact", head: true }).gte("checked_in_at", daysAgo(7)),
  ]);

  return [
    `Attendance check-ins today: ${todayRes.count ?? 0}`,
    `Attendance check-ins last 7 days: ${weekRes.count ?? 0}`,
  ].join("\n");
}

async function fetchImpact(supabase: SupabaseClient, role: string): Promise<string | null> {
  if (!isStaffOrAdmin(role)) return null;

  const [indicators, qualitative, followups] = await Promise.all([
    supabase.from("impact_indicators").select("id", { count: "exact", head: true }).is("voided_at", null),
    supabase.from("impact_qualitative").select("id", { count: "exact", head: true }).is("voided_at", null),
    supabase.from("follow_up_records").select("id", { count: "exact", head: true }).is("voided_at", null),
  ]);

  return [
    `Quantitative impact indicators: ${indicators.count ?? 0}`,
    `Qualitative impact records (testimonials/case studies): ${qualitative.count ?? 0}`,
    `Follow-up records (6-month / 1-year): ${followups.count ?? 0}`,
  ].join("\n");
}

async function fetchHours(supabase: SupabaseClient, role: string, userId: string): Promise<string | null> {
  if (role === "volunteer") {
    const { data } = await supabase
      .from("activity_logs")
      .select("hours, status")
      .eq("volunteer_id", userId)
      .gte("date", semesterStart());

    const approved = (data ?? []).filter((l) => l.status === "approved").reduce((s, l) => s + (Number(l.hours) ?? 0), 0);
    const pending  = (data ?? []).filter((l) => l.status === "pending").reduce((s, l) => s + (Number(l.hours) ?? 0), 0);
    return [
      `Your approved hours this semester: ${approved.toFixed(1)}`,
      `Your pending-approval hours: ${pending.toFixed(1)}`,
    ].join("\n");
  }
  if (!isStaffOrAdmin(role)) return null;

  const { data } = await supabase
    .from("activity_logs")
    .select("hours, status")
    .gte("date", semesterStart());

  const approved = (data ?? []).filter((l) => l.status === "approved").reduce((s, l) => s + (Number(l.hours) ?? 0), 0);
  const pending  = (data ?? []).filter((l) => l.status === "pending").reduce((s, l) => s + (Number(l.hours) ?? 0), 0);

  return [
    `Total approved volunteer hours this semester: ${approved.toFixed(1)}`,
    `Total pending-approval hours: ${pending.toFixed(1)}`,
  ].join("\n");
}

async function fetchClasses(supabase: SupabaseClient, role: string, userId: string): Promise<string | null> {
  if (role !== "volunteer") return null;

  const { data } = await supabase
    .from("volunteer_class_schedules")
    .select("subject, day_of_week, start_time, end_time, location")
    .eq("volunteer_id", userId)
    .order("day_of_week", { ascending: true });

  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const lines = (data ?? []).map(
    (c) => `- ${dayName[c.day_of_week] ?? c.day_of_week} ${c.start_time}-${c.end_time}: ${c.subject}${c.location ? ` (${c.location})` : ""}`
  );
  return section("Your class schedule", lines);
}

async function fetchSkills(admin: SupabaseClient, role: string, barangayId?: string | null): Promise<string | null> {
  if (!isStaffOrAdmin(role) && !isBarangayRole(role)) return null;
  if (isBarangayRole(role) && !barangayId) return null;

  let query = admin
    .from("barangay_skills")
    .select("skill_name, category, practitioner_count, proficiency_level, barangays(name)")
    .order("practitioner_count", { ascending: false })
    .limit(10);
  if (isBarangayRole(role)) query = query.eq("barangay_id", barangayId!);

  const { data } = await query;
  const lines = (data ?? []).map((s) => {
    const b = Array.isArray(s.barangays) ? s.barangays[0] : (s.barangays as { name?: string } | null);
    const prof = s.proficiency_level ? `, ${s.proficiency_level}` : "";
    return `- ${s.skill_name} (${s.category ?? "uncategorized"}, ${s.practitioner_count ?? 0} practitioners${prof})${b?.name ? ` — ${b.name}` : ""}`;
  });
  return section("Documented community skills", lines);
}

async function fetchAssets(admin: SupabaseClient, role: string, barangayId?: string | null): Promise<string | null> {
  if (!isStaffOrAdmin(role) && !isBarangayRole(role)) return null;
  if (isBarangayRole(role) && !barangayId) return null;

  let query = admin.from("barangay_assets").select("asset_name, asset_type, quantity, condition, barangays(name)").limit(10);
  if (isBarangayRole(role)) query = query.eq("barangay_id", barangayId!);

  const { data } = await query;
  const lines = (data ?? []).map((a) => {
    const b = Array.isArray(a.barangays) ? a.barangays[0] : (a.barangays as { name?: string } | null);
    return `- ${a.asset_name} (${a.asset_type ?? "?"}, qty ${a.quantity ?? "?"}, ${a.condition ?? "?"})${b?.name ? ` — ${b.name}` : ""}`;
  });
  return section("Documented community assets", lines);
}

async function fetchActivityLogs(supabase: SupabaseClient, role: string, userId: string): Promise<string | null> {
  if (role === "volunteer") {
    const { data } = await supabase
      .from("activity_logs")
      .select("status, hours, programs(title)")
      .eq("volunteer_id", userId)
      .order("date", { ascending: false })
      .limit(5);

    const lines = (data ?? []).map((l) => {
      const p = Array.isArray(l.programs) ? l.programs[0] : (l.programs as { title?: string } | null);
      return `- ${p?.title ?? "(unknown)"}: ${l.hours}h — ${l.status}`;
    });
    return section("Your recent activity logs", lines);
  }
  if (!isStaffOrAdmin(role)) return null;

  const { data } = await supabase
    .from("activity_logs")
    .select("status, hours");

  const counts: Record<string, number> = { approved: 0, pending: 0, rejected: 0 };
  (data ?? []).forEach((l) => { counts[l.status] = (counts[l.status] ?? 0) + 1; });

  return [
    `Activity logs — pending: ${counts.pending}, approved: ${counts.approved}, rejected: ${counts.rejected}`,
  ].join("\n");
}

async function fetchForum(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("forum_threads")
    .select("title, category, created_at, users:author_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(5);

  const lines = (data ?? []).map((t) => {
    const u = Array.isArray(t.users) ? t.users[0] : (t.users as { full_name?: string } | null);
    return `- ${t.title} [${t.category}]${u?.full_name ? ` by ${u.full_name}` : ""}`;
  });
  return section("Recent forum threads", lines);
}

async function fetchReports(supabase: SupabaseClient, role: string): Promise<string | null> {
  if (!isStaffOrAdmin(role)) return null;

  const { data } = await supabase
    .from("ai_reports")
    .select("title, status, period_start, period_end")
    .order("created_at", { ascending: false })
    .limit(5);

  const lines = (data ?? []).map(
    (r) => `- ${r.title} (${r.status}, ${r.period_start} → ${r.period_end})`
  );
  return section("Recent AI-generated reports", lines);
}

async function fetchUsers(supabase: SupabaseClient, role: string): Promise<string | null> {
  if (!isAdmin(role)) return null;

  const [total, byRole] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("users").select("role").limit(500),
  ]);

  const counts: Record<string, number> = {};
  (byRole.data ?? []).forEach((u) => { counts[u.role] = (counts[u.role] ?? 0) + 1; });
  const lines = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`);

  return [
    `Total users: ${total.count ?? 0}`,
    section("Users by role", lines),
  ].join("\n\n");
}

async function fetchAudit(supabase: SupabaseClient, role: string): Promise<string | null> {
  if (!isAdmin(role)) return null;

  const [todayCount, recentEntries] = await Promise.all([
    supabase.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", today()),
    supabase.from("audit_logs").select("action, resource_type, level, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const lines = (recentEntries.data ?? []).map(
    (a) => `- [${a.level ?? "info"}] ${a.action} on ${a.resource_type ?? "?"} at ${a.created_at}`
  );

  return [
    `Audit log entries today: ${todayCount.count ?? 0}`,
    section("Most recent audit entries", lines),
  ].join("\n\n");
}
