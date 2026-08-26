import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, programAllocationPrepareSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("budget.actual.record");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const parsed = parseStrict(programAllocationPrepareSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid allocation revision", issues: parsed.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_prepare_program_allocation", {
    p_program_id: params.id, p_expected_active_version: parsed.data.expectedActiveVersion,
    p_payload: { reason: parsed.data.reason, items: parsed.data.items.map((item) => ({ source_item_id: item.sourceItemId ?? null,
      category_id: item.categoryId, kind: item.kind, description: item.description,
      allocated_amount: item.allocatedAmount, sort_order: item.sortOrder })) },
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data }, { status: 201 });
}
