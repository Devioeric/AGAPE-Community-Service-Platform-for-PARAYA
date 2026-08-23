import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";

type Ctx = { params: Promise<{ id: string }> };
const transitionSchema = z.object({ expected_status: z.enum(["draft", "reviewed"]), status: z.enum(["reviewed", "approved"]) }).strict();

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("report.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = transitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !((parsed.data.expected_status === "draft" && parsed.data.status === "reviewed") || (parsed.data.expected_status === "reviewed" && parsed.data.status === "approved"))) {
    return NextResponse.json({ error: "Invalid report transition" }, { status: 400 });
  }
  const { id } = await params;
  const now = new Date().toISOString();
  const { data, error } = await auth.supabase.from("ai_reports").update({ status: parsed.data.status, updated_at: now, approved_at: parsed.data.status === "approved" ? now : null }).eq("id", id).eq("status", parsed.data.expected_status).select("id,status,updated_at,approved_at").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Report status changed; refresh and retry" }, { status: 409 });
  return NextResponse.json({ data });
}

export async function DELETE() {
  return NextResponse.json({ error: "Reports are retained for audit; use lifecycle status instead" }, { status: 405, headers: { Allow: "GET, PATCH" } });
}
