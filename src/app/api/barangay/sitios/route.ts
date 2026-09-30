import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

const headers = { "Cache-Control": "private, no-store" };

/**
 * Active sitio names registered for the Secretary's own barangay, used as
 * suggestions in the community-need form. The need's sitio stays free text.
 */
export async function GET() {
  const auth = await authorizeCapability("community_need.submit");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  if (auth.actor.role !== "barangay_secretary" || !auth.actor.barangayId) {
    return NextResponse.json({ error: "A barangay assignment is required" }, { status: 403, headers });
  }
  const { data, error } = await createAdminClient()
    .from("barangay_sitios")
    .select("id, name")
    .eq("barangay_id", auth.actor.barangayId)
    .eq("is_active", true)
    .order("name");
  if (error) return NextResponse.json({ error: "Sitios are temporarily unavailable" }, { status: 503, headers });
  return NextResponse.json({ data: data ?? [] }, { headers });
}
