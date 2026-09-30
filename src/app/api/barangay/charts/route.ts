import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  barangayChartRangeSchema, barangayChartSchema, barangayChartViewSchema, barangayChartViews, barangayChartWindow,
  barangayHourPoints, countBuckets, BARANGAY_CHART_VIEWS,
} from "@/lib/dashboard/barangay-charts";

const headers = { "Cache-Control": "private, no-store" };
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const ROW_LIMIT = 5000;

/**
 * Barangay Secretary dashboard charts. Counts only: no titles, names, or
 * resident fields leave the server, and every query is limited to the
 * Secretary's assigned barangay here rather than by a request parameter.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const view = barangayChartViewSchema.safeParse(params.get("view"));
  const range = barangayChartRangeSchema.safeParse(params.get("range") ?? (params.get("view") === "hours" ? "recent" : "all"));
  if (!view.success || !range.success || Array.from(params.keys()).some((key) => !["view", "range"].includes(key))
    || params.getAll("view").length !== 1 || params.getAll("range").length > 1) {
    return respond({ error: "Invalid chart view or date range" }, 400);
  }
  const auth = await authorizeAnyCapability(BARANGAY_CHART_VIEWS[view.data].any);
  if (!auth.ok) return respond({ error: auth.error }, auth.status);
  if (!barangayChartViews(auth.actor).includes(view.data)) return respond({ error: "Chart unavailable for this account" }, 403);
  const barangayId = auth.actor.barangayId;
  if (!barangayId) return respond({ error: "A barangay assignment is required" }, 403);

  const now = new Date();
  const window = barangayChartWindow(range.data, now);
  const admin = createAdminClient();
  try {
    let points: Array<{ label: string; value: number }>;
    if (view.data === "hours") {
      const programs = await admin.from("programs").select("id").eq("barangay_id", barangayId).limit(ROW_LIMIT);
      if (programs.error) throw programs.error;
      const ids = (programs.data ?? []).map((row) => row.id);
      let rows: Array<{ date: string; hours: number }> = [];
      if (ids.length) {
        const logs = await admin.from("activity_logs").select("date, hours").in("program_id", ids).eq("status", "approved").limit(ROW_LIMIT);
        if (logs.error) throw logs.error;
        rows = (logs.data ?? []).map((row) => ({ date: String(row.date), hours: Number(row.hours) }));
      }
      points = barangayHourPoints(rows, range.data, now);
    } else {
      const table = view.data === "programs" ? "programs" : "community_needs";
      const column = view.data === "programs" ? "status" : view.data === "needs" ? "approval_status" : "category";
      let query = admin.from(table).select(column).eq("barangay_id", barangayId);
      if (view.data === "categories") query = query.eq("approval_status", "approved");
      if (window.start) query = query.gte("created_at", window.start);
      if (window.end) query = query.lt("created_at", window.end);
      const result = await query.limit(ROW_LIMIT);
      if (result.error) throw result.error;
      const values = ((result.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => (typeof row[column] === "string" ? row[column] as string : null));
      points = countBuckets(view.data, values);
    }
    return respond({ data: barangayChartSchema.parse({ view: view.data, range: range.data, asOf: now.toISOString(), points }) });
  } catch {
    return respond({ error: "Chart data could not be loaded" }, 503);
  }
}
