import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { parseStrict, proposalWorkflowSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAnyCapability(["proposal.submit", "proposal.review", "proposal.evidence.confirm", "proposal.decide", "budget.review"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  const parsed = parseStrict(proposalWorkflowSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid proposal action", issues: parsed.issues }, { status: 400 });
  if (["finance_clear", "finance_return"].includes(parsed.data.action) && !isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const { data, error } = await auth.supabase.rpc("phase2_apply_proposal_action", {
    p_proposal_id: params.id, p_action: parsed.data.action, p_expected_version: parsed.data.expectedVersion,
    p_remarks: parsed.data.remarks ?? null, p_warning_codes: parsed.data.acknowledgedWarningCodes,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.id, status: data } });
}
