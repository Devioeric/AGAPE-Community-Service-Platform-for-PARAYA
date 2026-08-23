import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ excluded: z.boolean(), reason: z.string().trim().min(3).max(500) }).strict();

// Both exclusion and reinstatement require a reason. The trusted RPC appends a
// correction event before changing the current analytical state.
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("survey.analyze");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A correction reason is required" }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_set_survey_response_exclusion", { p_response_id: id, p_excluded: parsed.data.excluded, p_reason: parsed.data.reason });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "40001" ? 409 : 422 });
  return NextResponse.json({ data });
}
