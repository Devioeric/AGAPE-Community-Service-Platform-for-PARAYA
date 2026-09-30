import { NextResponse } from "next/server";
import { publicVerificationCodeSchema, financeIntegrityVerificationSchema } from "@/lib/integrity/contracts";
import { verifyFinanceCommitment } from "@/lib/integrity/verification";
import { integrityRpcError, publicNoStore } from "@/lib/integrity/http";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { code: string } }) {
  const code = publicVerificationCodeSchema.safeParse(params.code);
  if (!code.success) return NextResponse.json({ error: "Invalid verification code" }, { status: 400, headers: publicNoStore });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("phase5_verify_finance_integrity_proof", { p_verification_code: code.data });
  if (error) return integrityRpcError(error, true);
  const parsed = financeIntegrityVerificationSchema.safeParse(data);
  if (!parsed.success) return NextResponse.json({ error: "Verification is unavailable" }, { status: 503, headers: publicNoStore });
  const checked = await verifyFinanceCommitment(parsed.data);
  return NextResponse.json({ data: { ...parsed.data, chainVerification: checked.status } }, { headers: publicNoStore });
}
