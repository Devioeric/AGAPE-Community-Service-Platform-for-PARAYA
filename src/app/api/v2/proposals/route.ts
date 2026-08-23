import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, proposalDraftGraphSchema, toProposalGraphRpcPayload } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request) {
  const auth = await authorizeCapability("proposal.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  const parsed = parseStrict(proposalDraftGraphSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid proposal graph", issues: parsed.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_save_proposal_graph", { p_proposal_id: null, p_expected_version: 0, p_payload: toProposalGraphRpcPayload(parsed.data) });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
