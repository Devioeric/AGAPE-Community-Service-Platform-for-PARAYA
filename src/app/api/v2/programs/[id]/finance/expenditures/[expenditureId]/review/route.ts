import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { expenditureReviewSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string; expenditureId: string } }) {
  const auth = await authorizeCapability("budget.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const body = parseStrict(expenditureReviewSchema, await request.json().catch(() => null));
  if (!body.ok) return NextResponse.json({ error: "Invalid review", issues: body.issues }, { status: 400 });
  const { error } = await auth.supabase.rpc("phase2_review_expenditure", { p_program_id: params.id, p_id: params.expenditureId, p_action: body.data.action, p_expected_version: body.data.expectedVersion, p_reason: body.data.reason });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.expenditureId, action: body.data.action } });
}
