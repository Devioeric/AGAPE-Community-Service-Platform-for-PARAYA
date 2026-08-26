import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { readLimitedFormData, RequestBodyTooLargeError } from "@/lib/http/limited-form-data";
import { HISTORICAL_MAX_UPLOAD_BYTES, HISTORICAL_TEMPLATE_VERSION, parseHistoricalCsv, parseHistoricalWorkbook } from "@/lib/phase2/historical-import";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";
import { z } from "zod";

export async function POST(request: Request) {
  const auth = await authorizeCapability("historical_program.import");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  let form: FormData;
  try { form = await readLimitedFormData(request, HISTORICAL_MAX_UPLOAD_BYTES + 1_000_000); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestBodyTooLargeError ? "Upload exceeds 10 MB" : "Multipart upload required" }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400 }); }
  const workbook = form.get("workbook"); const programsCsv = form.get("programs_csv"); const sdgsCsv = form.get("sdgs_csv"); const needsCsv = form.get("needs_csv");
  const replacementValue = String(form.get("replaces_batch_id") ?? "").trim();
  const replacement = replacementValue ? z.string().uuid().safeParse(replacementValue) : null;
  if (replacement && !replacement.success) return NextResponse.json({ error: "Replacement batch ID is invalid" }, { status: 400 });
  try {
    let parsed;
    if (workbook instanceof File) {
      if (workbook.size > HISTORICAL_MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Workbook exceeds 10 MB" }, { status: 413 });
      parsed = parseHistoricalWorkbook(new Uint8Array(await workbook.arrayBuffer()));
    } else if (programsCsv instanceof File) {
      const combinedSize = programsCsv.size + (sdgsCsv instanceof File ? sdgsCsv.size : 0) + (needsCsv instanceof File ? needsCsv.size : 0);
      if (combinedSize > HISTORICAL_MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Combined CSV files exceed 10 MB" }, { status: 413 });
      parsed = parseHistoricalCsv(new Uint8Array(await programsCsv.arrayBuffer()), sdgsCsv instanceof File ? new Uint8Array(await sdgsCsv.arrayBuffer()) : undefined,
        needsCsv instanceof File ? new Uint8Array(await needsCsv.arrayBuffer()) : undefined);
    } else return NextResponse.json({ error: "Provide one XLSX workbook or a Programs CSV with optional SDGs CSV" }, { status: 400 });
    const rows = parsed.rows.map((row) => ({ row_key: row.rowKey, data: row.data, errors: row.errors }));
    const { data, error } = await auth.supabase.rpc("phase2_stage_historical_import", { p_file_hash: parsed.fileHash,
      p_template_version: HISTORICAL_TEMPLATE_VERSION, p_rows: rows, p_replaces_batch_id: replacement?.data ?? null });
    if (error) return phase2RpcError(error);
    return NextResponse.json({ data: { ...(data as Record<string, unknown>), rows: parsed.rows, totalRows: parsed.totalRows, fileHash: parsed.fileHash } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse workbook" }, { status: 400 }); }
}
