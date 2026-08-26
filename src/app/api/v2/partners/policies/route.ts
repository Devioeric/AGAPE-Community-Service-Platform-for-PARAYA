import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, partnerTypePolicySchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("partnership.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const { data, error } = await auth.supabase.rpc("phase2_list_partner_type_policies");
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: (data ?? []).map((row: Record<string, unknown>) => ({ type: row.entity_type,
    agreementRequired: row.agreement_required, effectiveFrom: row.effective_from, changedAt: row.changed_at })) });
}

export async function PUT(request: Request) {
  const auth = await authorizeCapability("partner.policy.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnerTypePolicySchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid Partner type policy", issues: parsed.issues }, { status: 400 });
  const { error } = await auth.supabase.rpc("phase2_configure_partner_type_policy", { p_entity_type: parsed.data.type,
    p_agreement_required: parsed.data.agreementRequired, p_effective_from: parsed.data.effectiveFrom });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: parsed.data });
}
