import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dashboardSummarySchema } from "@/lib/dashboard/contracts";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.rpc("phase7_get_dashboard_summary");
  if (error) return NextResponse.json({ error: error.code === "42501" ? "Dashboard unavailable for this account" : "Unable to load dashboard" }, { status: error.code === "42501" ? 403 : 500 });
  const parsed = dashboardSummarySchema.safeParse(data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid dashboard response" }, { status: 500 });
  return NextResponse.json({ data: parsed.data });
}
