import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { financeIntegrityProofSchema, financeIntegrityResumeSchema } from "@/lib/integrity/contracts";
import { financeIntegrityDisabledResponse, isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import { integrityRpcError, privateNoStore } from "@/lib/integrity/http";
import { z } from "zod";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("integrity.finance.request");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: privateNoStore });
  if (!isFinanceIntegrityEnabled()) return financeIntegrityDisabledResponse();
  const body = financeIntegrityResumeSchema.safeParse(await request.json().catch(() => null));
  const id = z.string().uuid().safeParse(params.id);
  if (!body.success || !id.success) return NextResponse.json({ error: "Invalid resume request" }, { status: 400, headers: privateNoStore });
  const { data, error } = await auth.supabase.rpc("phase5_resume_finance_integrity_proof", { p_proof_id: id.data, p_expected_version: body.data.expectedVersion });
  if (error) return integrityRpcError(error);
  const output = financeIntegrityProofSchema.safeParse(data);
  if (!output.success) return NextResponse.json({ error: "Invalid proof response" }, { status: 503, headers: privateNoStore });
  return NextResponse.json({ data: output.data }, { headers: privateNoStore });
}
