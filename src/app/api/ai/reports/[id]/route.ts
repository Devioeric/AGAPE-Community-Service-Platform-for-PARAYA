import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { reportChangeSchema, retainedWriteFailure } from "@/lib/reports/lifecycle-contract";

function hasStructuredDocument(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && (value as { schema?: unknown }).schema === "agape.reporting.document.v2");
}

type Ctx = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("report.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid report" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  const { data, error } = await auth.supabase.rpc("phase6_get_report_history", { p_report_id: id });
  if (error) { const failure = retainedWriteFailure(error.code); return NextResponse.json({ error: failure.error }, { status: failure.status, headers: { "Cache-Control": "private, no-store" } }); }
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("report.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "private, no-store" } });
  const parsed = reportChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid report transition" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid report" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  const value = parsed.data;
  let data; let error;
  if (value.action === "correct") {
    const reportDocument = "report_document" in value ? value.report_document : null;
    if (hasStructuredDocument(reportDocument)) {
      ({ data, error } = await auth.supabase.rpc("phase6_correct_report_v2", { p_report_id: id, p_expected_version: value.expected_version, p_narrative: value.narrative, p_report_document: reportDocument, p_reason: value.reason }));
    } else {
      ({ data, error } = await auth.supabase.rpc("phase6_correct_report", { p_report_id: id, p_expected_version: value.expected_version, p_narrative: value.narrative, p_reason: value.reason }));
    }
  } else ({ data, error } = await auth.supabase.rpc("phase6_transition_report", {
    p_report_id: id,
    p_expected_version: parsed.data.expected_version,
    p_action: parsed.data.action,
    p_reason: "reason" in value ? value.reason : null,
  }));
  if (error) { const failure = retainedWriteFailure(error.code); return NextResponse.json({ error: failure.error }, { status: failure.status, headers: { "Cache-Control": "private, no-store" } }); }
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE() {
  return NextResponse.json({ error: "Reports are retained for audit; use the archive lifecycle action" }, { status: 405, headers: { Allow: "GET, PATCH", "Cache-Control": "private, no-store" } });
}
