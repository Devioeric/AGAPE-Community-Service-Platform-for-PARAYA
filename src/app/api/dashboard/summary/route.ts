import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dashboardSummarySchema } from "@/lib/dashboard/contracts";
import { isActiveAccount } from "@/lib/auth/account-status";
import { ACTIVE_LOGIN_ROLES } from "@/lib/auth/roles";
import { hasCapability } from "@/lib/auth/capabilities";
import { attachDashboardTrends, previousDashboardMonth, supportsDashboardTrends } from "@/lib/dashboard/kpi-trend";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return response({ error: "Unauthorized" }, 401);

  const { data: profile } = await supabase
    .from("users")
    .select("role,status,is_active,permissions")
    .eq("id", user.id)
    .maybeSingle();

  const approvedRoles = ACTIVE_LOGIN_ROLES as readonly string[];
  if (!profile || !isActiveAccount(profile) || !approvedRoles.includes(profile.role)) {
    return response({ error: "Dashboard unavailable for this account" }, 403);
  }

  const { data, error } = await supabase.rpc("phase7_get_dashboard_summary");
  if (error) {
    return response(
      { error: error.code === "42501" ? "Dashboard unavailable for this account" : "Unable to load dashboard" },
      error.code === "42501" ? 403 : 500,
    );
  }

  const parsed = dashboardSummarySchema.safeParse(data);
  if (!parsed.success || parsed.data.role !== profile.role) {
    return response({ error: "Invalid dashboard response" }, 500);
  }

  // A history outage must not remove valid current totals. History never adds
  // cards removed by the canonical capability-aware RPC or widens data scope.
  if (!supportsDashboardTrends(parsed.data)) return response({ data: parsed.data });
  if (!hasCapability(profile.role, profile.permissions, "analytics.aggregate.read")) {
    return response({ data: attachDashboardTrends(parsed.data, [], true) });
  }
  try {
    const month = previousDashboardMonth(parsed.data.asOf);
    const history = await supabase.from("analytics_snapshots")
      .select("data")
      .eq("period_type", "monthly")
      .gte("data->dashboardKpis->>capturedAt", month.start)
      .lt("data->dashboardKpis->>capturedAt", month.end)
      .order("data->dashboardKpis->>capturedAt", { ascending: false })
      .limit(120);
    return response({ data: attachDashboardTrends(parsed.data, history.data ?? [], Boolean(history.error)) });
  } catch {
    return response({ data: attachDashboardTrends(parsed.data, [], true) });
  }
}
