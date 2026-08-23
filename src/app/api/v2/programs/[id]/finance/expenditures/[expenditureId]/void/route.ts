import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { expenditureVoidSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string; expenditureId: string } }) {
  const auth = await authorizeCapability("budget.actual.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const parsed = parseStrict(expenditureVoidSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid void request", issues: parsed.issues }, { status: 400 });
  const { error } = await auth.supabase.rpc("phase2_void_expenditure", { p_program_id: params.id, p_id: params.expenditureId,
    p_expected_version: parsed.data.expectedVersion, p_reason: parsed.data.reason });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.expenditureId, status: "voided" } });
}
