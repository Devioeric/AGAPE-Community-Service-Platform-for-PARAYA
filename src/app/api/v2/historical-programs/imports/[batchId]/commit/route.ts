import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(_request: Request, { params }: { params: { batchId: string } }) {
  const auth = await authorizeCapability("historical_program.import");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const { data, error } = await auth.supabase.rpc("phase2_commit_historical_import", { p_batch_id: params.batchId });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
