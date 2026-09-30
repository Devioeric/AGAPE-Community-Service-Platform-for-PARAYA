import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContributorCatalog } from "@/lib/contributor/contracts";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Returns only the active partner entities linked to the authenticated
 * Contributor.  The catalog RPC remains the authoritative source for
 * proposal categories, approved needs, barangays, and runtime mode.
 */
export async function GET() {
  const auth = await authorizeAnyCapability(["contributor.partner.read", "contributor.proposal.create"]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (auth.actor.role !== "contributor") return json({ error: "Contributor access is required" }, 403);

  const admin = createAdminClient();
  const [{ data: actorProfile }, links] = await Promise.all([
    admin.from("users").select("full_name").eq("id", auth.actor.id).maybeSingle(),
    admin
      .from("contributor_partner_links")
    .select("partner_id,status")
    .eq("contributor_user_id", auth.actor.id)
      .eq("status", "active"),
  ]);
  if (links.error) return json({ error: "Contributor assignments are temporarily unavailable" }, 503);

  const partnerIds = (links.data ?? []).map((row) => row.partner_id).filter((id): id is string => typeof id === "string");
  let entities: Array<Record<string, unknown>> = [];
  if (partnerIds.length > 0) {
    const result = await admin
      .from("partner_entities")
      .select("id,name,entity_type,classification,lifecycle")
      .in("id", partnerIds)
      .eq("classification", "internal")
      .eq("lifecycle", "active");
    if (result.error) return json({ error: "Contributor assignments are temporarily unavailable" }, 503);
    entities = result.data ?? [];
  }

  const catalogResult = await auth.supabase.rpc("phase2_get_proposal_catalog");
  if (catalogResult.error || !catalogResult.data || typeof catalogResult.data !== "object") {
    return json({ error: "Contributor proposal services are not enabled in this environment" }, 503);
  }
  const catalog = catalogResult.data as ContributorCatalog & { dataMode?: string };
  const catalogEntities = new Map((catalog.partners ?? []).map((row) => [row.id, row]));
  const allowedEntities = entities
    .map((entity) => {
      const id = String(entity.id);
      const catalogEntity = catalogEntities.get(id);
      if (!catalogEntity) return null;
      return {
        id,
        name: String(entity.name ?? catalogEntity?.name ?? "Assigned entity"),
        type: entity.entity_type,
        assigned: true,
      };
    })
    .filter((entity): entity is { id: string; name: string; type: unknown; assigned: boolean } => Boolean(entity))
    .filter((entity) => ["dyci_office", "student_organization", "academic_department"].includes(String(entity.type)));

  const runtime = await admin
    .from("phase2_component_runtime")
    .select("mode")
    .eq("component", "proposals")
    .maybeSingle();
  const dataMode = runtime.data?.mode === "live" ? "live" : "synthetic";

  return json({
    data: {
      contributor: { id: auth.actor.id, name: actorProfile?.full_name ?? null, email: auth.actor.email },
      entities: allowedEntities,
      barangays: catalog.barangays ?? [],
      approvedNeeds: catalog.approvedNeeds ?? [],
      categories: catalog.projectCategories ?? [],
      beneficiaryCategories: catalog.beneficiaryCategories ?? [],
      budgetCategories: catalog.budgetCategories ?? [],
      sdgs: catalog.sdgs ?? [],
      dataMode,
    },
  });
}

