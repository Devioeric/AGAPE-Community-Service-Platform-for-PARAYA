import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { expenditureCorrectionSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string; expenditureId: string } }) {
  const auth = await authorizeCapability("budget.actual.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const parsed = parseStrict(expenditureCorrectionSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid correction", issues: parsed.issues }, { status: 400 });
  const value = parsed.data.replacement;
  const { data, error } = await auth.supabase.rpc("phase2_correct_expenditure_v2", { p_program_id: params.id, p_id: params.expenditureId,
    p_expected_version: parsed.data.expectedVersion, p_reason: parsed.data.reason, p_replacement_payload: {
      budget_item_id: value.budgetItemId, amount: value.amount, spent_on: value.spentOn, payee_label: value.payeeLabel ?? null,
      description: value.description, receipt_document_id: value.receiptDocumentId ?? null, receipt_exception_reason: value.receiptExceptionReason ?? null,
      variance_explanation: value.varianceExplanation ?? null,
    } });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
