import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { templateArchiveSchema } from "@/lib/surveys/template-contract";
import { retainedWriteFailure } from "@/lib/reports/lifecycle-contract";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("survey.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const parsed = templateArchiveSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid template archive request" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_archive_survey_template", {
    p_template_id: id, p_expected_version: parsed.data.expected_version, p_reason: parsed.data.reason,
  });
  if (error) { const failure = retainedWriteFailure(error.code); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await params;
  return NextResponse.json(
    { error: "Survey template deletion is retired. Archive or supersede the template instead." },
    { status: 405, headers: { Allow: "PATCH" } },
  );
}
