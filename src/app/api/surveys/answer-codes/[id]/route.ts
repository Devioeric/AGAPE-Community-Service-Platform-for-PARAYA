import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

// The HTTP method is retained for client compatibility, but the record is
// voided with append-only correction history rather than deleted.
export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("survey.analyze");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A correction reason is required" }, { status: 400 });
  const { id } = await params;
  const { error } = await auth.supabase.rpc("phase1_void_survey_answer_code", { p_code_id: id, p_reason: parsed.data.reason });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "P0002" ? 404 : 422 });
  return NextResponse.json({ success: true, voided: true });
}
