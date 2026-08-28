import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";

type Ctx = { params: Promise<{ id: string }> };
const transitionSchema = z.object({
  expected_version: z.number().int().positive(),
  action: z.enum(["review", "return", "approve", "archive"]),
  reason: z.string().trim().min(5).max(2000).optional(),
}).strict().superRefine((value, ctx) => {
  if (["return", "archive"].includes(value.action) && !value.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required" });
});

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("report.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = transitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid report transition" }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase6_transition_report", {
    p_report_id: id,
    p_expected_version: parsed.data.expected_version,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "40001" ? 409 : error.code === "42501" ? 403 : 422 });
  return NextResponse.json({ data });
}

export async function DELETE() {
  return NextResponse.json({ error: "Reports are retained for audit; use the archive lifecycle action" }, { status: 405, headers: { Allow: "GET, PATCH" } });
}
