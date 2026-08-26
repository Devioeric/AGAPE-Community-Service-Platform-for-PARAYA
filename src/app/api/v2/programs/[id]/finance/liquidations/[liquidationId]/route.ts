import { NextResponse } from "next/server";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { liquidationActionSchema, liquidationUpdateSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string; liquidationId: string } }) {
  const auth = await authorizeAnyCapability(["budget.actual.record", "budget.liquidation.review"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const parsed = parseStrict(liquidationActionSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid liquidation action", issues: parsed.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_apply_liquidation_action_v2", {
    p_program_id: params.id, p_liquidation_id: params.liquidationId, p_action: parsed.data.action,
    p_expected_version: parsed.data.expectedVersion, p_remarks: parsed.data.remarks ?? null,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: { params: { id: string; liquidationId: string } }) {
  const auth = await authorizeAnyCapability(["budget.actual.record"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const parsed = parseStrict(liquidationUpdateSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid liquidation correction", issues: parsed.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_update_liquidation", {
    p_program_id: params.id, p_liquidation_id: params.liquidationId, p_expected_version: parsed.data.expectedVersion,
    p_summary: { period_start: parsed.data.summary.periodStart, period_end: parsed.data.summary.periodEnd,
      narrative: parsed.data.summary.narrative, exception_notes: parsed.data.summary.exceptionNotes ?? null },
    p_expenditure_ids: parsed.data.expenditureIds,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
