import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";
import { buildStagedProfilingPackages, parsePairedProfilingCsv, parseProfilingWorkbook } from "@/lib/profiling/import-parser";
import { PROFILING_MAX_UPLOAD_BYTES } from "@/lib/profiling/contracts";
import { getAuthorizedProfilingCycleContext } from "@/lib/profiling/server-context";
import { readLimitedFormData, RequestBodyTooLargeError } from "@/lib/http/limited-form-data";

export async function POST(request: Request) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeCapability("profiling.collect");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let form: FormData | null = null;
  try { form = await readLimitedFormData(request, PROFILING_MAX_UPLOAD_BYTES + 1_000_000); }
  catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Upload exceeds the 10 MB profiling limit" }, { status: 413 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Multipart form data is required" }, { status: 400 });
  }
  if (!form) return NextResponse.json({ error: "Multipart form data is required" }, { status: 400 });
  const cycleId = String(form.get("cycle_id") ?? "");
  const sitioId = String(form.get("sitio_id") ?? "");
  const workbook = form.get("workbook");
  const householdCsv = form.get("household_csv");
  const residentCsv = form.get("resident_csv");
  const replacesBatchId = String(form.get("replaces_batch_id") ?? "") || null;
  let cycle;
  try { cycle = await getAuthorizedProfilingCycleContext(auth.supabase, cycleId); }
  catch (error) { return profilingRpcError(error); }
  if (!cycle?.collection_starts_on) return NextResponse.json({ error: "Profiling cycle not found" }, { status: 404 });
  try {
    let parsed;
    let sourceType: "xlsx" | "csv";
    if (workbook instanceof File) {
      if (workbook.size > PROFILING_MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Workbook exceeds the 10 MB limit" }, { status: 413 });
      parsed = parseProfilingWorkbook(new Uint8Array(await workbook.arrayBuffer())); sourceType = "xlsx";
    } else if (householdCsv instanceof File && residentCsv instanceof File) {
      if (householdCsv.size + residentCsv.size > PROFILING_MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Combined CSV files exceed the 10 MB limit" }, { status: 413 });
      parsed = parsePairedProfilingCsv(new Uint8Array(await householdCsv.arrayBuffer()), new Uint8Array(await residentCsv.arrayBuffer())); sourceType = "csv";
    } else return NextResponse.json({ error: "Provide one workbook or both paired CSV files" }, { status: 400 });
    const staged = buildStagedProfilingPackages(parsed, cycleId, cycle.collection_starts_on);
    const errors = staged.errors.map((error) => ({ sheet: error.sheet, row: error.row, field: error.field ?? null, message: error.message, fatal: error.fatal }));
    const { data, error } = await auth.supabase.rpc("phase1_stage_profiling_import_v2", {
      p_cycle_id: cycleId, p_sitio_id: sitioId, p_source_type: sourceType, p_file_hash: parsed.fileHash,
      p_template_version: parsed.templateVersion, p_packages: staged.packages, p_errors: errors, p_replaces_batch_id: replacesBatchId,
    });
    if (error) return profilingRpcError(error);
    const result = data as { batch_id: string; status: string; duplicate_count: number };
    return NextResponse.json({ data: { batch_id: result.batch_id, status: result.status, duplicate_count: result.duplicate_count, file_hash: parsed.fileHash, template_version: parsed.templateVersion, total_rows: parsed.totalRows, packages: staged.packages, errors } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse import" }, { status: 400 });
  }
}
