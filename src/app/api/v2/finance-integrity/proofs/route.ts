import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { financeIntegrityRequestSchema, financeIntegrityProofSchema } from "@/lib/integrity/contracts";
import { financeIntegrityDisabledResponse, isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import { integrityRpcError, privateNoStore } from "@/lib/integrity/http";

export async function GET() {
  const auth = await authorizeCapability("integrity.finance.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: privateNoStore });
  if (!isFinanceIntegrityEnabled()) return financeIntegrityDisabledResponse();
  const { data, error } = await auth.supabase.rpc("phase5_list_finance_integrity_proofs");
  if (error) return integrityRpcError(error);
  const output = Array.isArray(data) ? data.map(item => financeIntegrityProofSchema.safeParse(item)).filter((item): item is { success: true; data: FinanceIntegrityProof } => item.success).map(item => item.data) : [];
  if (!Array.isArray(data) || output.length !== data.length) return NextResponse.json({ error: "Invalid proof response" }, { status: 503, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ data: output }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("integrity.finance.request");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: privateNoStore });
  if (!isFinanceIntegrityEnabled()) return financeIntegrityDisabledResponse();
  const body = financeIntegrityRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid integrity proof request" }, { status: 400, headers: privateNoStore });
  const { data, error } = await auth.supabase.rpc("phase5_request_finance_integrity_proof", {
    p_source_type: body.data.sourceType,
    p_source_id: body.data.sourceId,
    p_expected_version: body.data.expectedVersion,
  });
  if (error) return integrityRpcError(error);
  const output = financeIntegrityProofSchema.safeParse(data);
  if (!output.success) return NextResponse.json({ error: "Invalid proof response" }, { status: 503, headers: privateNoStore });
  return NextResponse.json({ data: output.data }, { status: 201, headers: privateNoStore });
}

type FinanceIntegrityProof = import("@/lib/integrity/types").FinanceIntegrityProofDTO;
