import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";

export async function GET() {
  const auth = await authorizeCapability("report.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase6_list_reports", { p_include_archived: false });
  if (error) return NextResponse.json({ error: "Unable to load reports" }, { status: 500 });
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
    users: row.generatedByName ? { full_name: row.generatedByName } : null,
  }));
  return NextResponse.json({ data: reports });
}
