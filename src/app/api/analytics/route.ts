import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";

export async function GET(request: Request) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const adminSupabase = createAdminClient();

  const { searchParams } = new URL(request.url);
  const barangayId = searchParams.get("barangay_id") ?? null;
  const year       = searchParams.get("year") ? Number(searchParams.get("year")) : null;
  const type       = searchParams.get("type") ?? null;
  const yearStart  = year ? `${year}-01-01` : null;
  const yearEnd    = year ? `${year}-12-31` : null;

  // ── Pre-query: resolve barangay-scoped IDs for join-dependent filters ─────────
  let barangayProgramIds: string[] | null = null;
  let sdgAlignments: { sdg_number: number }[] = [];

  if (barangayId) {
    const [{ data: bProgs }, { data: bProposals }] = await Promise.all([
      adminSupabase.from("programs").select("id").eq("barangay_id", barangayId),
      adminSupabase.from("project_proposals").select("id").eq("barangay_id", barangayId),
    ]);
    barangayProgramIds = (bProgs ?? []).map((p) => p.id);

    const proposalIds = (bProposals ?? []).map((p) => p.id);
    if (proposalIds.length > 0) {
      const { data } = await adminSupabase
        .from("proposal_sdg_alignment").select("sdg_number").in("proposal_id", proposalIds);
      sdgAlignments = data ?? [];
    }
  } else {
    const { data } = await adminSupabase.from("proposal_sdg_alignment").select("sdg_number");
    sdgAlignments = data ?? [];
  }

  // ── Build filtered queries ─────────────────────────────────────────────────────
  let programQ = adminSupabase.from("programs").select("status, barangay_id, barangays(name), start_date");
  if (barangayId) programQ = programQ.eq("barangay_id", barangayId);
  if (yearStart)  programQ = programQ.gte("start_date", yearStart).lte("start_date", yearEnd!);

  let donationsQ = adminSupabase.from("donations").select("item_type, quantity, donation_distributions(quantity,voided_at), received_date").is("archived_at", null);
  if (yearStart) donationsQ = donationsQ.gte("received_date", yearStart).lte("received_date", yearEnd!);

  let needsQ = adminSupabase.from("community_needs").select("category, assessment_date");
  if (barangayId) needsQ = needsQ.eq("barangay_id", barangayId);
  if (yearStart)  needsQ = needsQ.gte("assessment_date", yearStart).lte("assessment_date", yearEnd!);

  let proposalsQ = adminSupabase.from("project_proposals").select("status");
  if (barangayId) proposalsQ = proposalsQ.eq("barangay_id", barangayId);
  if (yearStart)  proposalsQ = proposalsQ.gte("created_at", yearStart).lte("created_at", yearEnd!);

  // ── Activity logs (barangay-scoped via program IDs) ───────────────────────────
  let approvedLogs: { hours: number; date: string }[] = [];
  if (!(barangayProgramIds !== null && barangayProgramIds.length === 0)) {
    let logsQ = adminSupabase.from("activity_logs").select("hours, date").eq("status", "approved");
    if (barangayProgramIds && barangayProgramIds.length > 0) {
      logsQ = logsQ.in("program_id", barangayProgramIds);
    }
    if (yearStart) logsQ = logsQ.gte("date", yearStart).lte("date", yearEnd!);
    const { data } = await logsQ;
    approvedLogs = data ?? [];
  }

  // ── Parallel main queries ─────────────────────────────────────────────────────
  const [
    { data: programs },
    { data: volunteers },
    { data: donations },
    { data: communityNeeds },
    { data: proposals },
  ] = await Promise.all([
    programQ,
    adminSupabase.from("users").select("id, status").eq("role", "volunteer"),
    donationsQ,
    needsQ,
    proposalsQ,
  ]);

  // ── Programs by status ────────────────────────────────────────────────────────
  const programsByStatus: Record<string, number> = {};
  for (const p of programs ?? []) {
    programsByStatus[p.status] = (programsByStatus[p.status] ?? 0) + 1;
  }

  // ── Barangays by program count ────────────────────────────────────────────────
  const barangayProgramMap: Record<string, number> = {};
  for (const p of programs ?? []) {
    const bar  = p.barangays as unknown as { name: string } | null;
    const name = bar?.name ?? "Unassigned";
    barangayProgramMap[name] = (barangayProgramMap[name] ?? 0) + 1;
  }
  const topBarangays = Object.entries(barangayProgramMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  // ── Volunteer stats (always global — not barangay-scoped) ─────────────────────
  const totalVolunteers  = (volunteers ?? []).length;
  const activeVolunteers = (volunteers ?? []).filter((v) => v.status === "active").length;

  // ── Hours by month ────────────────────────────────────────────────────────────
  const now = new Date();
  const months: { month: string; label: string }[] = [];
  if (year) {
    for (let m = 1; m <= 12; m++) {
      months.push({
        month: `${year}-${String(m).padStart(2, "0")}`,
        label: new Date(year, m - 1, 1).toLocaleDateString("en-US", { month: "short" }),
      });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      });
    }
  }
  const hoursByMonth = months.map(({ label, month }) => {
    const hrs = approvedLogs
      .filter((l) => l.date?.startsWith(month))
      .reduce((sum, l) => sum + (l.hours ?? 0), 0);
    return { month: label, hours: Math.round(hrs * 10) / 10 };
  });
  const totalHours = approvedLogs.reduce((s, l) => s + (l.hours ?? 0), 0);

  // ── Donations by item type ────────────────────────────────────────────────────
  const donationByType: Record<string, number> = {};
  let totalDonationQty = 0;
  let totalDistributed = 0;
  for (const d of donations ?? []) {
    donationByType[d.item_type] = (donationByType[d.item_type] ?? 0) + (d.quantity ?? 0);
    totalDonationQty += d.quantity ?? 0;
    const distQty = (d.donation_distributions as { quantity: number; voided_at: string | null }[] ?? []).filter((entry) => !entry.voided_at)
      .reduce((s, x) => s + (x.quantity ?? 0), 0);
    totalDistributed += distQty;
  }
  const donationsByType = Object.entries(donationByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([type, qty]) => ({ type, qty: Math.round(qty * 10) / 10 }));

  // ── SDG alignment count ───────────────────────────────────────────────────────
  const sdgMap: Record<number, number> = { 4: 0, 9: 0, 11: 0, 17: 0 };
  for (const a of sdgAlignments) {
    if (a.sdg_number in sdgMap) sdgMap[a.sdg_number]++;
  }
  const sdgCounts = Object.entries(sdgMap).map(([num, count]) => ({
    sdg: Number(num), count,
  }));

  // ── Community needs by category ───────────────────────────────────────────────
  const needsMap: Record<string, number> = {};
  for (const n of communityNeeds ?? []) {
    needsMap[n.category] = (needsMap[n.category] ?? 0) + 1;
  }
  const needsByCategory = Object.entries(needsMap).map(([category, count]) => ({
    category: category.charAt(0).toUpperCase() + category.slice(1),
    count,
  }));

  // ── Proposals by status ───────────────────────────────────────────────────────
  const proposalsByStatus: Record<string, number> = {};
  for (const p of proposals ?? []) {
    proposalsByStatus[p.status] = (proposalsByStatus[p.status] ?? 0) + 1;
  }

  // ── Type-specific extras ──────────────────────────────────────────────────────

  // volunteers: per-program stats + anonymized top-volunteer chart
  type ProgramStat = {
    id: string; title: string; status: string;
    barangay: string; volunteerCount: number; totalHours: number;
  };
  type TopVolunteer = { label: string; hours: number };

  let programStats: ProgramStat[]   = [];
  let topVolunteers: TopVolunteer[] = [];

  if (type === "volunteers") {
    let programListQuery = adminSupabase.from("programs").select("id, title, status, start_date, barangays(name)").order("start_date", { ascending: false }).limit(20);
    if (barangayId) programListQuery = programListQuery.eq("barangay_id", barangayId);
    if (yearStart) programListQuery = programListQuery.gte("start_date", yearStart).lte("start_date", yearEnd!);
    let allLogsQuery = adminSupabase.from("activity_logs").select("program_id, volunteer_id, hours, date").eq("status", "approved");
    if (barangayProgramIds?.length) allLogsQuery = allLogsQuery.in("program_id", barangayProgramIds);
    if (yearStart) allLogsQuery = allLogsQuery.gte("date", yearStart).lte("date", yearEnd!);
    let signupsQuery = adminSupabase.from("program_signups").select("program_id, status").neq("status", "withdrawn");
    if (barangayProgramIds?.length) signupsQuery = signupsQuery.in("program_id", barangayProgramIds);
    const [
      { data: progList },
      { data: allLogs },
      { data: signups },
    ] = await Promise.all([
      programListQuery,
      allLogsQuery,
      signupsQuery,
    ]);

    const hoursByProg: Record<string, number>  = {};
    const hoursByVol:  Record<string, number>  = {};
    for (const l of allLogs ?? []) {
      if (l.program_id)   hoursByProg[l.program_id]   = (hoursByProg[l.program_id]   ?? 0) + (l.hours ?? 0);
      if (l.volunteer_id) hoursByVol[l.volunteer_id]  = (hoursByVol[l.volunteer_id]  ?? 0) + (l.hours ?? 0);
    }
    const signupsByProg: Record<string, number> = {};
    for (const s of signups ?? []) {
      if (s.program_id) signupsByProg[s.program_id] = (signupsByProg[s.program_id] ?? 0) + 1;
    }

    programStats = (progList ?? []).map((p) => ({
      id:             p.id,
      title:          p.title,
      status:         p.status,
      barangay:       (p.barangays as unknown as { name: string } | null)?.name ?? "—",
      volunteerCount: signupsByProg[p.id] ?? 0,
      totalHours:     Math.round((hoursByProg[p.id] ?? 0) * 10) / 10,
    }));

    topVolunteers = Object.entries(hoursByVol)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([, hours], i) => ({
        label: `Volunteer ${String.fromCharCode(65 + i)}`,
        hours: Math.round(hours * 10) / 10,
      }));
  }

  // community-needs: recent submissions + surveys completed count
  type NeedRow = {
    id: string; barangay: string; category: string;
    description: string; priority: string; created_at: string;
  };

  let recentNeeds: NeedRow[]       = [];
  let surveysCompletedCount        = 0;

  if (type === "community-needs") {
    let recentNeedsQuery = adminSupabase.from("community_needs").select("id, category, description, title, priority, created_at, barangays(name)").order("created_at", { ascending: false }).limit(20);
    if (barangayId) recentNeedsQuery = recentNeedsQuery.eq("barangay_id", barangayId);
    if (yearStart) recentNeedsQuery = recentNeedsQuery.gte("created_at", yearStart).lte("created_at", `${yearEnd}T23:59:59`);
    const [{ data: needs }, { data: surveys }] = await Promise.all([
      recentNeedsQuery,
      adminSupabase.from("surveys").select("id, status"),
    ]);

    recentNeeds = (needs ?? []).map((n) => ({
      id:          n.id,
      barangay:    (n.barangays as unknown as { name: string } | null)?.name ?? "—",
      category:    n.category ?? "—",
      description: (n.description ?? n.title ?? "—") as string,
      priority:    (n.priority ?? "medium") as string,
      created_at:  n.created_at,
    }));

    surveysCompletedCount = (surveys ?? []).filter((s) =>
      ["published", "closed", "completed"].includes(s.status)
    ).length;
  }

  // sdg / proposals: full proposal list with sdg alignment
  type ProposalRow = {
    id: string; title: string; status: string;
    barangay: string; sdgs: number[]; date: string;
  };

  let proposalRows: ProposalRow[] = [];

  if (type === "sdg" || type === "proposals") {
    let proposalListQuery = adminSupabase
      .from("project_proposals")
      .select("id, title, status, created_at, barangays(name), proposal_sdg_alignment(sdg_number)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (barangayId) proposalListQuery = proposalListQuery.eq("barangay_id", barangayId);
    if (yearStart) proposalListQuery = proposalListQuery.gte("created_at", yearStart).lte("created_at", `${yearEnd}T23:59:59`);
    const { data: proposalList } = await proposalListQuery;

    proposalRows = (proposalList ?? []).map((p) => ({
      id:       p.id,
      title:    p.title,
      status:   p.status,
      barangay: (p.barangays as unknown as { name: string } | null)?.name ?? "—",
      sdgs:     (p.proposal_sdg_alignment as { sdg_number: number }[] | null ?? []).map((a) => a.sdg_number),
      date:     p.created_at,
    }));
  }

  // ── Final response ────────────────────────────────────────────────────────────
  return NextResponse.json({
    data: {
      programs: {
        total:     (programs ?? []).length,
        byStatus:  programsByStatus,
        chartData: Object.entries(programsByStatus).map(([status, count]) => ({ status, count })),
      },
      volunteers: { total: totalVolunteers, active: activeVolunteers },
      hours:      { total: Math.round(totalHours * 10) / 10, byMonth: hoursByMonth },
      donations:  { total: (donations ?? []).length, totalQty: totalDonationQty, totalDistributed, byType: donationsByType },
      sdg:        { counts: sdgCounts },
      needs:      { byCategory: needsByCategory },
      proposals:  { total: (proposals ?? []).length, byStatus: proposalsByStatus },
      topBarangays,
      // type-specific extras (only populated when ?type= is set)
      programStats,
      topVolunteers,
      recentNeeds,
      surveysCompletedCount,
      proposalRows,
    },
  });
}
