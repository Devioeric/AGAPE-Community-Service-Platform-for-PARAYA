import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { contributorPartnerIds } from "@/lib/contributor/server";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  const auth = await authorizeCapability("contributor.partner.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
  if (auth.actor.role !== "contributor") return NextResponse.json({ error: "Contributor access is required" }, { status: 403, headers: NO_STORE });
  const assignment = await contributorPartnerIds(auth.actor.id);
  if (assignment.error) return NextResponse.json({ error: assignment.error }, { status: 503, headers: NO_STORE });
  const allowedIds = new Set(assignment.ids);
  if (allowedIds.size === 0) return NextResponse.json({ data: [] }, { headers: NO_STORE });
  // The catalog RPC owns the same linked-entity, lifecycle, classification,
  // proponent-role, and data-mode checks used by proposal creation.  Reuse it
  // here instead of duplicating a broader service-role query.
  const catalog = await auth.supabase.rpc("phase2_get_proposal_catalog");
  if (catalog.error || !catalog.data || typeof catalog.data !== "object") {
    return NextResponse.json({ error: "Contributor assignments are temporarily unavailable" }, { status: 503, headers: NO_STORE });
  }
  const partners = Array.isArray((catalog.data as { partners?: unknown }).partners)
    ? (catalog.data as { partners: Array<Record<string, unknown>> }).partners
    : [];
  return NextResponse.json({
    data: partners.filter((row) => typeof row.id === "string" && allowedIds.has(row.id)).map((row) => ({
      id: String(row.id),
      code: typeof row.code === "string" ? row.code : null,
      name: String(row.name ?? "Assigned entity"),
      type: typeof row.type === "string" ? row.type : null,
    })),
  }, { headers: NO_STORE });
}

