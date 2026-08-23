import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

export async function GET(request: Request) {
  const auth = await authorizeCapability("profiling.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const barangayId = new URL(request.url).searchParams.get("barangay_id");
  if (!barangayId) return NextResponse.json({ error: "barangay_id is required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_list_official_population_snapshots", { p_barangay_id: barangayId });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = z.object({ barangay_id: z.string().uuid(), as_of_date: z.string().date(), source_name: z.string().trim().min(2).max(200), total_population: z.number().int().nonnegative(), total_households: z.number().int().nonnegative(), notes: z.string().trim().max(500).optional().nullable() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid official snapshot" }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase1_create_official_population_snapshot", { p_barangay_id: value.barangay_id, p_as_of_date: value.as_of_date, p_source_name: value.source_name, p_total_population: value.total_population, p_total_households: value.total_households, p_notes: value.notes ?? null });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
