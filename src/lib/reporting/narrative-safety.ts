import { reportNarrativeDraftSchema, type ReportNarrativeDraft } from "./report-document";
import type { ReportingAggregateV2DTO } from "./contracts";

// Defense in depth, not a substitute for the strict aggregate-only input DTO.
// Never allow model-provided paths, identifiers or contact data into a report.
const UNSAFE = /https?:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|\b(?:resident[_ ]?(?:id|name|code)|household[_ ]?(?:id|code)|date of birth|birthdate|contact number|phone number|exact address)\s*[:=]|\+?63\d{10}\b|\b09\d{9}\b|\b(?:HH|RES)-[A-Z0-9-]+\b/i;
const DECISION_CLAIM = /\b(?:I|we|AI|assistant)\s+(?:have\s+|has\s+)?(?:approved|submitted|rejected|returned|acknowledged|published|archived|corrected)\b|\b(?:report|proposal)\s+(?:is|has been|was)\s+(?:approved|submitted|rejected|published)\b|\b(?:approve|reject|submit|publish|archive|acknowledge)\s+(?:this|the|all)\s+(?:report|proposal|record|need)s?\b/i;

export function assertSafeReportText(text: string): void {
  if (UNSAFE.test(text) || DECISION_CLAIM.test(text) || /\bSDG\s*(?:1[0-6]|[1-35-8])\b/i.test(text)) throw new Error("Unsafe report prose");
}

export function parseReportNarrativeDraft(raw: string, aggregate: ReportingAggregateV2DTO): ReportNarrativeDraft {
  if (raw.length > 50_000) throw new Error("Report prose too large");
  const draft = reportNarrativeDraftSchema.parse(JSON.parse(raw));
  const text = [draft.executiveSummary, ...Object.values(draft.sectionNarratives), ...draft.recommendations].join("\n");
  assertSafeReportText(text);
  // Numeric facts must come from the validated aggregate, not model estimates.
  const permitted = new Set((JSON.stringify(aggregate).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number));
  for (const match of Array.from(text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?/g))) {
    if (!permitted.has(Number(match[0].replaceAll(",", "")))) throw new Error("Unsupported numeric claim");
  }
  return draft;
}
