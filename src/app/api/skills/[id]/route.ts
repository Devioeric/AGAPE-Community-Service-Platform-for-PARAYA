import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ skill_name: z.string().trim().min(1).max(120).optional(), category: z.enum(["trade", "education", "health", "agriculture", "technology", "other"]).optional(), practitioner_count: z.number().int().nonnegative().max(1_000_000).optional(), proficiency_level: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(), notes: z.string().trim().max(500).nullable().optional() }).strict().refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("skill_asset.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid skill update" }, { status: 400 });
  const { id } = await params; const admin = createAdminClient();
  const { data: current } = await admin.from("barangay_skills").select("barangay_id").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  if (auth.actor.role.startsWith("barangay_") && auth.actor.barangayId !== current.barangay_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await admin.from("barangay_skills").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", id).select("id,updated_at").single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data });
}

export async function DELETE() { return NextResponse.json({ error: "Skill records are retained; record a correction instead" }, { status: 405, headers: { Allow: "PATCH" } }); }
