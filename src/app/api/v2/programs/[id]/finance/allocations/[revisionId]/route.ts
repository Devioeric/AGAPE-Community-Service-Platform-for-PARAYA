import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { parseStrict, programAllocationActionSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string; revisionId: string } }) {
  const auth = await authorizeAnyCapability(["budget.actual.record", "budget.review"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const parsed = parseStrict(programAllocationActionSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid allocation action", issues: parsed.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_apply_program_allocation_action", {
    p_program_id: params.id, p_revision_id: params.revisionId, p_action: parsed.data.action,
    p_expected_version: parsed.data.expectedVersion, p_reason: parsed.data.reason ?? null,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
