import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: history, error }, { data: account }] = await Promise.all([
    admin.from("role_history").select("id, previous_role, new_role, effective_start, effective_end, change_reason, cutover_batch_id, actor_id, source_status, target_status, created_at").eq("user_id", id).order("effective_start", { ascending: false }),
    admin.from("users").select("id, full_name, email, role, status, is_active").eq("id", id).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: "Account history is temporarily unavailable", code: "history_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  if (!account) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ account, history: history ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
