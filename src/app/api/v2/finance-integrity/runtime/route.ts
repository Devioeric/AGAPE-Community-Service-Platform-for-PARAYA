import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { financeIntegrityRuntimeSchema, financeIntegrityRuntimeOutputSchema } from "@/lib/integrity/contracts";
import { isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import { integrityRpcError, privateNoStore } from "@/lib/integrity/http";

export async function GET() {
  const auth = await authorizeCapability("integrity.provider.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: privateNoStore });
  const { data, error } = await auth.supabase.rpc("phase5_get_integrity_runtime");
  if (error) return integrityRpcError(error);
  const output = financeIntegrityRuntimeOutputSchema.safeParse({ ...(data as Record<string, unknown>), serverEnabled: isFinanceIntegrityEnabled() });
  if (!output.success) return NextResponse.json({ error: "Invalid runtime response" }, { status: 503, headers: privateNoStore });
  return NextResponse.json({ data: output.data }, { headers: privateNoStore });
}

export async function PUT(request: Request) {
  const auth = await authorizeCapability("integrity.provider.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: privateNoStore });
  const body = financeIntegrityRuntimeSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid integrity runtime configuration" }, { status: 400, headers: privateNoStore });
  if (body.data.mode !== "off" && !isFinanceIntegrityEnabled()) {
    return NextResponse.json({ error: "The finance integrity server gate is disabled" }, { status: 503, headers: privateNoStore });
  }
  const { data, error } = await auth.supabase.rpc("phase5_configure_integrity_runtime_v2", {
    p_mode: body.data.mode,
    p_expected_version: body.data.expectedVersion,
    p_target_id: body.data.targetId,
    p_synthetic_user_ids: body.data.syntheticUserIds,
    p_synthetic_source_ids: body.data.syntheticSourceIds,
  });
  if (error) return integrityRpcError(error);
  const output = financeIntegrityRuntimeOutputSchema.safeParse({ ...(data as Record<string, unknown>), serverEnabled: isFinanceIntegrityEnabled() });
  if (!output.success) return NextResponse.json({ error: "Invalid runtime response" }, { status: 503, headers: privateNoStore });
  return NextResponse.json({ data: output.data }, { headers: privateNoStore });
}
