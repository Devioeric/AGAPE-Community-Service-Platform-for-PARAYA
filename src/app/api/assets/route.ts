import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ barangay_id: z.string().uuid(), asset_name: z.string().trim().min(1).max(120), asset_type: z.enum(["facility", "equipment", "natural", "infrastructure", "other"]), quantity: z.number().int().nonnegative().max(1_000_000).default(1), condition: z.enum(["excellent", "good", "fair", "poor"]).nullable().optional(), notes: z.string().trim().max(500).nullable().optional() }).strict();
const SELECT = "id,barangay_id,asset_name,asset_type,quantity,condition,notes,created_by,created_at,updated_at,barangays(name)";

export async function GET(request: Request) {
  const auth = await authorizeCapability("skill_asset.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let query = createAdminClient().from("barangay_assets").select(SELECT).order("asset_type").order("asset_name");
  if (auth.actor.role.startsWith("barangay_")) {
    if (!auth.actor.barangayId) return NextResponse.json({ error: "No barangay is assigned" }, { status: 403 });
    query = query.eq("barangay_id", auth.actor.barangayId);
  } else {
    const barangayId = new URL(request.url).searchParams.get("barangay_id");
    if (barangayId) query = query.eq("barangay_id", barangayId);
  }
  const { data, error } = await query;
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("skill_asset.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  if (auth.actor.role.startsWith("barangay_") && auth.actor.barangayId !== parsed.data.barangay_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await createAdminClient().from("barangay_assets").insert({ ...parsed.data, created_by: auth.actor.id }).select(SELECT).single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data }, { status: 201 });
}
