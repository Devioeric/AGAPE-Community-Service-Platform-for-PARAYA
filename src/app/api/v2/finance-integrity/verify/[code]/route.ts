import { NextResponse } from "next/server";
import { publicVerificationCodeSchema } from "@/lib/integrity/contracts";
import { financeIntegrityDisabledResponse, isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import { phase2RpcError } from "@/lib/phase2/feature";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { code: string } }) {
  if (!isFinanceIntegrityEnabled()) return financeIntegrityDisabledResponse();
  const code = publicVerificationCodeSchema.safeParse(params.code);
  if (!code.success) return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("phase5_verify_finance_integrity_proof", { p_verification_code: code.data });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data }, { headers: { "cache-control": "public, max-age=60" } });
}
