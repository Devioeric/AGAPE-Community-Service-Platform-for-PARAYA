// Snapshot generator — produces a frozen JSON aggregate of the system state
// across all key tables, scoped to a date range. Used by the Vercel Cron
// snapshot endpoint and by the officer's manual-trigger button.

import { createAdminClient } from "@/lib/supabase/admin";

export type PeriodType = "monthly" | "quarterly" | "yearly";

export interface PeriodRange {
  type:  PeriodType;
  start: string;  // YYYY-MM-DD inclusive
  end:   string;  // YYYY-MM-DD inclusive
  label: string;  // e.g. "May 2026" / "Q2 2026" / "2026"
}

// ─── Date helpers ───────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Get the period containing `now` (or `now - 1` for closed periods). */
export function rangeContaining(type: PeriodType, ref: Date): PeriodRange {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (type === "monthly") {
    const start = new Date(Date.UTC(y, m, 1));
    const end   = new Date(Date.UTC(y, m + 1, 0));
    return { type, start: ymd(start), end: ymd(end), label: `${MONTHS[m]} ${y}` };
  }
  if (type === "quarterly") {
    const q   = Math.floor(m / 3);          // 0..3
    const sm  = q * 3;
    const start = new Date(Date.UTC(y, sm,    1));
    const end   = new Date(Date.UTC(y, sm + 3, 0));
    return { type, start: ymd(start), end: ymd(end), label: `Q${q + 1} ${y}` };
  }
  const start = new Date(Date.UTC(y, 0, 1));
  const end   = new Date(Date.UTC(y, 11, 31));
  return { type, start: ymd(start), end: ymd(end), label: `${y}` };
}

/** Get the previous completed period (used by cron — we snapshot last month, not the in-progress one). */
export function previousPeriod(type: PeriodType, ref: Date = new Date()): PeriodRange {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (type === "monthly") {
    const prev = new Date(Date.UTC(y, m - 1, 1));
    return rangeContaining("monthly", prev);
  }
  if (type === "quarterly") {
    const q = Math.floor(m / 3);
    const prev = new Date(Date.UTC(y, (q - 1) * 3, 1)); // previous Q (or last Q of last year)
    return rangeContaining("quarterly", prev);
  }
  return rangeContaining("yearly", new Date(Date.UTC(y - 1, 0, 1)));
}

// ─── Generator ─────────────────────────────────────────────────────────────

export interface SnapshotData {
  period: PeriodRange;
  generated_at: string;
  totals: {
    programs:          number;
    activePrograms:    number;
    completedPrograms: number;
    proposals:         number;
    approvedProposals: number;
    rejectedProposals: number;
    volunteers:        number;
    activeVolunteers:  number;
    volunteerHours:    number;
    activitiesLogged:  number;
    donations:         number;
    donationQty:       number;
    communityNeeds:    number;
    pendingNeeds:      number;
    households:        number;
    attendanceRecords: number;
  };
  programsByStatus:   Record<string, number>;
  proposalsByStatus:  Record<string, number>;
  sdgCounts:          Record<number, number>;
  needsByCategory:    Record<string, number>;
  donationsByType:    Record<string, number>;
  topBarangays:       { name: string; programCount: number }[];
}

export async function generateSnapshot(period: PeriodRange): Promise<SnapshotData> {
  const admin = createAdminClient();
  const { start, end } = period;

  // Run everything in parallel — these are all simple counts/lists.
  const [
    { data: programs },
    { data: proposals },
    { data: volunteers },
    { data: logs },
    { data: donations },
    { data: needs },
    { data: profilingEvidence },
    { data: attendance },
    { data: sdgRows },
  ] = await Promise.all([
    admin.from("programs")
      .select("id, status, barangays(name)")
      .gte("start_date", start).lte("start_date", end),
    admin.from("project_proposals")
      .select("status")
      .gte("created_at", start).lte("created_at", end + "T23:59:59"),
    admin.from("users")
      .select("status")
      .eq("role", "volunteer"),
    admin.from("activity_logs")
      .select("hours, status")
      .gte("date", start).lte("date", end),
    admin.from("donations")
      .select("item_type, quantity")
      .is("archived_at", null)
      .gte("received_date", start).lte("received_date", end),
    admin.from("community_needs")
      .select("category, approval_status, resolved")
      .gte("created_at", start).lte("created_at", end + "T23:59:59"),
    admin.from("profiling_evidence_snapshots")
      .select("cycle_id, aggregate_data, generated_at")
      .eq("aggregate_schema_version", "agape.profiling.aggregate.v2")
      .order("generated_at", { ascending: false })
      .gte("generated_at", start).lte("generated_at", end + "T23:59:59"),
    admin.from("attendance")
      .select("id")
      .gte("checked_in_at", start).lte("checked_in_at", end + "T23:59:59"),
    admin.from("proposal_sdg_alignment")
      .select("sdg_number, project_proposals!inner(created_at)")
      .gte("project_proposals.created_at", start)
      .lte("project_proposals.created_at", end + "T23:59:59"),
  ]);

  // ── Programs ───────────────────────────────────────────────────────────
  const programsByStatus: Record<string, number> = {};
  for (const p of programs ?? []) {
    programsByStatus[p.status] = (programsByStatus[p.status] ?? 0) + 1;
  }

  const brgyMap: Record<string, number> = {};
  for (const p of programs ?? []) {
    const name = (p.barangays as { name?: string } | null)?.name ?? "Unassigned";
    brgyMap[name] = (brgyMap[name] ?? 0) + 1;
  }
  const topBarangays = Object.entries(brgyMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, programCount]) => ({ name, programCount }));

  // ── Proposals ──────────────────────────────────────────────────────────
  const proposalsByStatus: Record<string, number> = {};
  for (const p of proposals ?? []) {
    proposalsByStatus[p.status] = (proposalsByStatus[p.status] ?? 0) + 1;
  }

  // ── Volunteer hours (approved only) ────────────────────────────────────
  const approvedLogs = (logs ?? []).filter((l) => l.status === "approved");
  const volunteerHours = approvedLogs.reduce((s, l) => s + (l.hours ?? 0), 0);

  // ── Donations ──────────────────────────────────────────────────────────
  const donationsByType: Record<string, number> = {};
  let donationQty = 0;
  for (const d of donations ?? []) {
    donationsByType[d.item_type] = (donationsByType[d.item_type] ?? 0) + (d.quantity ?? 0);
    donationQty += d.quantity ?? 0;
  }

  // ── Community needs ────────────────────────────────────────────────────
  const needsByCategory: Record<string, number> = {};
  let pendingNeeds = 0;
  for (const n of needs ?? []) {
    needsByCategory[n.category] = (needsByCategory[n.category] ?? 0) + 1;
    if (n.approval_status === "pending_captain") pendingNeeds++;
  }

  // ── SDG alignment (proposals created in period) ────────────────────────
  const sdgCounts: Record<number, number> = { 4: 0, 9: 0, 11: 0, 17: 0 };
  for (const s of sdgRows ?? []) {
    if (s.sdg_number in sdgCounts) sdgCounts[s.sdg_number]++;
  }

  const latestEvidenceByCycle = new Map<string, { aggregate_data: unknown }>();
  for (const row of profilingEvidence ?? []) {
    if (!latestEvidenceByCycle.has(row.cycle_id)) latestEvidenceByCycle.set(row.cycle_id, row);
  }

  return {
    period,
    generated_at: new Date().toISOString(),
    totals: {
      programs:          (programs ?? []).length,
      activePrograms:    programsByStatus.active    ?? 0,
      completedPrograms: programsByStatus.completed ?? 0,
      proposals:         (proposals ?? []).length,
      approvedProposals: proposalsByStatus.approved ?? 0,
      rejectedProposals: proposalsByStatus.rejected ?? 0,
      volunteers:        (volunteers ?? []).length,
      activeVolunteers:  (volunteers ?? []).filter((v) => v.status === "active").length,
      volunteerHours:    Math.round(volunteerHours * 10) / 10,
      activitiesLogged:  approvedLogs.length,
      donations:         (donations ?? []).length,
      donationQty:       Math.round(donationQty * 10) / 10,
      communityNeeds:    (needs ?? []).length,
      pendingNeeds,
      households:        Array.from(latestEvidenceByCycle.values()).reduce((sum, row) => sum + Number((row.aggregate_data as { sample?: { approvedHouseholds?: number } } | null)?.sample?.approvedHouseholds ?? 0), 0),
      attendanceRecords: (attendance ?? []).length,
    },
    programsByStatus,
    proposalsByStatus,
    sdgCounts,
    needsByCategory,
    donationsByType,
    topBarangays,
  };
}
