import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { liquidationCreateSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("budget.actual.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const body = parseStrict(liquidationCreateSchema, await request.json().catch(() => null));
  if (!body.ok) return NextResponse.json({ error: "Invalid liquidation", issues: body.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_create_liquidation_v2", { p_program_id: params.id, p_summary: {
    period_start: body.data.summary.periodStart, period_end: body.data.summary.periodEnd,
    narrative: body.data.summary.narrative, exception_notes: body.data.summary.exceptionNotes ?? null,
  }, p_expenditure_ids: body.data.expenditureIds });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data }, { status: 201 });
}
