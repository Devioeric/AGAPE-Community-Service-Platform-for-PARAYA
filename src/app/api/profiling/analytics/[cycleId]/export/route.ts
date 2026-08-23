import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";
import { enforceAggregateComplementarySuppression } from "@/lib/profiling/privacy";
import { getRequestIp, recordAudit } from "@/lib/audit/log";
import type { ProfilingAggregateDTO } from "@/types/profiling";

export async function GET(request: Request, { params }: { params: Promise<{ cycleId: string }> }) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { cycleId } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_profiling_aggregate", { p_cycle_id: cycleId });
  if (error) return profilingRpcError(error);
  let aggregate: ProfilingAggregateDTO;
  try { aggregate = enforceAggregateComplementarySuppression(data as ProfilingAggregateDTO); }
  catch { return NextResponse.json({ error: "Aggregate privacy contract validation failed" }, { status: 500 }); }
  const audited = await recordAudit({ user_id: auth.actor.id, user_email: auth.actor.email, action: "Profiling aggregate exported", resource_type: "profiling_cycles", resource_id: cycleId, level: "warning", ip_address: getRequestIp(request), metadata: { format: new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx", pii: false, schema_version: aggregate.schemaVersion } });
  if (!audited) return NextResponse.json({ error: "Export was blocked because its audit record could not be stored" }, { status: 503 });
  const rows = aggregate.cells.map((cell) => ({ dimension: cell.dimension, category: cell.key, count: cell.count.suppressed ? cell.count.label : cell.count.value, suppressed: cell.count.suppressed }));
  const meta = [{ cycle: aggregate.cycle.name, cycle_status: aggregate.cycle.status, sample_method: aggregate.sample.method, target_households: aggregate.sample.targetHouseholds, approved_households: aggregate.sample.approvedHouseholds, approved_residents: aggregate.sample.approvedResidents, coverage_percent: aggregate.sample.coveragePercent, source: aggregate.source.kind, legacy_excluded: true, official_population: aggregate.official.totalPopulation, official_households: aggregate.official.totalHouseholds, official_source: aggregate.official.sourceName, official_as_of: aggregate.official.asOfDate, aggregate_as_of: aggregate.asOf, suppression_threshold: aggregate.privacy.suppressionThreshold }];
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(meta), "Metadata"); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Aggregate Cells");
  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const provenance = Object.entries(meta[0]).map(([field, value]) => ({ record_type: "provenance", dimension: "metadata", category: field, count: value ?? "", suppressed: false }));
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet([...provenance, ...rows.map((row) => ({ record_type: "aggregate_cell", ...row }))]));
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="profiling-${cycleId}.csv"`, "Cache-Control": "no-store" } });
  }
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new NextResponse(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="profiling-${cycleId}.xlsx"`, "Cache-Control": "no-store" } });
}
