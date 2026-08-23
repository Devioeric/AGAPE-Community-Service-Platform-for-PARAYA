import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await authorizeCapability("profiling.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requestedBarangay = new URL(request.url).searchParams.get("barangay_id");
  const barangayId = auth.actor.role.startsWith("barangay_") ? auth.actor.barangayId : requestedBarangay;
  if (auth.actor.role.startsWith("barangay_") && !barangayId) return NextResponse.json({ error: "No barangay is assigned" }, { status: 403 });
  let query = createAdminClient()
    .from("profiling_evidence_snapshots")
    .select("id, generated_at, content_hash, aggregate_schema_version, profiling_cycles!inner(id, name, barangay_id, status, barangays(name))")
    .eq("aggregate_schema_version", "agape.profiling.aggregate.v2")
    .in("profiling_cycles.status", ["completed", "archived"])
    .order("generated_at", { ascending: false });
  if (barangayId) query = query.eq("profiling_cycles.barangay_id", barangayId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
