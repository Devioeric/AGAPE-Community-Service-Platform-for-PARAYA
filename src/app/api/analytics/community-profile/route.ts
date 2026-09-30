import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { isProfilingV2Enabled } from "@/lib/profiling/feature";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileIndicators, profileTables, titleCase, type ProfileSourceRow } from "@/lib/analytics/insights";

const headers = { "Cache-Control": "private, no-store" };
const PAGE_SIZE = 500;
const MAX_PAGES = 10;

type Cycle = { id: string; barangay_id: string; status: string; created_at?: string | null; completed_at?: string | null; approved_households?: number | null; target_households?: number | null };
type Dataset = { id: string; status?: string; sourceTitle?: string; sourceLocation?: string; importedAt?: string | null; sourceFiles?: unknown };

/**
 * Imported community-profiling source tables for the Community Needs analytics
 * tab. Reads go through the profiling RPCs, so their runtime and barangay-scope
 * checks apply; only quantitative rows are returned (never narratives or
 * representative notes, which can name residents).
 */
export async function GET() {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "profiling.aggregate.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  if (!isProfilingV2Enabled()) return NextResponse.json({ data: { status: "disabled", profiles: [] } }, { headers });

  try {
    const cyclesResult = await auth.supabase.rpc("phase1_list_profiling_cycles", { p_barangay_id: null });
    if (cyclesResult.error) throw cyclesResult.error;
    const cycles = (Array.isArray(cyclesResult.data) ? cyclesResult.data : []) as Cycle[];

    // Per barangay, the newest completed or archived cycle that has imported source tables.
    const stamp = (cycle: Cycle) => cycle.completed_at ?? cycle.created_at ?? "";
    const byBarangay = new Map<string, Cycle[]>();
    for (const cycle of cycles) {
      if (cycle.status !== "completed" && cycle.status !== "archived") continue;
      byBarangay.set(cycle.barangay_id, [...(byBarangay.get(cycle.barangay_id) ?? []), cycle]);
    }

    const barangayIds = Array.from(byBarangay.keys());
    const names = new Map<string, string>();
    if (barangayIds.length) {
      // barangays has no user-facing read policy; label only barangays the profiling RPC already authorized.
      const { data: barangayRows } = await createAdminClient().from("barangays").select("id, name").in("id", barangayIds);
      for (const row of barangayRows ?? []) names.set(String(row.id), String(row.name));
    }

    const profiles = [];
    for (const [barangayId, list] of Array.from(byBarangay.entries())) {
      for (const cycle of list.sort((a, b) => stamp(b).localeCompare(stamp(a)))) {
        const datasetsResult = await auth.supabase.rpc("phase1_list_profiling_source_aggregate_datasets", { p_cycle_id: cycle.id });
        if (datasetsResult.error) throw datasetsResult.error;
        const datasets = (Array.isArray(datasetsResult.data) ? datasetsResult.data : []) as Dataset[];
        const dataset = datasets.find((item) => item.status === "imported");
        if (!dataset) continue;

        // Rows arrive quantitative first, then totals, then narrative rows; stop once past the numbers.
        const rows: ProfileSourceRow[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
          const rowsResult = await auth.supabase.rpc("phase1_list_profiling_source_aggregate_rows", { p_dataset_id: dataset.id, p_page: page, p_page_size: PAGE_SIZE });
          if (rowsResult.error) throw rowsResult.error;
          const payload = (rowsResult.data ?? {}) as { rows?: ProfileSourceRow[]; pagination?: { totalPages?: number } };
          const pageRows = Array.isArray(payload.rows) ? payload.rows : [];
          rows.push(...pageRows);
          const last = pageRows[pageRows.length - 1];
          if (!last || (last.recordType !== "quantitative_data" && last.recordType !== "total") || page >= Number(payload.pagination?.totalPages ?? 0)) break;
        }

        const tables = profileTables(rows);
        const residents = tables.find((table) => table.topic.toLowerCase() === "sex/gender")?.base ?? null;
        profiles.push({
          datasetId: dataset.id,
          cycleId: cycle.id,
          barangayId,
          barangay: names.get(barangayId) ?? titleCase(dataset.sourceLocation, "Barangay"),
          sourceTitle: titleCase(dataset.sourceTitle, "Community profile"),
          sourceLocation: titleCase(dataset.sourceLocation, ""),
          sourceFiles: Array.isArray(dataset.sourceFiles) ? dataset.sourceFiles.map(String) : [],
          importedAt: dataset.importedAt ?? null,
          households: cycle.approved_households ?? cycle.target_households ?? null,
          residents,
          indicators: profileIndicators(tables),
          tables,
        });
        break;
      }
    }
    return NextResponse.json({ data: { status: profiles.length ? "available" : "empty", profiles } }, { headers });
  } catch (error) {
    const denied = typeof error === "object" && error !== null && "code" in error && error.code === "42501";
    return NextResponse.json({ error: denied ? "Community profile access is not permitted" : "Community profile data is temporarily unavailable" }, { status: denied ? 403 : 503, headers });
  }
}
