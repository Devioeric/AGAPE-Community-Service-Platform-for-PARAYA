import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { profilingRpcError } from "@/lib/profiling/api";

export async function GET(request: Request) {
  const auth = await authorizeAnyCapability(["profiling.collect","profiling.validate","profiling.endorse","profiling.cycle.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const barangayId = new URL(request.url).searchParams.get("barangay_id");
  if (!barangayId) return NextResponse.json({ error: "barangay_id is required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_list_profiling_sitios", { p_barangay_id: barangayId });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("profiling.cycle.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = z.object({ barangay_id: z.string().uuid(), name: z.string().trim().min(1).max(120), aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sitio" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase1_create_sitio", { p_barangay_id: parsed.data.barangay_id, p_name: parsed.data.name, p_aliases: parsed.data.aliases });
  if (error) return profilingRpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
