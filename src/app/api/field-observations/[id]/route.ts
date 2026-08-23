import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };
const patchSchema = z.object({
  barangay_id: z.string().uuid().nullable().optional(), sitio: z.string().trim().max(120).nullable().optional(),
  observation_date: z.string().date().optional(), observation: z.string().trim().min(10).max(4_000).optional(),
  category: z.enum(["environmental", "health", "economic", "social", "infrastructure", "education", "safety", "other"]).nullable().optional(),
  follow_up_action: z.string().trim().max(1_000).nullable().optional(), promoted_to_need_id: z.string().uuid().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("observation.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const { id } = await params;
  const { data, error } = await createAdminClient().from("field_observations").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", id).select("id,updated_at").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return data ? NextResponse.json({ data }) : NextResponse.json({ error: "Observation not found" }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Field observations are retained; record a correction instead" }, { status: 405, headers: { Allow: "PATCH" } });
}
