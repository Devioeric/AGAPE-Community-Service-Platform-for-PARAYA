import { exportSheetsToExcel, type ExcelSheet } from "@/lib/export";
import { reportDocumentSchema } from "@/lib/reporting/report-document";

export function exportStructuredReport(value: unknown, filename = "paraya-period-report"): boolean {
  const parsed = reportDocumentSchema.safeParse(value);
  if (!parsed.success) return false;
  const document = parsed.data;
  const sheetNames: Record<string, string> = {
    executive_metrics: "Executive Metrics",
    program_portfolio: "Program Portfolio",
    community_needs: "Community Needs",
    profiling_coverage: "Profiling Coverage",
    volunteer_engagement: "Volunteer Engagement",
    partnerships_and_history: "Partnerships & History",
    finance_and_resources: "Finance & Resources",
    sdg_contributions: "SDG Contributions",
    impact_and_outcomes: "Impact & Outcomes",
    recommendations_and_next_steps: "Recommendations",
    data_quality_and_limitations: "Data Quality",
  };
  const sheets: ExcelSheet[] = [
    { name: "Cover", rows: [{ Organization: "PARAYA", Institution: "Dr. Yanga's Colleges, Inc.", Title: document.title, Period: `${document.period.start} to ${document.period.end}`, "As of": document.period.asOf, "Generation mode": document.generation.mode, "Review status": "Human review required" }] },
    ...document.sections
      .filter(section => section.id !== "scope_and_methodology")
      .map(section => ({ name: sheetNames[section.id] ?? section.title, rows: section.metrics.length ? section.metrics.map(metric => ({ Metric: metric.label, Value: metric.value, Unit: metric.unit ?? "", Definition: metric.definition, Source: metric.source, Availability: section.availability })) : [{ Narrative: section.narrative, Availability: section.availability, Notes: section.notes.join(" | ") }] })),
  ];
  exportSheetsToExcel(sheets, filename);
  return true;
}
