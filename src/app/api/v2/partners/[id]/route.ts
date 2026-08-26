import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, partnerUpdateSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("partnership.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const [partner, relationship] = await Promise.all([
    auth.supabase.rpc("phase2_get_partner", { p_partner_id: params.id }),
    auth.supabase.rpc("phase2_get_partner_relationship_detail", { p_partner_id: params.id }),
  ]);
  if (partner.error) return phase2RpcError(partner.error);
  if (relationship.error) return phase2RpcError(relationship.error);
  return NextResponse.json({ data: { ...(partner.data as Record<string, unknown>), ...(relationship.data as Record<string, unknown>) } });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("partnership.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnerUpdateSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid Partner update", issues: parsed.issues }, { status: 400 });
  const { expectedVersion, ...changes } = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_update_partner", { p_partner_id: params.id, p_expected_version: expectedVersion,
    p_payload: { name: changes.name, legal_name: changes.legalName, lifecycle: changes.lifecycle } });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.id, rowVersion: data } });
}
