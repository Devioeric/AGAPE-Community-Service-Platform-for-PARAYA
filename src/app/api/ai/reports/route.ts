import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";

export async function GET() {
  const auth = await authorizeCapability("report.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.from("ai_reports").select("id,title,period_start,period_end,narrative,status,generated_by,approved_at,created_at,updated_at,users:generated_by(full_name)").order("created_at", { ascending: false });
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data });
}
