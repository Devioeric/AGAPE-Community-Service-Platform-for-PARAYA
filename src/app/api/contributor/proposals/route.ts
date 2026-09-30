import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";
import {
  contributorGraphRpcPayload,
  contributorInputToGraph,
  contributorProposalInputSchema,
  type ContributorCatalog,
} from "@/lib/contributor/contracts";
import { contributorPartnerIds, contributorProposalSummaries } from "@/lib/contributor/server";
import { hasCapability } from "@/lib/auth/capabilities";
import { z } from "zod";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const partnerFilterSchema = z.string().uuid().optional();
const CONTRIBUTOR_FOCUS_SDGS = new Set([4, 9, 11, 17]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function contributorAuth(required: "read" | "create" = "read") {
  const capabilities = required === "create"
    ? ["contributor.proposal.create", "contributor.budget.prepare"] as const
    : ["contributor.proposal.read"] as const;
  const auth = await authorizeAnyCapability(capabilities);
  if (!auth.ok) return auth;
  if (auth.actor.role !== "contributor") return { ok: false as const, status: 403 as const, error: "Contributor access is required" };
  if (required === "create" && !hasCapability(auth.actor.role, auth.actor.permissions, "contributor.budget.prepare")) {
    return { ok: false as const, status: 403 as const, error: "Contributor proposal preparation is disabled" };
  }
  return auth;
}

export async function GET(request: Request) {
  const auth = await contributorAuth();
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  const rawPartner = new URL(request.url).searchParams.get("partner_id") ?? undefined;
  const partnerResult = partnerFilterSchema.safeParse(rawPartner);
  if (!partnerResult.success) return json({ error: "Invalid contributor entity filter" }, 400);
  const { data, error } = await auth.supabase.rpc("phase2_list_proposals");
  if (error) return phase2RpcError(error);
  const result = await contributorProposalSummaries(auth.actor, data, partnerResult.data);
  if (result.error) return json({ error: result.error }, 503);
  return json({ data: result.data });
}

export async function POST(request: Request) {
  const auth = await contributorAuth("create");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  if (auth.actor.role !== "contributor") return json({ error: "Contributor access is required" }, 403);

  const parsed = contributorProposalInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid contributor proposal", issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);

  const catalogResult = await auth.supabase.rpc("phase2_get_proposal_catalog");
  if (catalogResult.error || !catalogResult.data || typeof catalogResult.data !== "object") return json({ error: "Contributor proposal catalog is unavailable" }, 503);
  const catalog = catalogResult.data as ContributorCatalog;
  const assignment = await contributorPartnerIds(auth.actor.id);
  if (assignment.error) return json({ error: assignment.error }, 503);
  if (!assignment.ids.includes(parsed.data.partnerId) || !(catalog.partners ?? []).some((partner) => partner.id === parsed.data.partnerId)) return json({ error: "The selected contributor entity is not assigned to this account" }, 403);
  const allowedSdgNumbers = new Set((catalog.sdgs ?? []).map((sdg) => sdg.number));
  if ((parsed.data.sdgNumbers ?? []).some((number) => !allowedSdgNumbers.has(number) || !CONTRIBUTOR_FOCUS_SDGS.has(number))) {
    return json({ error: "One or more selected SDGs are outside the active AGAPE focus scope" }, 422);
  }
  if (!(catalog.projectCategories ?? []).some((category) => category.id === parsed.data.categoryId)) return json({ error: "The selected proposal category is unavailable" }, 422);
  const target = (catalog.barangays ?? []).find((barangay) => barangay.id === parsed.data.targetBarangayId);
  if (!target || (parsed.data.targetSitioId && !(target.sitios ?? []).some((sitio) => sitio.id === parsed.data.targetSitioId))) return json({ error: "The target barangay or sitio is unavailable" }, 422);
  if (!(catalog.approvedNeeds ?? []).some((need) => need.id === parsed.data.needId && need.barangayId === parsed.data.targetBarangayId)) return json({ error: "Choose an approved need for the selected barangay" }, 422);

  let graph;
  try { graph = contributorInputToGraph(parsed.data, catalog); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Contributor proposal data is unavailable" }, 422); }

  const rpc = await auth.supabase.rpc("phase2_save_proposal_graph_v2", {
    p_proposal_id: null,
    p_expected_version: 0,
    p_payload: contributorGraphRpcPayload(graph),
  });
  if (rpc.error) return phase2RpcError(rpc.error);
  const id = typeof rpc.data === "object" && rpc.data !== null && "id" in rpc.data ? (rpc.data as { id?: unknown }).id : null;
  if (typeof id !== "string") return json({ error: "Contributor proposal creation returned an invalid result" }, 503);

  const list = await auth.supabase.rpc("phase2_list_proposals");
  if (list.error) return json({ data: { id, partnerId: parsed.data.partnerId, title: parsed.data.title, summary: parsed.data.summary, status: "draft", rowVersion: 1, targetBarangayId: parsed.data.targetBarangayId, targetBarangayName: target.name, createdAt: null, updatedAt: null } }, 201);
  const summaries = await contributorProposalSummaries(auth.actor, list.data, parsed.data.partnerId);
  const created = summaries.data.find((row) => row.id === id) ?? {
    id, partnerId: parsed.data.partnerId, title: parsed.data.title, summary: parsed.data.summary, status: "draft", rowVersion: 1,
    targetBarangayId: parsed.data.targetBarangayId, targetBarangayName: target.name, createdAt: null, updatedAt: null,
  };
  return json({ data: created }, 201);
}

