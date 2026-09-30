import { z } from "zod";
import type { ReportingAggregateV2DTO } from "./contracts";

export const REPORT_SECTION_IDS = [
  "scope_and_methodology",
  "executive_metrics",
  "program_portfolio",
  "community_needs",
  "profiling_coverage",
  "volunteer_engagement",
  "partnerships_and_history",
  "finance_and_resources",
  "sdg_contributions",
  "impact_and_outcomes",
  "recommendations_and_next_steps",
  "data_quality_and_limitations",
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_IDS)[number];

const reportMetricSchema = z.object({
  label: z.string().trim().min(1).max(160),
  value: z.union([z.number().finite(), z.string().max(500), z.null()]),
  unit: z.string().max(40).optional(),
  definition: z.string().max(500),
  source: z.string().max(180),
}).strict();

const reportSectionSchema = z.object({
  id: z.enum(REPORT_SECTION_IDS),
  title: z.string().trim().min(1).max(180),
  availability: z.enum(["available", "empty", "unavailable", "suppressed"]),
  narrative: z.string().max(6000),
  metrics: z.array(reportMetricSchema).max(100),
  notes: z.array(z.string().max(500)).max(30),
}).strict();

const provenanceSchema = z.object({
  aggregateSchema: z.literal("agape.reporting.aggregate.v2"),
  source: z.literal("approved_and_status_explicit_operational_records"),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  asOf: z.string().date(),
  profilingCycleCount: z.number().int().nonnegative().nullable(),
  profilingSampleSize: z.number().int().nonnegative().nullable(),
  domainStatuses: z.record(z.string(), z.enum(["available", "empty", "unavailable", "suppressed"])),
  qualityFlags: z.array(z.string().max(500)).max(50),
}).strict();

export const reportDocumentSchema = z.object({
  schema: z.literal("agape.reporting.document.v2"),
  reportType: z.literal("period_accomplishment"),
  title: z.string().trim().min(1).max(240),
  organization: z.object({ name: z.literal("PARAYA"), institution: z.literal("Dr. Yanga's Colleges, Inc.") }).strict(),
  period: z.object({ start: z.string().date(), end: z.string().date(), asOf: z.string().date() }).strict(),
  generation: z.object({ mode: z.enum(["ai", "template"]), provider: z.string().max(120).nullable(), model: z.string().max(160).nullable(), generatedAt: z.string().datetime() }).strict(),
  executiveSummary: z.object({ heading: z.literal("Executive Summary"), narrative: z.string().max(6000) }).strict(),
  sections: z.array(reportSectionSchema).length(REPORT_SECTION_IDS.length),
  provenance: provenanceSchema,
  statusNotes: z.object({ reviewRequired: z.literal(true), advisoryOnly: z.literal(true) }).strict(),
}).strict().superRefine((document, ctx) => {
  const ids = document.sections.map(section => section.id);
  const unique = new Set(ids);
  if (unique.size !== REPORT_SECTION_IDS.length || REPORT_SECTION_IDS.some(id => !unique.has(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "All report sections must appear exactly once" });
  }
  if (document.period.end < document.period.start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["period"], message: "Report period is invalid" });
  }
  if (ids.some((id, index) => id !== REPORT_SECTION_IDS[index])) ctx.addIssue({ code: "custom", message: "Report sections must use canonical order" });
  if (document.generation.mode === "template" && (document.generation.provider !== null || document.generation.model !== null)) ctx.addIssue({ code: "custom", message: "Templates must not claim an AI provider" });
  if (document.provenance.periodStart !== document.period.start || document.provenance.periodEnd !== document.period.end || document.provenance.asOf !== document.period.asOf) ctx.addIssue({ code: "custom", message: "Provenance period must match the document" });
  for (const section of document.sections) {
    if ((section.availability === "unavailable" || section.availability === "suppressed") && section.metrics.some(metric => metric.value !== null)) ctx.addIssue({ code: "custom", message: "Unavailable or suppressed metrics must be null" });
  }
});

export type ReportMetric = z.infer<typeof reportMetricSchema>;
export type ReportSection = z.infer<typeof reportSectionSchema>;
export type ReportProvenance = z.infer<typeof provenanceSchema>;
export type ReportDocumentV2 = z.infer<typeof reportDocumentSchema>;

export const reportNarrativeDraftSchema = z.object({
  schema: z.literal("agape.reporting.ai-draft.v1"),
  executiveSummary: z.string().trim().min(1).max(6000),
  sectionNarratives: z.record(z.enum(REPORT_SECTION_IDS), z.string().max(6000)),
  recommendations: z.array(z.string().trim().min(1).max(600)).max(12),
}).strict();

export type ReportNarrativeDraft = z.infer<typeof reportNarrativeDraftSchema>;

const TITLES: Record<ReportSectionId, string> = {
  scope_and_methodology: "Scope and Methodology",
  executive_metrics: "Executive Metrics",
  program_portfolio: "Program Portfolio",
  community_needs: "Community Needs",
  profiling_coverage: "Profiling Coverage",
  volunteer_engagement: "Volunteer Engagement",
  partnerships_and_history: "Partnerships and Historical Programs",
  finance_and_resources: "Finance and Resources",
  sdg_contributions: "SDG Contributions",
  impact_and_outcomes: "Impact and Outcomes",
  recommendations_and_next_steps: "Recommendations and Next Steps",
  data_quality_and_limitations: "Data Quality and Limitations",
};

function metric(label: string, value: number | string | null, definition: string, source: string, unit?: string): ReportMetric {
  return { label, value, definition, source, ...(unit ? { unit } : {}) };
}

export function buildTemplateReportDocument(aggregate: ReportingAggregateV2DTO, title = `PARAYA Period Accomplishment Report — ${aggregate.periodStart} to ${aggregate.periodEnd}`): ReportDocumentV2 {
  const asOf = aggregate.asOf;
  const p = aggregate.programs ?? {};
  const v = aggregate.volunteers ?? {};
  const n = aggregate.needs ?? {};
  const q = aggregate.quality ?? {};
  const status = (id: ReportSectionId): ReportSection["availability"] => q.domainStatuses?.[id] ?? "available";
  const section = (id: ReportSectionId, narrative: string, metrics: ReportMetric[] = [], notes: string[] = []): ReportSection => ({ id, title: TITLES[id], availability: status(id), narrative, metrics: metrics.map(item => status(id) === "unavailable" || status(id) === "suppressed" ? { ...item, value: null } : item), notes });
  const sections: ReportSection[] = [
    section("scope_and_methodology", "This period report summarizes aggregate operational records available as of the stated date. It is advisory and requires human review before official use."),
    section("executive_metrics", "Key period measures are shown below; zero is a valid recorded value and unavailable values are left blank.", [
      metric("Total programs", p.total ?? null, "Programs overlapping the selected reporting period.", "Approved operational records"),
      metric("Active programs", p.active ?? null, "Programs with active status overlapping the period.", "Approved operational records"),
      metric("Completed programs", p.completed ?? null, "Programs marked completed in the reporting source.", "Approved operational records"),
      metric("Approved service hours", v.approvedServiceHours ?? null, "Approved volunteer activity-log hours only.", "Approved activity logs", "hours"),
    ]),
    section("program_portfolio", "The program portfolio is summarized by period overlap and explicit status. Proposal statuses describe the current workflow state of proposals created in the period, not the date of a decision.", [...Object.entries(p.statusBreakdown).map(([key, value]) => metric(`Programs — ${key}`, value, "Current status of programs overlapping the period.", "Programs")), metric("Proposals created", aggregate.proposals.created, "Proposals created in the period, including drafts.", "Project proposals"), ...Object.entries(aggregate.proposals.statusBreakdown).map(([key, value]) => metric(`Proposals — ${key}`, value, "Current status of proposals created in the period.", "Project proposals"))]),
    section("community_needs", "Approved community needs are the official evidence source for needs-based planning. Other statuses are workflow indicators only.", [metric("Approved needs", n.approved, "Approved needs created within the period; not all documented needs.", "Community needs"), ...Object.entries(n.statusBreakdown).map(([key, value]) => metric(`Needs — ${key}`, value, "Current workflow status of needs created within the period.", "Community needs"))]),
    section("profiling_coverage", "Profiling coverage is reported only as aggregate provenance; resident-level rows are excluded.", [metric("Profiling cycles", aggregate.profiling?.cycleCount ?? null, "Profiling cycles in the reporting source.", "Profiling cycles"), metric("Sample size", aggregate.profiling?.sampleSize ?? null, "Aggregate sample units; no household or resident identifiers.", "Profiling sample units")]),
    section("volunteer_engagement", "Volunteer engagement uses approved activity records and aggregate participation measures.", [metric("Approved service hours", v.approvedServiceHours ?? null, "Approved activity-log hours only.", "Approved activity logs", "hours"), metric("Participants", v.participants ?? null, "Aggregate participant count where available.", "Approved program signups")]),
    section("partnerships_and_history", "Partnership and historical-program measures distinguish active relationships from historical quality status. Unknown historical dates are excluded from period accomplishments.", [metric("Active partnerships", aggregate.partnerships.active, "Active terms overlapping the period.", "Partnership terms"), metric("Unexpired active partnerships", aggregate.partnerships.unexpired, "Active terms overlapping the period and not ended or expired as of the report date.", "Partnership terms"), metric("Verified historical programs", aggregate.historicalPrograms.verified, "Accepted complete historical records overlapping the period.", "Historical programs"), metric("Partially verified historical programs", aggregate.historicalPrograms.partial, "Accepted partially verified historical records; separate from verified accomplishments.", "Historical programs"), metric("Unverified historical programs", aggregate.historicalPrograms.unverified, "Unverified or partially unverified historical records overlapping the period.", "Historical programs")]),
    section("finance_and_resources", "Financial figures are shown only where the source supports a consistent currency and definition.", [metric("Allocated budget", aggregate.finance?.allocated ?? null, "Aggregate allocated budget.", "Program budgets", "PHP"), metric("Actual spending", aggregate.finance?.spent ?? null, "Aggregate actual spending.", "Program budgets", "PHP"), metric("Variance", aggregate.finance?.variance ?? null, "Allocated minus actual spending; negative values indicate overspending.", "Program budgets", "PHP")]),
    section("sdg_contributions", "SDG reporting is limited to AGAPE's four approved focus goals: SDG 4, 9, 11, and 17. Alignment is not proof of a verified outcome.", (["4", "9", "11", "17"] as const).map(id => metric(`SDG ${id}`, aggregate.sdg[id], "Proposal alignment links for proposals created during the period.", "Proposal SDG alignments"))),
    section("impact_and_outcomes", "Impact indicators are aggregate counts only and do not include narratives or identifiable subjects.", [metric("Indicators", aggregate.impact?.indicators ?? null, "Non-voided aggregate impact indicators.", "Impact records"), metric("Qualitative records", aggregate.impact?.qualitativeRecords ?? null, "Count of qualitative evidence records without content.", "Impact records")]),
    section("recommendations_and_next_steps", "Review the evidence, resolve flagged data-quality issues, and complete the human review and approval workflow before official use.", [], ["This section is advisory and does not approve, reject, or change any record."]),
    section("data_quality_and_limitations", "The report preserves unavailable domains as unavailable rather than presenting fabricated zero values.", [], q.flags ?? []),
  ];
  const domainStatuses = q.domainStatuses ?? Object.fromEntries(REPORT_SECTION_IDS.map(id => [id, status(id)]));
  return reportDocumentSchema.parse({
    schema: "agape.reporting.document.v2",
    reportType: "period_accomplishment",
    title,
    organization: { name: "PARAYA", institution: "Dr. Yanga's Colleges, Inc." },
    period: { start: aggregate.periodStart, end: aggregate.periodEnd, asOf },
    generation: { mode: "template", provider: null, model: null, generatedAt: new Date().toISOString() },
    executiveSummary: { heading: "Executive Summary", narrative: `This template-generated period report covers ${aggregate.periodStart} through ${aggregate.periodEnd}. It summarizes aggregate operational data and requires human review before official use.` },
    sections,
    provenance: { aggregateSchema: "agape.reporting.aggregate.v2", source: "approved_and_status_explicit_operational_records", periodStart: aggregate.periodStart, periodEnd: aggregate.periodEnd, asOf, profilingCycleCount: aggregate.profiling?.cycleCount ?? null, profilingSampleSize: aggregate.profiling?.sampleSize ?? null, domainStatuses, qualityFlags: q.flags ?? [] },
    statusNotes: { reviewRequired: true, advisoryOnly: true },
  });
}

export function reportDocumentToLegacyNarrative(document: ReportDocumentV2): string {
  return [document.executiveSummary.narrative, ...document.sections.map(section => `${section.title}\n${section.narrative}`)].join("\n\n");
}
