import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { parseStrict, proposalDraftGraphSchema, toProposalGraphRpcPayload } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

const CONTRIBUTOR_FOCUS_SDGS = new Set([4, 9, 11, 17]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAnyCapability(["proposal.read", "contributor.proposal.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  const { data, error } = await auth.supabase.rpc("phase2_get_proposal", { p_proposal_id: params.id });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAnyCapability(["proposal.create", "contributor.proposal.revise", "contributor.proposal.edit", "contributor.proposal.create"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.actor.role === "contributor" && !hasCapability(auth.actor.role, auth.actor.permissions, "contributor.budget.prepare")) {
    return NextResponse.json({ error: "Contributor proposal preparation is disabled" }, { status: 403 });
  }
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  const body = await request.json().catch(() => null);
  const normalizedBody = auth.ok && auth.actor.role === "contributor" && body && typeof body === "object"
    ? { ...(body as Record<string, unknown>), responsibleOfficerId: "00000000-0000-0000-0000-000000000000" }
    : body;
  const parsed = parseStrict(proposalDraftGraphSchema, normalizedBody);
  if (!parsed.ok) return NextResponse.json({ error: "Invalid proposal graph", issues: parsed.issues }, { status: 400 });
  if (auth.actor.role === "contributor" && parsed.data.sdgNumbers.some((number) => !CONTRIBUTOR_FOCUS_SDGS.has(number))) {
    return NextResponse.json({ error: "Contributor proposals may use only AGAPE focus SDGs 4, 9, 11, and 17" }, { status: 422 });
  }
  if (!parsed.data.expectedVersion) return NextResponse.json({ error: "expectedVersion is required" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_save_proposal_graph_v2", {
    p_proposal_id: params.id, p_expected_version: parsed.data.expectedVersion, p_payload: toProposalGraphRpcPayload(parsed.data),
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
