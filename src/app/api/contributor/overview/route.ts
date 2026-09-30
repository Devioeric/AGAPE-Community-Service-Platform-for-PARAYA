import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";
import { contributorPartnerIds } from "@/lib/contributor/server";
import { buildContributorOverview } from "@/lib/contributor/overview";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Dashboard and list data for the signed-in Contributor. The proposal set comes
 * from phase2_list_proposals, which returns only the caller's own proposals;
 * the service-role lookups below are keyed by those IDs and add names, SDGs,
 * and reviewer remarks for them only.
 */
export async function GET() {
  const auth = await authorizeCapability("contributor.proposal.read");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (auth.actor.role !== "contributor") return json({ error: "Contributor access is required" }, 403);
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");

  const list = await auth.supabase.rpc("phase2_list_proposals");
  if (list.error) return phase2RpcError(list.error);
  const rpcRows = Array.isArray(list.data) ? (list.data as Array<Record<string, unknown>>) : [];
  const ids = rpcRows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  const leadBarangayIds = Array.from(new Set(rpcRows.map((row) => row.leadBarangayId).filter((id): id is string => typeof id === "string")));

  const assignment = await contributorPartnerIds(auth.actor.id);
  if (assignment.error) return json({ error: assignment.error }, 503);
  const partnerIds = Array.from(new Set([
    ...assignment.ids,
    ...rpcRows.map((row) => row.originatingPartnerId).filter((id): id is string => typeof id === "string"),
  ]));

  const admin = createAdminClient();
  const none = Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null });
  const [profile, proposals, sdgs, events, barangays, partners] = await Promise.all([
    admin.from("users").select("full_name").eq("id", auth.actor.id).maybeSingle(),
    ids.length ? admin.from("project_proposals").select("id,created_by,created_at,updated_at").in("id", ids).eq("created_by", auth.actor.id) : none,
    ids.length ? admin.from("proposal_sdg_alignment").select("proposal_id,sdg_number").in("proposal_id", ids) : none,
    ids.length ? admin.from("proposal_workflow_events_v2").select("proposal_id,action,to_status,remarks,occurred_at").in("proposal_id", ids).order("occurred_at", { ascending: false }).limit(500) : none,
    leadBarangayIds.length ? admin.from("barangays").select("id,name").in("id", leadBarangayIds) : none,
    partnerIds.length ? admin.from("partner_entities").select("id,name,entity_type").in("id", partnerIds) : none,
  ]);
  if (proposals.error || sdgs.error || events.error || barangays.error || partners.error) {
    return json({ error: "Your proposals are temporarily unavailable" }, 503);
  }

  return json({
    data: buildContributorOverview({
      actorId: auth.actor.id,
      contributor: { name: profile.data?.full_name ?? null, email: auth.actor.email ?? null },
      rpcRows,
      proposals: proposals.data ?? [],
      sdgs: sdgs.data ?? [],
      events: events.data ?? [],
      barangays: barangays.data ?? [],
      partners: partners.data ?? [],
      organizationIds: assignment.ids,
    }),
  });
}
