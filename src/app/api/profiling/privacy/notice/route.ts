import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

export async function GET() {
  const auth = await authorizeAnyCapability(["profiling.collect", "profiling.validate", "profiling.cycle.manage", "profiling.privacy.configure"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase1_list_active_privacy_notices");
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("profiling.privacy.configure");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = z.object({ version: z.string().trim().min(1).max(40), notice_text: z.string().trim().min(20).max(20000), controller_name: z.string().trim().min(2).max(200), privacy_contact: z.string().trim().min(2).max(200), retention_summary: z.string().trim().min(2).max(1000), effective_from: z.string().date() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid privacy notice" }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase1_create_privacy_notice", { p_version: value.version, p_notice_text: value.notice_text, p_controller_name: value.controller_name, p_privacy_contact: value.privacy_contact, p_retention_summary: value.retention_summary, p_effective_from: value.effective_from });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
