import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

const createCycleSchema = z.object({
  barangay_id: z.string().uuid(), name: z.string().trim().min(2).max(160),
  sample_method: z.string().trim().min(2).max(160), target_households: z.number().int().positive(),
  collection_starts_on: z.string().date(), collection_ends_on: z.string().date(), privacy_notice_id: z.string().uuid(),
}).strict();

export async function GET(request: Request) {
  const auth = await authorizeAnyCapability(["profiling.aggregate.read", "profiling.collect", "profiling.validate", "profiling.cycle.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const barangayId = new URL(request.url).searchParams.get("barangay_id");
  const { data, error } = await auth.supabase.rpc("phase1_list_profiling_cycles", { p_barangay_id: barangayId });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = createCycleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase1_create_profiling_cycle", {
    p_barangay_id: value.barangay_id, p_name: value.name, p_sample_method: value.sample_method,
    p_target_households: value.target_households, p_collection_starts_on: value.collection_starts_on,
    p_collection_ends_on: value.collection_ends_on, p_privacy_notice_id: value.privacy_notice_id,
  });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
