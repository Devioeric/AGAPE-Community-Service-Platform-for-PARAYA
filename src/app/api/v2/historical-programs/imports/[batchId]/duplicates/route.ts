import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { historicalDuplicateResolutionSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { batchId: string } }) {
  const auth = await authorizeCapability("historical_program.import");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const body = historicalDuplicateResolutionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid duplicate decision", issues: body.error.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_resolve_historical_duplicate_v2", { p_batch_id: params.batchId,
    p_row_key: body.data.rowKey, p_candidate_id: body.data.candidateId ?? null, p_outcome: body.data.outcome, p_reason: body.data.reason });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { status: data } });
}
