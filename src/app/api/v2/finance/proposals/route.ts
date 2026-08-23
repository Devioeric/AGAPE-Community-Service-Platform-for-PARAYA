import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("budget.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  const { data, error } = await auth.supabase.rpc("phase2_list_finance_proposals");
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: data ?? [] });
}
