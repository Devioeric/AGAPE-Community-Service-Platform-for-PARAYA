// Chart-ready aggregates for the Analytics tabs. Every function is pure: the
// API route queries rows and these helpers only count and group them, so the
// numbers each chart shows can be tested without a database.
import { FOCUS_SDG_NUMBERS, isFocusSdg } from "../sdg-focus.js";

type Named = { name?: string | null } | null | undefined;

const round1 = (value: number) => Math.round(value * 10) / 10;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
const nameOf = (value: unknown, fallback = "Unassigned") => (value as Named)?.name?.trim() || fallback;

export function titleCase(value: string | null | undefined, fallback = "Other") {
  const text = (value ?? "").trim().replace(/_/g, " ");
  if (!text) return fallback;
  return text.toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
    .replace(/(?!^)\b(Of|And|The|In|To|For|With|Or)\b/g, (word) => word.toLowerCase());
}

// ─── Month and quarter buckets ─────────────────────────────────────────────

export type Bucket = { key: string; label: string };

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function monthKey(value: string | null | undefined): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : null;
}

/** The last `span` months ending at the later of this month and the newest record. */
export function monthBuckets(dates: Array<string | null | undefined>, now: Date, span = 12): Bucket[] {
  let end = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const date of dates) {
    const key = monthKey(date);
    if (key && key > end) end = key;
  }
  const [endYear, endMonth] = end.split("-").map(Number);
  const buckets: Bucket[] = [];
  for (let offset = span - 1; offset >= 0; offset--) {
    const date = new Date(Date.UTC(endYear, endMonth - 1 - offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.push({ key, label: monthLabel(key) });
  }
  return buckets;
}

/** Drop empty months before the first record, keeping at least `minimum` months. */
export function trimLeadingEmpty<T extends { total: number }>(rows: T[], minimum = 6): T[] {
  const first = rows.findIndex((row) => row.total > 0);
  if (first < 0) return rows.slice(-minimum);
  return rows.slice(Math.min(first, Math.max(0, rows.length - minimum)));
}

function quarterKey(value: string | null | undefined): string | null {
  const key = monthKey(value);
  if (!key) return null;
  const [year, month] = key.split("-").map(Number);
  return `${year}-Q${Math.ceil(month / 3)}`;
}

/** Every quarter from the oldest to the newest record, keeping the latest `span`. */
export function quarterBuckets(dates: Array<string | null | undefined>, span = 8): Bucket[] {
  const keys = dates.map(quarterKey).filter((key): key is string => Boolean(key)).sort();
  if (!keys.length) return [];
  const [startYear, startQuarter] = keys[0].split("-Q").map(Number);
  const [endYear, endQuarter] = keys[keys.length - 1].split("-Q").map(Number);
  const buckets: Bucket[] = [];
  for (let year = startYear, quarter = startQuarter; year < endYear || (year === endYear && quarter <= endQuarter);) {
    buckets.push({ key: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` });
    quarter += 1;
    if (quarter > 4) { quarter = 1; year += 1; }
  }
  return buckets.slice(-span);
}

// ─── Community needs ───────────────────────────────────────────────────────

export const NEED_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export const NEED_STATUSES = ["identified", "in_progress", "addressed"] as const;
export const NEED_REVIEW_STAGES = ["pending_paraya_review", "needs_revision", "approved", "rejected"] as const;
type NeedPriority = (typeof NEED_PRIORITIES)[number];
type NeedStatus = (typeof NEED_STATUSES)[number];

export type NeedInsightRow = {
  category?: string | null; priority?: string | null; status?: string | null; approval_status?: string | null;
  affected_count?: number | null; assessment_date?: string | null; created_at?: string | null; source?: string | null;
  barangays?: unknown;
};

const priorityOf = (value: string | null | undefined): NeedPriority => (NEED_PRIORITIES as readonly string[]).includes(value ?? "") ? value as NeedPriority : "medium";
const needStatusOf = (value: string | null | undefined): NeedStatus => (NEED_STATUSES as readonly string[]).includes(value ?? "") ? value as NeedStatus : "identified";
const zeroPriorities = () => ({ critical: 0, high: 0, medium: 0, low: 0 });

/** Approved needs drive every planning chart; the review chart counts all submissions. */
export function needsInsights(rows: NeedInsightRow[], programs: Array<{ barangays?: unknown }>, now: Date) {
  const approved = rows.filter((row) => row.approval_status === "approved");
  const review = NEED_REVIEW_STAGES.map((stage) => ({ stage, count: rows.filter((row) => row.approval_status === stage).length }));

  const byPriority = NEED_PRIORITIES.map((priority) => ({ priority, count: approved.filter((row) => priorityOf(row.priority) === priority).length }));
  const byStatus = NEED_STATUSES.map((status) => ({ status, count: approved.filter((row) => needStatusOf(row.status) === status).length }));


  const categories = new Map<string, { category: string; identified: number; in_progress: number; addressed: number; total: number; people: number } & ReturnType<typeof zeroPriorities>>();
  for (const row of approved) {
    const category = titleCase(row.category);
    const entry = categories.get(category) ?? { category, identified: 0, in_progress: 0, addressed: 0, total: 0, people: 0, ...zeroPriorities() };
    entry[needStatusOf(row.status)] += 1;
    entry[priorityOf(row.priority)] += 1;
    entry.total += 1;
    entry.people += Math.max(0, num(row.affected_count));
    categories.set(category, entry);
  }
  const categoryRows = Array.from(categories.values()).sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  const programsByBarangay = new Map<string, number>();
  for (const program of programs) {
    const barangay = nameOf(program.barangays);
    programsByBarangay.set(barangay, (programsByBarangay.get(barangay) ?? 0) + 1);
  }
  const barangays = new Map<string, { barangay: string; needs: number; addressed: number; programs: number } & ReturnType<typeof zeroPriorities>>();
  for (const row of approved) {
    const barangay = nameOf(row.barangays);
    const entry = barangays.get(barangay) ?? { barangay, needs: 0, addressed: 0, programs: 0, ...zeroPriorities() };
    entry.needs += 1;
    entry[priorityOf(row.priority)] += 1;
    if (needStatusOf(row.status) === "addressed") entry.addressed += 1;
    barangays.set(barangay, entry);
  }
  programsByBarangay.forEach((count, barangay) => {
    const entry = barangays.get(barangay) ?? { barangay, needs: 0, addressed: 0, programs: 0, ...zeroPriorities() };
    entry.programs = count;
    barangays.set(barangay, entry);
  });
  const byBarangay = Array.from(barangays.values())
    .sort((a, b) => b.needs - a.needs || b.programs - a.programs || a.barangay.localeCompare(b.barangay))
    .slice(0, 10);

  const reportedDate = (row: NeedInsightRow) => row.assessment_date ?? row.created_at ?? null;
  const months = monthBuckets(approved.map(reportedDate), now);
  const monthly = trimLeadingEmpty(months.map(({ key, label }) => {
    const inMonth = approved.filter((row) => monthKey(reportedDate(row)) === key);
    const counts = zeroPriorities();
    for (const row of inMonth) counts[priorityOf(row.priority)] += 1;
    return { month: label, ...counts, total: inMonth.length };
  }));


  const sources = new Map<string, number>();
  for (const row of rows) sources.set(row.source ?? "unspecified", (sources.get(row.source ?? "unspecified") ?? 0) + 1);
  const bySource = Array.from(sources.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

  const count = (status: string) => rows.filter((row) => row.approval_status === status).length;
  const addressed = byStatus.find((row) => row.status === "addressed")?.count ?? 0;
  return {
    totals: {
      approved: approved.length,
      submitted: rows.length,
      awaitingReview: count("pending_paraya_review"),
      needsRevision: count("needs_revision"),
      rejected: count("rejected"),
      criticalOrHigh: approved.filter((row) => ["critical", "high"].includes(priorityOf(row.priority))).length,
      addressed,
      addressedRate: approved.length ? Math.round((addressed / approved.length) * 100) : 0,
      peopleAffected: categoryRows.reduce((sum, row) => sum + row.people, 0),
      barangaysReporting: new Set(approved.map((row) => nameOf(row.barangays))).size,
    },
    byPriority, byStatus, review,
    byCategory: categoryRows,
    byBarangay, monthly, bySource,
  };
}

// ─── Volunteers ────────────────────────────────────────────────────────────

export type VolunteerLogRow = { program_id?: string | null; volunteer_id?: string | null; hours?: number | null; date?: string | null; status?: string | null };

const YEAR_LABELS: Record<number, string> = { 1: "1st year", 2: "2nd year", 3: "3rd year", 4: "4th year", 5: "5th year" };

export function volunteerInsights(input: {
  profiles: Array<{ course?: string | null; year_level?: number | null }>;
  accounts: Array<{ status?: string | null; is_active?: boolean | null }>;
  logs: VolunteerLogRow[];
  signups: Array<{ status?: string | null }>;
  checkIns: Array<{ checked_in_at?: string | null; method?: string | null }>;
  programBarangays: Map<string, string>;
  months: Array<{ month: string; label: string }>;
}) {
  const courses = new Map<string, number>();
  for (const profile of input.profiles) {
    const course = profile.course?.trim() || "Not specified";
    courses.set(course, (courses.get(course) ?? 0) + 1);
  }
  const byCourse = Array.from(courses.entries()).map(([course, count]) => ({ course, count })).sort((a, b) => b.count - a.count);

  const levels = new Map<string, number>();
  for (const profile of input.profiles) {
    const level = YEAR_LABELS[num(profile.year_level)] ?? "Not specified";
    levels.set(level, (levels.get(level) ?? 0) + 1);
  }
  const byYearLevel = [...Object.values(YEAR_LABELS), "Not specified"]
    .filter((level) => levels.has(level))
    .map((level) => ({ level, count: levels.get(level) ?? 0 }));

  const accountStatus = ["active", "pending", "suspended", "inactive"]
    .map((status) => ({ status, count: input.accounts.filter((account) => (account.status ?? "inactive") === status).length }))
    .filter((row) => row.count > 0);

  const approved = input.logs.filter((log) => log.status === "approved");
  const logReview = ["approved", "pending", "rejected"].map((status) => {
    const logs = input.logs.filter((log) => log.status === status);
    return { status, entries: logs.length, hours: round1(logs.reduce((sum, log) => sum + num(log.hours), 0)) };
  });

  const barangayHours = new Map<string, { hours: number; volunteers: Set<string> }>();
  for (const log of approved) {
    const barangay = (log.program_id && input.programBarangays.get(log.program_id)) || "Unassigned";
    const entry = barangayHours.get(barangay) ?? { hours: 0, volunteers: new Set<string>() };
    entry.hours += num(log.hours);
    if (log.volunteer_id) entry.volunteers.add(log.volunteer_id);
    barangayHours.set(barangay, entry);
  }
  const hoursByBarangay = Array.from(barangayHours.entries())
    .map(([barangay, entry]) => ({ barangay, hours: round1(entry.hours), volunteers: entry.volunteers.size }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  const activeByMonth = input.months.map(({ month, label }) => {
    const inMonth = approved.filter((log) => log.date?.startsWith(month));
    return {
      month: label,
      hours: round1(inMonth.reduce((sum, log) => sum + num(log.hours), 0)),
      volunteers: new Set(inMonth.map((log) => log.volunteer_id).filter(Boolean)).size,
    };
  });

  const signupStatus = ["confirmed", "pending", "withdrawn"].map((status) => ({ status, count: input.signups.filter((signup) => signup.status === status).length }));

  const checkInsByMonth = input.months.map(({ month, label }) => {
    const inMonth = input.checkIns.filter((checkIn) => checkIn.checked_in_at?.startsWith(month));
    return {
      month: label,
      qr: inMonth.filter((checkIn) => checkIn.method === "qr").length,
      otp: inMonth.filter((checkIn) => checkIn.method === "otp").length,
      manual: inMonth.filter((checkIn) => checkIn.method !== "qr" && checkIn.method !== "otp").length,
      total: inMonth.length,
    };
  });

  return { byCourse, byYearLevel, accountStatus, logReview, hoursByBarangay, activeByMonth, signupStatus, checkInsByMonth, totalCheckIns: input.checkIns.length };
}

// ─── Proposals and SDGs ────────────────────────────────────────────────────

export const STAGE_GROUPS = ["approved", "in_review", "revisions", "draft", "rejected"] as const;
export type StageGroup = (typeof STAGE_GROUPS)[number];

export function proposalStageGroup(status: string | null | undefined): StageGroup {
  if (status === "approved" || status === "rejected" || status === "draft") return status;
  if (status === "revisions_requested") return "revisions";
  return "in_review";
}

const zeroStages = () => ({ approved: 0, in_review: 0, revisions: 0, draft: 0, rejected: 0 });

export type ProposalInsightRow = {
  status?: string | null; budget?: number | string | null; expected_beneficiary_count?: number | null; created_at?: string | null;
  barangays?: unknown; proposal_sdg_alignment?: Array<{ sdg_number?: number | null }> | null;
  is_income_generating?: boolean | null; finance_clearance?: boolean | null; prescreening_passed?: boolean | null;
  revision_count?: number | null; community_validated?: boolean | null;
};

const alignedSdgs = (row: ProposalInsightRow) => Array.from(new Set((row.proposal_sdg_alignment ?? []).map((item) => item?.sdg_number).filter(isFocusSdg))) as number[];

export function proposalInsights(rows: ProposalInsightRow[], now: Date) {
  const months = monthBuckets(rows.map((row) => row.created_at), now, 18);
  const monthly = trimLeadingEmpty(months.map(({ key, label }) => {
    const counts = zeroStages();
    for (const row of rows) if (monthKey(row.created_at) === key) counts[proposalStageGroup(row.status)] += 1;
    return { month: label, ...counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
  }));

  const barangays = new Map<string, ReturnType<typeof zeroStages> & { barangay: string; total: number }>();
  for (const row of rows) {
    const barangay = nameOf(row.barangays);
    const entry = barangays.get(barangay) ?? { barangay, total: 0, ...zeroStages() };
    entry[proposalStageGroup(row.status)] += 1;
    entry.total += 1;
    barangays.set(barangay, entry);
  }
  const byBarangay = Array.from(barangays.values()).sort((a, b) => b.total - a.total).slice(0, 10);

  const budgetByStage = STAGE_GROUPS.map((stage) => {
    const inStage = rows.filter((row) => proposalStageGroup(row.status) === stage);
    return { stage, budget: round1(inStage.reduce((sum, row) => sum + num(row.budget), 0)), count: inStage.length };
  });

  const revisionBuckets = [
    { rounds: "No revisions", test: (value: number) => value <= 0 },
    { rounds: "1 round", test: (value: number) => value === 1 },
    { rounds: "2 rounds", test: (value: number) => value === 2 },
    { rounds: "3+ rounds", test: (value: number) => value >= 3 },
  ];
  const revisions = revisionBuckets.map(({ rounds, test }) => ({ rounds, count: rows.filter((row) => test(num(row.revision_count))).length }));

  const prescreening = [
    { result: "passed", count: rows.filter((row) => row.prescreening_passed === true).length },
    { result: "failed", count: rows.filter((row) => row.prescreening_passed === false).length },
    { result: "not_run", count: rows.filter((row) => row.prescreening_passed == null).length },
  ];

  const finance = [
    { group: "not_income_generating", count: rows.filter((row) => !row.is_income_generating).length },
    { group: "cleared", count: rows.filter((row) => row.is_income_generating && row.finance_clearance).length },
    { group: "awaiting", count: rows.filter((row) => row.is_income_generating && !row.finance_clearance).length },
  ];

  const approved = rows.filter((row) => row.status === "approved");
  const requestedBudget = rows.reduce((sum, row) => sum + num(row.budget), 0);
  const approvedBudget = approved.reduce((sum, row) => sum + num(row.budget), 0);
  return {
    totals: {
      requestedBudget: round1(requestedBudget),
      approvedBudget: round1(approvedBudget),
      averageBudget: rows.length ? round1(requestedBudget / rows.length) : 0,
      expectedBeneficiaries: rows.reduce((sum, row) => sum + Math.max(0, num(row.expected_beneficiary_count)), 0),
      approvedBeneficiaries: approved.reduce((sum, row) => sum + Math.max(0, num(row.expected_beneficiary_count)), 0),
      communityValidated: rows.filter((row) => row.community_validated === true).length,
    },
    monthly, byBarangay, budgetByStage, revisions, prescreening, finance,
  };
}

export function sdgInsights(input: {
  proposals: ProposalInsightRow[];
  programs: Array<{ id?: string | null; sdg_alignments?: number[] | null }>;
  outcomes: Array<{ sdg_goal?: number | null; program_id?: string | null }>;
}) {
  const sdgs = FOCUS_SDG_NUMBERS as readonly number[];
  const byStage = sdgs.map((sdg) => {
    const counts = zeroStages();
    for (const row of input.proposals) if (alignedSdgs(row).includes(sdg)) counts[proposalStageGroup(row.status)] += 1;
    return { sdg, ...counts };
  });

  const investment = sdgs.map((sdg) => {
    const aligned = input.proposals.filter((row) => alignedSdgs(row).includes(sdg));
    return {
      sdg,
      requested: round1(aligned.reduce((sum, row) => sum + num(row.budget), 0)),
      approved: round1(aligned.filter((row) => row.status === "approved").reduce((sum, row) => sum + num(row.budget), 0)),
      beneficiaries: aligned.reduce((sum, row) => sum + Math.max(0, num(row.expected_beneficiary_count)), 0),
    };
  });

  const barangays = new Map<string, Record<string, number | string>>();
  for (const row of input.proposals) {
    const sdgList = alignedSdgs(row);
    if (!sdgList.length) continue;
    const barangay = nameOf(row.barangays);
    const entry = barangays.get(barangay) ?? { barangay, ...Object.fromEntries(sdgs.map((sdg) => [`sdg${sdg}`, 0])), total: 0 };
    for (const sdg of sdgList) entry[`sdg${sdg}`] = num(entry[`sdg${sdg}`]) + 1;
    entry.total = num(entry.total) + sdgList.length;
    barangays.set(barangay, entry);
  }
  const byBarangay = Array.from(barangays.values()).sort((a, b) => num(b.total) - num(a.total)).slice(0, 10) as Array<{ barangay: string; total: number } & Record<string, number | string>>;

  const programIds = new Set(input.programs.map((program) => program.id).filter(Boolean));
  const delivery = sdgs.map((sdg) => ({
    sdg,
    programs: input.programs.filter((program) => (program.sdg_alignments ?? []).includes(sdg)).length,
    outcomes: input.outcomes.filter((outcome) => outcome.sdg_goal === sdg && (!outcome.program_id || programIds.has(outcome.program_id))).length,
  }));

  const quarters = quarterBuckets(input.proposals.filter((row) => alignedSdgs(row).length).map((row) => row.created_at));
  const quarterly = quarters.map(({ key, label }) => {
    const entry: Record<string, number | string> = { quarter: label };
    for (const sdg of sdgs) {
      entry[`sdg${sdg}`] = input.proposals.filter((row) => quarterKey(row.created_at) === key && alignedSdgs(row).includes(sdg)).length;
    }
    return entry as { quarter: string } & Record<string, number | string>;
  });

  return { byStage, investment, byBarangay, delivery, quarterly };
}

// ─── Community profile (imported profiling source tables) ─────────────────

export type ProfileSourceRow = {
  recordType?: string | null; section?: string | null; topic?: string | null; category?: string | null;
  frequency?: number | null; percentage?: number | null; reportedTableTotal?: number | null;
  multipleResponses?: string | null; tableId?: string | null;
};

export type ProfileTable = {
  id: string; topic: string; section: string; base: number | null; multipleResponses: boolean;
  rows: Array<{ category: string; count: number; percent: number }>;
};

/** Quantitative source rows only; narratives and representative notes never leave the database route. */
export function profileTables(rows: ProfileSourceRow[]): ProfileTable[] {
  const tables = new Map<string, ProfileTable>();
  for (const row of rows) {
    if (row.recordType !== "quantitative_data" || !row.tableId || !row.topic || !row.category) continue;
    const table = tables.get(row.tableId) ?? {
      id: row.tableId,
      topic: row.topic.trim(),
      section: titleCase((row.section ?? "").replace(/^[IVX]+\.\s*/, ""), "Profile"),
      base: row.reportedTableTotal == null ? null : num(row.reportedTableTotal),
      multipleResponses: row.multipleResponses === "Yes",
      rows: [],
    };
    // Keep the source's two-decimal percentages (e.g. 30.51) rather than recomputing them.
    table.rows.push({ category: row.category.trim(), count: Math.max(0, num(row.frequency)), percent: Math.round(Math.max(0, num(row.percentage)) * 100) / 100 });
    tables.set(row.tableId, table);
  }
  return Array.from(tables.values())
    .map((table) => ({ ...table, base: table.base ?? table.rows.reduce((sum, row) => sum + row.count, 0) }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

const PROFILE_INDICATORS = [
  { key: "flood", label: "Flood-prone households", theme: "environment", topic: "Flood-Prone Households", categories: ["Yes"] },
  { key: "income_low", label: "Monthly income below ₱10,000", theme: "livelihood", topic: "Monthly Household Income", categories: ["Below Php 5,000", "Php 5,000 - Php 9,999"] },
  { key: "no_assistance", label: "No government assistance", theme: "livelihood", topic: "Government Assistance", categories: ["None"] },
  { key: "income_insufficient", label: "Income not enough for monthly needs", theme: "livelihood", topic: "Income Sufficiency", categories: ["No"] },
  { key: "no_insurance", label: "No health insurance", theme: "health", topic: "Health Insurance Coverage", categories: ["None"] },
  { key: "no_vaccination", label: "No child vaccination reported", theme: "health", topic: "Child Vaccination Status", categories: ["None"] },
  { key: "insecure_tenure", label: "Renting or informal settlers", theme: "infrastructure", topic: "Housing Tenure", categories: ["Rented", "Informal Settlers"] },
  { key: "no_internet", label: "No internet access", theme: "education", topic: "Internet Access", categories: ["No"] },
  { key: "elderly", label: "Households with elderly members", theme: "health", topic: "Presence of Elderly Members", categories: ["Yes"] },
  { key: "nutrition", label: "Reported nutritional concerns", theme: "health", topic: "Nutritional Concerns and Health Risks", categories: ["Yes"] },
  { key: "no_healthcare", label: "No access to healthcare services", theme: "health", topic: "Access to Healthcare Services", categories: ["No"] },
] as const;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Headline vulnerability shares, using the percentages exactly as the source printed them. */
export function profileIndicators(tables: ProfileTable[]) {
  return PROFILE_INDICATORS.flatMap((spec) => {
    const table = tables.find((candidate) => same(candidate.topic, spec.topic));
    if (!table) return [];
    const matched = table.rows.filter((row) => spec.categories.some((category) => same(row.category, category)));
    if (!matched.length) return [];
    return [{
      key: spec.key, label: spec.label, theme: spec.theme,
      percent: round1(matched.reduce((sum, row) => sum + row.percent, 0)),
      count: matched.reduce((sum, row) => sum + row.count, 0),
      base: table.base ?? 0,
      ofResponses: table.multipleResponses,
    }];
  }).sort((a, b) => b.percent - a.percent);
}

// ─── Impact measurement ────────────────────────────────────────────────────

/** Older records use "beneficiaries"; the form records "beneficiaries_reached". Both mean people reached. */
export const BENEFICIARY_INDICATOR_TYPES = ["beneficiaries_reached", "beneficiaries"] as const;
export const isBeneficiaryIndicator = (type: string | null | undefined) => (BENEFICIARY_INDICATOR_TYPES as readonly string[]).includes(type ?? "");

/** Overdue when flagged overdue, or still open after its scheduled date. */
export function followUpState(row: { status?: string | null; scheduled_date?: string | null }, today: string): "completed" | "overdue" | "upcoming" | "cancelled" {
  if (row.status === "completed") return "completed";
  if (row.status === "cancelled") return "cancelled";
  if (row.status === "overdue" || (row.scheduled_date != null && row.scheduled_date < today)) return "overdue";
  return "upcoming";
}

export function impactInsights(input: {
  indicators: Array<{ program_id?: string | null; indicator_type?: string | null; value?: number | string | null }>;
  stories: Array<{ type?: string | null }>;
  followUps: Array<{ status?: string | null; scheduled_date?: string | null }>;
  programs: Array<{ id?: string | null; title?: string | null; status?: string | null; barangays?: unknown; project_proposal_id?: string | null; proposal_id?: string | null }>;
  proposals: Array<{ id?: string | null; expected_beneficiary_count?: number | null }>;
  surveys: Array<{ id?: string | null; title?: string | null; parent_survey_id?: string | null }>;
  today: string;
}) {
  const programs = new Map(input.programs.filter((program) => program.id).map((program) => [String(program.id), program]));
  const planned = new Map(input.proposals.filter((proposal) => proposal.id).map((proposal) => [String(proposal.id), Math.max(0, num(proposal.expected_beneficiary_count))]));

  const reachedByProgram = new Map<string, number>();
  for (const indicator of input.indicators) {
    if (!indicator.program_id || !isBeneficiaryIndicator(indicator.indicator_type)) continue;
    reachedByProgram.set(indicator.program_id, (reachedByProgram.get(indicator.program_id) ?? 0) + Math.max(0, num(indicator.value)));
  }

  const barangays = new Map<string, { barangay: string; people: number; programs: number }>();
  reachedByProgram.forEach((people, programId) => {
    const barangay = nameOf(programs.get(programId)?.barangays);
    const entry = barangays.get(barangay) ?? { barangay, people: 0, programs: 0 };
    entry.people += people;
    entry.programs += 1;
    barangays.set(barangay, entry);
  });
  const reachByBarangay = Array.from(barangays.values()).map((row) => ({ ...row, people: round1(row.people) })).sort((a, b) => b.people - a.people).slice(0, 10);

  // Only programs that have started: an upcoming program with 0 reached is not a shortfall.
  const plannedVsActual = Array.from(programs.values())
    .filter((program) => program.status === "active" || program.status === "completed" || reachedByProgram.has(String(program.id)))
    .map((program) => {
      const proposalId = program.project_proposal_id ?? program.proposal_id ?? null;
      return {
        program: program.title?.trim() || "Untitled program",
        barangay: nameOf(program.barangays),
        planned: proposalId ? planned.get(proposalId) ?? 0 : 0,
        reached: round1(reachedByProgram.get(String(program.id)) ?? 0),
      };
    })
    .filter((row) => row.planned > 0 || row.reached > 0)
    .sort((a, b) => Math.max(b.planned, b.reached) - Math.max(a.planned, a.reached))
    .slice(0, 10);

  const states = input.followUps.map((row) => ({ state: followUpState(row, input.today), month: monthKey(row.scheduled_date) }));
  const monthKeys = states.map((row) => row.month).filter((key): key is string => Boolean(key)).sort();
  const followThrough: Array<{ month: string; completed: number; upcoming: number; overdue: number }> = [];
  if (monthKeys.length) {
    const [startYear, startMonth] = monthKeys[0].split("-").map(Number);
    const end = monthKeys[monthKeys.length - 1];
    for (let offset = 0; ; offset++) {
      const date = new Date(Date.UTC(startYear, startMonth - 1 + offset, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      if (key > end) break;
      const inMonth = states.filter((row) => row.month === key);
      followThrough.push({
        month: monthLabel(key),
        completed: inMonth.filter((row) => row.state === "completed").length,
        upcoming: inMonth.filter((row) => row.state === "upcoming").length,
        overdue: inMonth.filter((row) => row.state === "overdue").length,
      });
    }
  }

  const titles = new Map(input.surveys.filter((survey) => survey.id).map((survey) => [String(survey.id), survey.title?.trim() || "Untitled survey"]));
  const surveyPairs = input.surveys
    .filter((survey) => survey.id && survey.parent_survey_id && titles.has(survey.parent_survey_id))
    .map((survey) => ({ baselineId: String(survey.parent_survey_id), baselineTitle: titles.get(String(survey.parent_survey_id)) ?? "", followupId: String(survey.id), followupTitle: titles.get(String(survey.id)) ?? "" }));

  const peopleReached = Array.from(reachedByProgram.values()).reduce((sum, value) => sum + value, 0);
  return {
    totals: {
      peopleReached: round1(peopleReached),
      barangaysReached: reachByBarangay.length,
      programsMeasured: new Set(input.indicators.map((row) => row.program_id).filter(Boolean)).size,
      completedPrograms: input.programs.filter((program) => program.status === "completed").length,
      stories: input.stories.length,
      followUps: {
        total: states.filter((row) => row.state !== "cancelled").length,
        completed: states.filter((row) => row.state === "completed").length,
        upcoming: states.filter((row) => row.state === "upcoming").length,
        overdue: states.filter((row) => row.state === "overdue").length,
      },
    },
    reachByBarangay, plannedVsActual, followThrough, surveyPairs,
  };
}
