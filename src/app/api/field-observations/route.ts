import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

const observationSchema = z.object({
  barangay_id: z.string().uuid().nullable().optional(), sitio: z.string().trim().max(120).nullable().optional(),
  observation_date: z.string().date().optional(), observation: z.string().trim().min(10).max(4_000),
  category: z.enum(["environmental", "health", "economic", "social", "infrastructure", "education", "safety", "other"]).nullable().optional(),
  follow_up_action: z.string().trim().max(1_000).nullable().optional(),
}).strict();

const SELECT = "id,observer_id,barangay_id,sitio,observation_date,observation,category,follow_up_action,promoted_to_need_id,created_at,updated_at,barangays(name)";

export async function GET(request: Request) {
  const auth = await authorizeCapability("observation.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const params = new URL(request.url).searchParams;
  let query = createAdminClient().from("field_observations").select(SELECT).order("observation_date", { ascending: false });
  if (auth.actor.role.startsWith("barangay_")) {
    if (!auth.actor.barangayId) return NextResponse.json({ error: "No barangay is assigned" }, { status: 403 });
    query = query.eq("barangay_id", auth.actor.barangayId);
  } else if (params.get("barangay_id")) query = query.eq("barangay_id", params.get("barangay_id")!);
  if (params.get("sitio")) query = query.eq("sitio", params.get("sitio")!);
  if (params.get("category")) query = query.eq("category", params.get("category")!);
  if (params.get("promoted") === "yes") query = query.not("promoted_to_need_id", "is", null);
  if (params.get("promoted") === "no") query = query.is("promoted_to_need_id", null);
  const { data, error } = await query;
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("observation.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = observationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const { data, error } = await createAdminClient().from("field_observations").insert({ ...parsed.data, barangay_id: parsed.data.barangay_id ?? null, observation_date: parsed.data.observation_date ?? new Date().toISOString().slice(0, 10), observer_id: auth.actor.id }).select(SELECT).single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data }, { status: 201 });
}
