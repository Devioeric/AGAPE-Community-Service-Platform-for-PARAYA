import { authorizeCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";
import { templateSaveSchema } from "@/lib/surveys/template-contract";
import { retainedWriteFailure } from "@/lib/reports/lifecycle-contract";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const auth = await authorizeCapability("survey.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });

  try {
  const { data, error } = await auth.supabase.rpc("phase2_list_survey_templates", {
    p_include_archived: new URL(request.url).searchParams.get("include_archived") === "true",
  });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "Survey template access is not permitted." : "Survey templates could not be loaded." }, { status: error.code === "42501" ? 403 : 503, headers });
  if (!Array.isArray(data)) return NextResponse.json({ error: "Survey templates could not be loaded." }, { status: 503, headers });
  return NextResponse.json({ data }, { headers });
  } catch {
    return NextResponse.json({ error: "Survey templates could not be loaded." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("survey.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = templateSaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid survey template" }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_save_survey_template", {
    p_name: value.name, p_description: value.description ?? null, p_sections: value.sections, p_questions: value.questions,
    p_expected_template_id: value.expected_template_id, p_expected_version: value.expected_version, p_reason: value.reason ?? null,
  });
  if (error) { const failure = retainedWriteFailure(error.code); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
  return NextResponse.json({ data }, { status: 201 });
}
