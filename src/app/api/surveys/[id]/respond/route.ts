import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { surveyResponseSchema } from "@/lib/domain/phase1-contracts";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("survey.respond");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = surveyResponseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_submit_survey_response", { p_survey_id: id, p_answers: parsed.data.answers });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : error.code === "23505" ? 409 : 422 });
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
