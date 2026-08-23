import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await authorizeCapability("admin.audit.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url    = new URL(request.url);
  const level  = url.searchParams.get("level");        // "info" | "warning" | "error" | null
  const search = url.searchParams.get("search") ?? "";
  const limit  = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

  const admin = createAdminClient();
  let query = admin
    .from("audit_logs")
    .select("id, user_email, action, resource_type, resource_id, level, ip_address, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (level && ["info", "warning", "error"].includes(level)) {
    query = query.eq("level", level);
  }
  if (search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`user_email.ilike.${q},action.ilike.${q},resource_type.ilike.${q},resource_id.ilike.${q}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
