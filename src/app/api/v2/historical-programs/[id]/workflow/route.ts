import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { historicalReviewSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAnyCapability(["historical_program.create", "historical_program.review"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const parsed = parseStrict(historicalReviewSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid workflow action", issues: parsed.issues }, { status: 400 });
  const { action, expectedVersion, quality, remarks } = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_transition_historical_program", {
    p_id: params.id, p_action: action, p_expected_version: expectedVersion, p_quality: quality ?? null, p_remarks: remarks ?? null,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
