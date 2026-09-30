import type { AuthorizationResult } from "@/lib/auth/authorize";
import { FOCUS_SDG_NUMBERS } from "@/lib/sdg-focus.js";
import { chartHourPoints, type chartPeriod } from "./chart-period";

type Client = Extract<AuthorizationResult, { ok: true }>["supabase"];

export async function filteredChartPoints(client: Client, view: "hours" | "sdg", period: ReturnType<typeof chartPeriod>) {
  if (view === "sdg") return Promise.all(FOCUS_SDG_NUMBERS.map(async number => {
    let query = client.from("proposal_sdg_alignment").select("id,project_proposals!inner(created_at)", { count: "exact", head: true }).eq("sdg_number", number);
    if (period.timestampStart) query = query.gte("project_proposals.created_at", period.timestampStart).lt("project_proposals.created_at", period.timestampEnd!);
    const result = await query;
    if (result.error) throw result.error;
    if (typeof result.count !== "number" || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error("Invalid aggregate");
    return { label: `SDG ${number}`, value: result.count };
  }));

  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    if (offset >= 50_000) throw new Error("Activity chart exceeds safe read limit");
    let query = client.from("activity_logs").select("date,hours").eq("status", "approved").order("id").range(offset, offset + 499);
    if (period.dateStart) query = query.gte("date", period.dateStart).lt("date", period.dateEnd!);
    const result = await query;
    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) throw new Error("Invalid activity data");
    rows.push(...result.data);
    if (result.data.length < 500) break;
  }
  return chartHourPoints(rows, period);
}
