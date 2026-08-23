import { NextResponse } from "next/server";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { surveyMutationSchema } from "@/lib/domain/phase1-contracts";

type Ctx = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await authorizeAnyCapability(["survey.read","survey.respond","survey.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  let query = auth.supabase.from("surveys").select("*, survey_questions(*)").eq("id", id).order("order_index", { referencedTable: "survey_questions", ascending: true });
  if (!auth.actor.role.startsWith("paraya_")) query = query.eq("status", "published");
  const { data, error } = await query.single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("survey.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = surveyMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  if (parsed.data.status !== "draft") return NextResponse.json({ error: "Survey content updates must remain draft; use the status action" }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc("phase1_save_survey", { p_survey_id: id, p_payload: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json({ data: { id: data } });
}

export async function DELETE() {
  return NextResponse.json({ error: "Survey deletion is disabled. Drafts may be closed; published response history is retained." }, { status: 405, headers: { Allow: "GET, PATCH" } });
}
