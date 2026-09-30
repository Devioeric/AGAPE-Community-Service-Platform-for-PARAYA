import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
function hasStructuredDocument(value: unknown): value is { generation?: { mode?: string } } {
  return Boolean(value && typeof value === "object" && (value as { schema?: unknown }).schema === "agape.reporting.document.v2");
}

export async function GET(request: Request) {
  const auth = await authorizeCapability("report.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "private, no-store" } });
  const { data, error } = await auth.supabase.rpc("phase6_list_reports", { p_include_archived: new URL(request.url).searchParams.get("include_archived") === "true" });
  if (error) return NextResponse.json({ error: "Reports are temporarily unavailable", code: "reports_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  const reports = ((data ?? []) as Record<string, unknown>[]).map(row => ({
    id: row.id,
    title: row.title,
    period_start: row.periodStart,
    period_end: row.periodEnd,
    narrative: row.narrative,
    status: row.status,
    row_version: row.rowVersion,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    approved_at: row.approvedAt,
    approved_hash: row.approvedHash,
    archived_at: row.archivedAt,
    report_document: hasStructuredDocument(row.reportDocument) ? row.reportDocument : null,
    generation_mode: hasStructuredDocument(row.reportDocument) ? row.reportDocument.generation?.mode ?? null : null,
    users: row.generatedByName ? { full_name: row.generatedByName } : null,
  }));
  return NextResponse.json({ data: reports }, { headers: { "Cache-Control": "private, no-store" } });
}
