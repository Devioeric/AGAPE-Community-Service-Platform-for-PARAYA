import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { analyticsFilter, countSdgAlignments, focusSdgs } from "@/lib/analytics/query-contract";
import { needsInsights, proposalInsights, sdgInsights, volunteerInsights, type NeedInsightRow, type ProposalInsightRow } from "@/lib/analytics/insights";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const { searchParams } = new URL(request.url);
  let filters: ReturnType<typeof analyticsFilter>;
  try { filters = analyticsFilter(searchParams); } catch { return NextResponse.json({ error: "Invalid analytics filters" }, { status: 400, headers }); }
  const { barangayId, year, type, yearStart, yearEnd, nextYearStart } = filters;
  try {
  const adminSupabase = createAdminClient();
  // Decide dependencies before constructing any query. The overview contract stays complete.
  const overview = !type;
  const wantsPrograms = overview || ["dashboard", "volunteers", "sdg", "community-needs"].includes(type!);
  const wantsHours = overview || type === "dashboard" || type === "volunteers";
  const wantsSdg = overview || ["dashboard", "sdg", "proposals"].includes(type!);
  const wantsNeeds = overview || type === "community-needs";
  const wantsProposals = overview || type === "sdg" || type === "proposals";

  // ── Pre-query: resolve barangay-scoped IDs for join-dependent filters ─────────
  let barangayProgramIds: string[] | null = null;
  let sdgAlignments: { sdg_number: number }[] = [];

  if (barangayId && wantsHours) {
    const { data: bProgs } = await adminSupabase.from("programs").select("id").eq("barangay_id", barangayId).throwOnError();
    barangayProgramIds = (bProgs ?? []).map((p) => p.id);
  }
  const sdgTask = async () => {
  if (!wantsSdg) return;
  let sdgQuery = adminSupabase.from("proposal_sdg_alignment").select("sdg_number, project_proposals!inner(barangay_id,created_at)");
  if (barangayId) sdgQuery = sdgQuery.eq("project_proposals.barangay_id", barangayId);
  if (yearStart) sdgQuery = sdgQuery.gte("project_proposals.created_at", yearStart).lt("project_proposals.created_at", nextYearStart!);
  sdgAlignments = (await sdgQuery.throwOnError()).data ?? [];
  };

  // ── Build filtered queries ─────────────────────────────────────────────────────
  const programsTask = async () => {
  if (!wantsPrograms) return { data: [] };
  let programQ = adminSupabase.from("programs").select("id, status, barangay_id, barangays(name), start_date, sdg_alignments");
  if (barangayId) programQ = programQ.eq("barangay_id", barangayId);
  if (yearStart)  programQ = programQ.gte("start_date", yearStart).lte("start_date", yearEnd!);
  return programQ.throwOnError();
  };

  const donationsTask = async () => {
  if (!overview) return { data: [] };
  let donationsQ = adminSupabase.from("donations").select("item_type, quantity, donation_distributions(quantity,voided_at), received_date").is("archived_at", null);
  if (barangayId) donationsQ = donationsQ.eq("barangay_id", barangayId);
  if (yearStart) donationsQ = donationsQ.gte("received_date", yearStart).lte("received_date", yearEnd!);
  return donationsQ.throwOnError();
  };

  const needsTask = async () => {
  if (!wantsNeeds) return { data: [] };
  // The Community Needs view reads every submission once: approved rows feed the
  // planning charts, and the other review states feed the review chart.
  if (type === "community-needs") {
    let detailQ = adminSupabase.from("community_needs").select("category, priority, status, approval_status, affected_count, assessment_date, created_at, source, barangays(name)");
    if (barangayId) detailQ = detailQ.eq("barangay_id", barangayId);
    if (yearStart)  detailQ = detailQ.gte("assessment_date", yearStart).lte("assessment_date", yearEnd!);
    return detailQ.throwOnError();
  }
  let needsQ = adminSupabase.from("community_needs").select("category, assessment_date").eq("approval_status", "approved");
  if (barangayId) needsQ = needsQ.eq("barangay_id", barangayId);
  if (yearStart)  needsQ = needsQ.gte("assessment_date", yearStart).lte("assessment_date", yearEnd!);
  return needsQ.throwOnError();
  };

  const proposalsTask = async () => {
  if (!wantsProposals) return { data: [] };
  let proposalsQ = adminSupabase.from("project_proposals").select("status");
  if (barangayId) proposalsQ = proposalsQ.eq("barangay_id", barangayId);
  if (yearStart)  proposalsQ = proposalsQ.gte("created_at", yearStart).lt("created_at", nextYearStart!);
  return proposalsQ.throwOnError();
  };

  // ── Activity logs (barangay-scoped via program IDs) ───────────────────────────
  let approvedLogs: { hours: number; date: string }[] = [];
  const hoursTask = async () => {
  if (wantsHours && !(barangayProgramIds !== null && barangayProgramIds.length === 0)) {
    let logsQ = adminSupabase.from("activity_logs").select("hours, date").eq("status", "approved");
    if (barangayProgramIds && barangayProgramIds.length > 0) {
      logsQ = logsQ.in("program_id", barangayProgramIds);
    }
    if (yearStart) logsQ = logsQ.gte("date", yearStart).lte("date", yearEnd!);
    const { data } = await logsQ.throwOnError();
    approvedLogs = data ?? [];
  }
  };

  // ── Parallel main queries ─────────────────────────────────────────────────────
  const [
    { data: programs },
    { data: volunteers },
    { data: donations },
    { data: communityNeeds },
    { data: proposals },
  ] = await Promise.all([
    programsTask(),
    overview || type === "volunteers" ? adminSupabase.from("users").select("id, status, is_active").eq("role", "volunteer").throwOnError() : Promise.resolve({ data: [] }),
    donationsTask(),
    needsTask(),
    proposalsTask(),
    sdgTask(),
    hoursTask(),
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
  const activeVolunteers = (volunteers ?? []).filter((v) => v.status === "active" && v.is_active).length;

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
  const sdgMap = countSdgAlignments(sdgAlignments);
  const sdgCounts = Object.entries(sdgMap).map(([num, count]) => ({
    sdg: Number(num), count,
  }));

  // ── Community needs by category ───────────────────────────────────────────────
  const needsMap: Record<string, number> = {};
  const approvedNeeds = (communityNeeds ?? []).filter((n) => type !== "community-needs" || (n as { approval_status?: string }).approval_status === "approved");
  for (const n of approvedNeeds) {
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
  let volunteerInsightsData: ReturnType<typeof volunteerInsights> | null = null;

  if (type === "volunteers" && !(barangayProgramIds !== null && barangayProgramIds.length === 0)) {
    let programListQuery = adminSupabase.from("programs").select("id, title, status, start_date, barangays(name)").order("start_date", { ascending: false }).limit(20);
    if (barangayId) programListQuery = programListQuery.eq("barangay_id", barangayId);
    if (yearStart) programListQuery = programListQuery.gte("start_date", yearStart).lte("start_date", yearEnd!);
    let allLogsQuery = adminSupabase.from("activity_logs").select("program_id, volunteer_id, hours, date, status");
    if (barangayProgramIds?.length) allLogsQuery = allLogsQuery.in("program_id", barangayProgramIds);
    if (yearStart) allLogsQuery = allLogsQuery.gte("date", yearStart).lte("date", yearEnd!);
    let signupsQuery = adminSupabase.from("program_signups").select("program_id, status");
    if (barangayProgramIds?.length) signupsQuery = signupsQuery.in("program_id", barangayProgramIds);
    let checkInsQuery = adminSupabase.from("attendance").select("checked_in_at, method, program_activities(program_id)");
    if (yearStart) checkInsQuery = checkInsQuery.gte("checked_in_at", yearStart).lt("checked_in_at", nextYearStart!);
    const [
      { data: progList },
      { data: everyLog },
      { data: everySignup },
      { data: volunteerProfiles },
      { data: checkIns },
    ] = await Promise.all([
      programListQuery.throwOnError(),
      allLogsQuery.throwOnError(),
      signupsQuery.throwOnError(),
      adminSupabase.from("volunteers").select("course, year_level").throwOnError(),
      checkInsQuery.throwOnError(),
    ]);
    const allLogs = (everyLog ?? []).filter((l) => l.status === "approved");
    const signups = (everySignup ?? []).filter((s) => s.status !== "withdrawn");
    const scopedProgramIds = barangayProgramIds ? new Set(barangayProgramIds) : null;
    const scopedCheckIns = (checkIns ?? []).filter((checkIn) => {
      if (!scopedProgramIds) return true;
      const programId = (checkIn.program_activities as unknown as { program_id?: string } | null)?.program_id;
      return Boolean(programId && scopedProgramIds.has(programId));
    });
    const programBarangays = new Map((programs ?? []).map((p) => [String(p.id), (p.barangays as unknown as { name: string } | null)?.name ?? "Unassigned"]));
    volunteerInsightsData = volunteerInsights({
      profiles: volunteerProfiles ?? [],
      accounts: volunteers ?? [],
      logs: everyLog ?? [],
      signups: everySignup ?? [],
      checkIns: scopedCheckIns,
      programBarangays,
      months,
    });

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

  if (type === "volunteers" && !volunteerInsightsData) {
    volunteerInsightsData = volunteerInsights({ profiles: [], accounts: volunteers ?? [], logs: [], signups: [], checkIns: [], programBarangays: new Map(), months });
  }

  // community-needs: recent submissions + surveys completed count
  type NeedRow = {
    id: string; barangay: string; category: string;
    title: string; description: string; priority: string; created_at: string;
  };

  let recentNeeds: NeedRow[]       = [];
  let surveysCompletedCount        = 0;

  if (type === "community-needs") {
    let recentNeedsQuery = adminSupabase.from("community_needs").select("id, category, description, title, priority, created_at, barangays(name)").eq("approval_status", "approved").order("created_at", { ascending: false }).limit(20);
    if (barangayId) recentNeedsQuery = recentNeedsQuery.eq("barangay_id", barangayId);
    if (yearStart) recentNeedsQuery = recentNeedsQuery.gte("created_at", yearStart).lt("created_at", nextYearStart!);
    let surveysQuery = adminSupabase.from("surveys").select("id, status");
    if (barangayId) surveysQuery = surveysQuery.eq("target_barangay_id", barangayId);
    if (yearStart) surveysQuery = surveysQuery.gte("created_at", yearStart).lt("created_at", nextYearStart!);
    const [{ data: needs }, { data: surveys }] = await Promise.all([
      recentNeedsQuery.throwOnError(),
      surveysQuery.throwOnError(),
    ]);

    recentNeeds = (needs ?? []).map((n) => ({
      id:          n.id,
      barangay:    (n.barangays as unknown as { name: string } | null)?.name ?? "—",
      category:    n.category ?? "—",
      title:       (n.title ?? "Community need") as string,
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
  let proposalInsightsData: ReturnType<typeof proposalInsights> | null = null;
  let sdgInsightsData: ReturnType<typeof sdgInsights> | null = null;

  if (type === "sdg" || type === "proposals") {
    let proposalListQuery = adminSupabase
      .from("project_proposals")
      .select("id, title, status, created_at, budget, expected_beneficiary_count, is_income_generating, finance_clearance, prescreening_passed, revision_count, community_validated, barangays(name), proposal_sdg_alignment(sdg_number)")
      .order("created_at", { ascending: false });
    if (barangayId) proposalListQuery = proposalListQuery.eq("barangay_id", barangayId);
    if (yearStart) proposalListQuery = proposalListQuery.gte("created_at", yearStart).lt("created_at", nextYearStart!);
    const [{ data: proposalList }, { data: sdgOutcomes }] = await Promise.all([
      proposalListQuery.throwOnError(),
      type === "sdg" ? adminSupabase.from("program_sdg_outcomes").select("sdg_goal, program_id").throwOnError() : Promise.resolve({ data: [] }),
    ]);
    const insightRows = (proposalList ?? []) as unknown as ProposalInsightRow[];
    if (type === "proposals") proposalInsightsData = proposalInsights(insightRows, now);
    if (type === "sdg") {
      sdgInsightsData = sdgInsights({
        proposals: insightRows,
        programs: (programs ?? []).map((p) => ({ id: p.id, sdg_alignments: p.sdg_alignments })),
        outcomes: sdgOutcomes ?? [],
      });
    }

    proposalRows = (proposalList ?? []).slice(0, 50).map((p) => ({
      id:       p.id,
      title:    p.title,
      status:   p.status,
      barangay: (p.barangays as unknown as { name: string } | null)?.name ?? "—",
      sdgs:     focusSdgs((p.proposal_sdg_alignment as { sdg_number: number }[] | null ?? []).map((a) => a.sdg_number)),
      date:     p.created_at,
    }));
  }

  // ── Final response ────────────────────────────────────────────────────────────
  const fullData = {
      programs: {
        total:     (programs ?? []).length,
        byStatus:  programsByStatus,
        chartData: Object.entries(programsByStatus).map(([status, count]) => ({ status, count })),
      },
      volunteers: { total: totalVolunteers, active: activeVolunteers, scope: "all_accounts" },
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
  };
  // Chart breakdowns exist only for the view that shows them.
  const viewData = {
    ...fullData,
    needsInsights: type === "community-needs" ? needsInsights((communityNeeds ?? []) as unknown as NeedInsightRow[], programs ?? [], now) : null,
    volunteerInsights: volunteerInsightsData,
    sdgInsights: sdgInsightsData,
    proposalInsights: proposalInsightsData,
  };
  const keysByView = {
    dashboard: ["hours", "sdg", "topBarangays"],
    volunteers: ["programs", "volunteers", "hours", "topBarangays", "programStats", "topVolunteers", "volunteerInsights"],
    sdg: ["programs", "proposals", "sdg", "proposalRows", "sdgInsights"],
    proposals: ["proposals", "sdg", "proposalRows", "proposalInsights"],
    "community-needs": ["needs", "recentNeeds", "surveysCompletedCount", "topBarangays", "needsInsights"],
  } satisfies Record<string, (keyof typeof viewData)[]>;
  const data = type ? Object.fromEntries(keysByView[type as keyof typeof keysByView].map(key => [key, viewData[key]])) : fullData;
  return NextResponse.json({ data }, { headers });
  } catch (error) {
    const denied = typeof error === "object" && error !== null && "code" in error && error.code === "42501";
    return NextResponse.json({ error: denied ? "Analytics access is not permitted" : "Unable to load analytics" }, { status: denied ? 403 : 503, headers });
  }
}
