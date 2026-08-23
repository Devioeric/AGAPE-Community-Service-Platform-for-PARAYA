import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).optional(),
  sections: z.array(z.unknown()).max(100),
  questions: z.array(z.unknown()).max(500),
}).strict();

export async function GET() {
  const auth = await authorizeCapability("survey.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const adminDb = createAdminClient();
  const { data, error } = await adminDb
    .from("survey_templates")
    .select("id, name, description, sections, questions, created_by, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("survey.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = templateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid survey template" }, { status: 400 });
  const { name, description, sections, questions } = parsed.data;

  const adminDb = createAdminClient();

  // If this officer already has a template with the same name, replace it
  await adminDb
    .from("survey_templates")
    .delete()
    .eq("name", name.trim())
    .eq("created_by", auth.actor.id);

  const { data, error } = await adminDb
    .from("survey_templates")
    .insert({
      name:        name.trim(),
      description: description?.trim() ?? null,
      sections:    sections ?? [],
      questions:   questions ?? [],
      created_by:  auth.actor.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
