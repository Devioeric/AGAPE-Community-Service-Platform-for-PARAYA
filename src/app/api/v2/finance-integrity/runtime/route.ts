import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { financeIntegrityRuntimeSchema } from "@/lib/integrity/contracts";
import { isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import { phase2RpcError } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("integrity.provider.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase5_get_integrity_runtime");
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { ...(data as Record<string, unknown>), serverEnabled: isFinanceIntegrityEnabled() } }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const auth = await authorizeCapability("integrity.provider.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = financeIntegrityRuntimeSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid integrity runtime configuration", issues: body.error.issues }, { status: 400 });
  if (body.data.mode !== "off" && !isFinanceIntegrityEnabled()) {
    return NextResponse.json({ error: "The finance integrity server gate is disabled" }, { status: 503 });
  }
  const { data, error } = await auth.supabase.rpc("phase5_configure_integrity_runtime", {
    p_mode: body.data.mode,
    p_synthetic_user_ids: body.data.syntheticUserIds,
    p_synthetic_source_ids: body.data.syntheticSourceIds,
    p_provider_key: body.data.providerKey,
    p_network_key: body.data.networkKey,
    p_contract_reference: body.data.contractReference,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
