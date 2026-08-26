import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("budget.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const { data, error } = await auth.supabase.rpc("phase2_list_program_finance_queue");
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: data ?? [] }, { headers: { "cache-control": "no-store" } });
}
