import { NextResponse } from "next/server";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { surveyMutationSchema } from "@/lib/domain/phase1-contracts";

export async function GET() {
  const auth = await authorizeAnyCapability(["survey.read","survey.respond","survey.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let query = auth.supabase.from("surveys").select("*, survey_questions(id)").order("created_at", { ascending: false });
  if (!auth.actor.role.startsWith("paraya_")) query = query.eq("status", "published");
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("survey.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = surveyMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") }, { status: 400 });
  if (parsed.data.status !== "draft") return NextResponse.json({ error: "Create the survey as a draft, then use the publish action" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_save_survey", { p_survey_id: null, p_payload: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
