import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, partnerMergeSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("partner.policy.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnerMergeSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid Partner merge", issues: parsed.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_merge_partner", { p_source_partner_id: params.id,
    p_target_partner_id: parsed.data.targetPartnerId, p_expected_version: parsed.data.expectedVersion, p_reason: parsed.data.reason });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.id, mergedIntoId: parsed.data.targetPartnerId, rowVersion: data } });
}
