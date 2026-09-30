import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeCapability } from "@/lib/auth/authorize";
import { generateStructuredReport } from "@/lib/ai/narrative";
import { reportingAggregateSchema, reportingAggregateV2Schema } from "@/lib/reporting/contracts";
import { reportDocumentToLegacyNarrative } from "@/lib/reporting/report-document";
import { REPORT_ERRORS, ReportingError, reportingPeriodSchema, type ReportingErrorCode } from "@/lib/reporting/generation-contract";
import { recordReportGenerationTelemetry } from "@/lib/reporting/telemetry";

function failure(code: ReportingErrorCode, requestId: string, status = 503) {
  return NextResponse.json({ error: REPORT_ERRORS[code], code, requestId }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const emit = (outcome: "success" | "failure", code?: string, document?: { generation: { mode: "ai" | "template"; provider: string | null; model: string | null }; executiveSummary: { narrative: string }; sections: Array<{ narrative: string; notes: string[] }> }, aggregate?: unknown) => {
    const contextCharacterCount = aggregate ? JSON.stringify(aggregate).length : 0;
    const outputCharacterCount = document ? document.executiveSummary.narrative.length + document.sections.reduce((sum, section) => sum + section.narrative.length + section.notes.join(" ").length, 0) : 0;
    recordReportGenerationTelemetry({
      provider: document?.generation.provider ?? null,
      model: document?.generation.model ?? null,
      estimatedInputTokens: Math.ceil(contextCharacterCount / 4),
      estimatedOutputTokens: Math.min(2048, Math.ceil(outputCharacterCount / 4)),
      historyCharacterCount: 0,
      contextCharacterCount,
      selectedTopicCount: 0,
      durationMs: Date.now() - startedAt,
      fallbackUsed: document?.generation.mode === "template",
      outcome,
      failureCode: code,
    });
  };
  const auth = await authorizeCapability("report.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "private, no-store" } });
  const body = await request.json().catch(() => null);
  const parsed = reportingPeriodSchema.safeParse(body);
  if (!parsed.success) { emit("failure", "invalid_period"); return failure("invalid_period", requestId, 400); }
  const { period_start: periodStart, period_end: periodEnd } = parsed.data;

  let aggregateJson: unknown;
  try {
    const result = await auth.supabase.rpc("phase6_reporting_aggregate_v2", { p_period_start: periodStart, p_period_end: periodEnd });
    if (result.error) throw result.error;
    aggregateJson = result.data;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "22023") { emit("failure", "invalid_period"); return failure("invalid_period", requestId, 400); }
    emit("failure", "aggregate_unavailable");
    return failure("aggregate_unavailable", requestId);
  }
  // Keep the v1 validator available for legacy diagnostics, but never promote
  // a v1 aggregate to a v2 report document.
  if (aggregateJson && typeof aggregateJson === "object" && (aggregateJson as { schema?: string }).schema === "agape.reporting.aggregate.v1") {
    try { reportingAggregateSchema.parse(aggregateJson); } catch { /* legacy payload is still rejected below */ }
    emit("failure", "aggregate_invalid");
    return failure("aggregate_invalid", requestId);
  }
  const aggregate = reportingAggregateV2Schema.safeParse(aggregateJson);
  if (!aggregate.success) return failure("aggregate_invalid", requestId);

  let document;
  try {
    document = await generateStructuredReport(aggregate.data);
  } catch (error) {
    const code = error instanceof ReportingError ? error.code : "provider_unavailable";
    emit("failure", code, undefined, aggregate.data);
    return failure(code, requestId);
  }

  try {
    const narrative = reportDocumentToLegacyNarrative(document);
    const created = await auth.supabase.rpc("phase6_create_report_v2", {
      p_title: document.title,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_narrative: narrative,
      p_report_document: document,
      p_source_metadata: aggregate.data,
    });
    if (created.error) throw created.error;
    emit("success", undefined, document, aggregate.data);
    return NextResponse.json({ data: created.data, requestId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    emit("failure", "report_persistence_unavailable", document, aggregate.data);
    return failure("report_persistence_unavailable", requestId);
  }
}
