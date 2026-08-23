import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

const bodySchema = z.strictObject({ rowKey: z.string().trim().min(1).max(80), candidateId: z.string().uuid(), outcome: z.enum(["link_existing", "distinct", "exclude"]), reason: z.string().trim().min(5).max(1000) });
export async function POST(request: Request, { params }: { params: { batchId: string } }) {
  const auth = await authorizeCapability("historical_program.import");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid duplicate decision", issues: body.error.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_resolve_historical_duplicate", { p_batch_id: params.batchId,
    p_row_key: body.data.rowKey, p_candidate_id: body.data.candidateId, p_outcome: body.data.outcome, p_reason: body.data.reason });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { status: data } });
}
