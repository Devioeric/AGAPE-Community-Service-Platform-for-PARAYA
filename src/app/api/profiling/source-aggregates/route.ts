import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { profilingDisabledResponse, profilingRpcError } from "@/lib/profiling/api";

const querySchema = z.object({
  cycle_id: z.string().uuid().optional(),
  dataset_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((value) => Boolean(value.cycle_id || value.dataset_id), {
  message: "cycle_id or dataset_id is required",
});

const headers = { "Cache-Control": "private, no-store" };

function emptyResponse(warning?: string) {
  return {
    dataset: null,
    rows: [],
    pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    availability: "empty" as const,
    warnings: warning ? [warning] : [],
  };
}

export async function GET(request: Request) {
  if (!isProfilingV2Enabled()) return profilingDisabledResponse();
  const auth = await authorizeAnyCapability(["profiling.aggregate.read", "profiling.detail.read", "profiling.validate"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid source aggregate filters" }, { status: 400, headers });

  try {
    let dataset: Record<string, unknown> | null = null;
    let payload: Record<string, unknown> | null = null;
    if (parsed.data.cycle_id) {
      const result = await auth.supabase.rpc("phase1_list_profiling_source_aggregate_datasets", { p_cycle_id: parsed.data.cycle_id });
      if (result.error) return profilingRpcError(result.error);
      const datasets = Array.isArray(result.data) ? result.data : [];
      dataset = (datasets.find((item) => item && typeof item === "object" && (item as { status?: unknown }).status === "imported") ?? datasets[0] ?? null) as Record<string, unknown> | null;
    }
    const datasetId = parsed.data.dataset_id ?? (typeof dataset?.id === "string" ? dataset.id : null);
    if (!datasetId) return NextResponse.json({ data: emptyResponse() }, { headers });

    const rowsResult = await auth.supabase.rpc("phase1_list_profiling_source_aggregate_rows", {
      p_dataset_id: datasetId,
      p_page: parsed.data.page,
      p_page_size: parsed.data.page_size,
    });
    if (rowsResult.error) return profilingRpcError(rowsResult.error);
    payload = rowsResult.data && typeof rowsResult.data === "object" ? rowsResult.data as Record<string, unknown> : null;
    if (!payload) return NextResponse.json({ data: emptyResponse("Source aggregate data is temporarily unavailable.") }, { headers });

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const pagination = payload.pagination && typeof payload.pagination === "object" ? payload.pagination : { page: parsed.data.page, pageSize: parsed.data.page_size, total: rows.length, totalPages: rows.length ? 1 : 0 };
    const data = {
      dataset: {
        id: String(payload.datasetId ?? dataset?.id ?? datasetId),
        cycleId: String(payload.cycleId ?? dataset?.cycleId ?? parsed.data.cycle_id ?? "00000000-0000-0000-0000-000000000000"),
        barangayId: String(payload.barangayId ?? dataset?.barangayId ?? "00000000-0000-0000-0000-000000000000"),
        sitioId: String(payload.sitioId ?? dataset?.sitioId ?? "00000000-0000-0000-0000-000000000000"),
        aggregateSchemaVersion: String(dataset?.aggregateSchemaVersion ?? "agape.profiling.source.aggregate.v1"),
        sourceTitle: String(payload.sourceTitle ?? dataset?.sourceTitle ?? "Profiling source aggregate"),
        sourceLocation: String(payload.sourceLocation ?? dataset?.sourceLocation ?? "Local synthetic source"),
        sourceFiles: Array.isArray(payload.sourceFiles) ? payload.sourceFiles.map(String) : (Array.isArray(dataset?.sourceFiles) ? (dataset?.sourceFiles as unknown[]).map(String) : []),
        sourceHashes: (payload.sourceHashes ?? dataset?.sourceHashes ?? {}) as Record<string, string>,
        sourceBundleHash: String(dataset?.sourceBundleHash ?? ""),
        sourceRowCount: Number(dataset?.sourceRowCount ?? (pagination as { total?: unknown }).total ?? rows.length),
        status: String(payload.status ?? dataset?.status ?? "imported"),
        qualityFlags: Array.isArray(payload.qualityFlags) ? payload.qualityFlags.map(String) : (Array.isArray(dataset?.qualityFlags) ? (dataset?.qualityFlags as unknown[]).map(String) : []),
        provenance: (payload.provenance ?? dataset?.provenance ?? {}) as Record<string, unknown>,
        importedAt: typeof dataset?.importedAt === "string" ? dataset.importedAt : null,
      },
      rows,
      pagination,
      availability: rows.length || Number((pagination as { total?: unknown }).total ?? 0) ? "available" : "empty",
      warnings: [],
    };
    return NextResponse.json({ data }, { headers });
  } catch {
    return NextResponse.json({ error: "Source aggregate data is temporarily unavailable. Please retry." }, { status: 503, headers });
  }
}
