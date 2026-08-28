import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { financeIntegrityRequestSchema } from "@/lib/integrity/contracts";
import { financeIntegrityDisabledResponse, isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import { phase2RpcError } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("integrity.finance.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isFinanceIntegrityEnabled()) return financeIntegrityDisabledResponse();
  const { data, error } = await auth.supabase.rpc("phase5_list_finance_integrity_proofs");
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("integrity.finance.request");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isFinanceIntegrityEnabled()) return financeIntegrityDisabledResponse();
  const body = financeIntegrityRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid integrity proof request", issues: body.error.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase5_request_finance_integrity_proof", {
    p_source_type: body.data.sourceType,
    p_source_id: body.data.sourceId,
    p_expected_version: body.data.expectedVersion,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data }, { status: 201 });
}
