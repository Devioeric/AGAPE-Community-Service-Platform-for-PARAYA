import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isParayaStaff, isBarangayRole } from "@/lib/auth/roles";
import { hasCapability, type PermissionOverrides } from "@/lib/auth/capabilities";

interface BuildContextInput {
  /** User-session client — kept for symmetry with the route signature; not used for reads. */
  supabase: SupabaseClient;
  userId:   string;
  role:     string;
  permissions: PermissionOverrides;
}

function semesterStart(now = new Date()): string {
  const year  = now.getFullYear();
  const month = now.getMonth();
  return month >= 7 ? `${year}-08-01` : `${year}-01-01`;
}

function plusDays(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

export async function buildChatbotContext({
  userId,
  role,
  permissions,
}: BuildContextInput): Promise<string> {
  // Use admin client: the route handler has already authenticated the user, and
  // every query below is explicitly scoped by userId / role to mirror what the
  // user is allowed to see in the UI. This avoids RLS blocking the chatbot from
  // reading tables (like barangays / donations) that the rest of the app reads
  // via the admin client as well.
  const admin = createAdminClient();

  if (role === "volunteer")        return buildVolunteerContext(admin, userId);
  if (isParayaStaff(role))         return buildStaffContext(admin, role, permissions);
  if (role === "finance_officer")  return buildFinanceContext(admin);
  if (isBarangayRole(role))        return buildBarangayContext(admin, userId, role);
  return "(no role-specific data available)";
}

async function buildVolunteerContext(supabase: SupabaseClient, userId: string): Promise<string> {
  const [signups, hoursRes, upcoming] = await Promise.all([
    supabase
      .from("program_signups")
      .select("status, programs(title, status, start_date, end_date)")
      .eq("volunteer_id", userId)
      .neq("status", "withdrawn")
      .limit(5),
    supabase
      .from("activity_logs")
      .select("hours")
      .eq("volunteer_id", userId)
      .eq("status", "approved")
      .gte("date", semesterStart()),
    supabase
      .from("program_signups")
      .select("programs(title, start_date)")
      .eq("volunteer_id", userId)
      .neq("status", "withdrawn")
      .gte("programs.start_date", today())
      .lte("programs.start_date", plusDays(7))
      .limit(5),
  ]);

  const totalHours = (hoursRes.data ?? []).reduce((s, l) => s + (Number(l.hours) ?? 0), 0);

  const lines: string[] = [];
  lines.push(`Approved service hours this semester: ${totalHours.toFixed(1)}`);

  const joined = (signups.data ?? []).map((s) => {
    const p = Array.isArray(s.programs) ? s.programs[0] : s.programs;
    return p ? `- ${p.title} (${p.status}, starts ${p.start_date ?? "TBA"})` : null;
  }).filter(Boolean);
  lines.push(joined.length ? `Joined programs:\n${joined.join("\n")}` : "Joined programs: none");

  const next = (upcoming.data ?? []).map((s) => {
    const p = Array.isArray(s.programs) ? s.programs[0] : s.programs;
    return p ? `- ${p.title} on ${p.start_date}` : null;
  }).filter(Boolean);
  lines.push(next.length ? `Upcoming this week:\n${next.join("\n")}` : "Upcoming this week: none");

  return lines.join("\n\n");
}

async function buildStaffContext(supabase: SupabaseClient, role: string, permissions: PermissionOverrides): Promise<string> {
  const lines: string[] = [];
  if (hasCapability(role, permissions, "program.read")) {
    const result = await supabase.from("programs").select("id", { count: "exact", head: true }).eq("status", "active");
    lines.push(`Active programs: ${result.count ?? 0}`);
  }
  if (hasCapability(role, permissions, "proposal.read")) {
    const result = await supabase.from("project_proposals").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review", "sdg_review", "finance_review"]);
    lines.push(`Proposals awaiting review (any stage): ${result.count ?? 0}`);
  }
  if (hasCapability(role, permissions, "community_need.read")) {
    const result = await supabase.from("community_needs").select("id", { count: "exact", head: true }).gte("created_at", plusDays(-30));
    lines.push(`Community needs submitted in last 30 days: ${result.count ?? 0}`);
  }
  return lines.length ? lines.join("\n") : "No authorized operational aggregate is available.";
}

async function buildFinanceContext(supabase: SupabaseClient): Promise<string> {
  const { count } = await supabase
    .from("project_proposals")
    .select("id", { count: "exact", head: true })
    .eq("status", "finance_review")
    .eq("finance_clearance", false);

  return `Proposals awaiting your finance clearance: ${count ?? 0}`;
}

async function buildBarangayContext(supabase: SupabaseClient, userId: string, role: string): Promise<string> {
  const { data: profile } = await supabase
    .from("users")
    .select("barangay_id, barangays(name)")
    .eq("id", userId)
    .single();

  const barangayId   = profile?.barangay_id;
  const barangayName = profile?.barangays
    ? (Array.isArray(profile.barangays) ? profile.barangays[0]?.name : (profile.barangays as { name?: string }).name)
    : null;

  const lines: string[] = [];
  lines.push(`Barangay: ${barangayName ?? "(none assigned)"}`);

  if (!barangayId) return lines.join("\n");

  const [pendingApprovals, recentNeeds] = await Promise.all([
    role === "barangay_captain"
      ? supabase
          .from("community_needs")
          .select("id", { count: "exact", head: true })
          .eq("barangay_id", barangayId)
          .eq("approval_status", "pending")
      : Promise.resolve({ count: null }),
    supabase
      .from("community_needs")
      .select("category, priority, approval_status")
      .eq("barangay_id", barangayId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (role === "barangay_captain") {
    lines.push(`Community needs pending your approval: ${pendingApprovals.count ?? 0}`);
  }

  const needs = (recentNeeds.data ?? []).map(
    (n) => `- ${n.category} (priority: ${n.priority}, status: ${n.approval_status})`
  );
  lines.push(needs.length ? `Recent community needs:\n${needs.join("\n")}` : "Recent community needs: none");

  return lines.join("\n\n");
}

async function buildPartnerContext(supabase: SupabaseClient, userId: string): Promise<string> {
  const [proposals, programs] = await Promise.all([
    supabase
      .from("project_proposals")
      .select("title, status")
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("programs")
      .select("title, status, start_date, proposal_id, project_proposals!inner(created_by)")
      .eq("project_proposals.created_by", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const lines: string[] = [];

  const props = (proposals.data ?? []).map((p) => `- ${p.title} — ${p.status}`);
  lines.push(props.length ? `Your proposals:\n${props.join("\n")}` : "Your proposals: none");

  const progs = (programs.data ?? []).map((p) => `- ${p.title} (${p.status}, starts ${p.start_date ?? "TBA"})`);
  lines.push(progs.length ? `Your programs:\n${progs.join("\n")}` : "Your programs: none");

  return lines.join("\n\n");
}

async function buildAdminContext(supabase: SupabaseClient): Promise<string> {
  const [users, auditToday] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", today()),
  ]);

  return [
    `Total users: ${users.count ?? 0}`,
    `Audit log entries today: ${auditToday.count ?? 0}`,
  ].join("\n");
}

// Retained only for historical data-migration comparison. These builders are
// intentionally unreachable from the chatbot authorization boundary.
void buildPartnerContext;
void buildAdminContext;
