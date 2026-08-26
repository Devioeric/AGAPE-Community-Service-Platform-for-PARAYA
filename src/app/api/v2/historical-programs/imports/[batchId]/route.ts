import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET(_request: Request, { params }: { params: { batchId: string } }) {
  const auth = await authorizeAnyCapability(["historical_program.import", "historical_program.review"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const { data, error } = await auth.supabase.rpc("phase2_get_historical_import_batch", { p_batch_id: params.batchId });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
