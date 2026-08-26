import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, partnershipTermTransitionSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string; termId: string } }) {
  const auth = await authorizeCapability("partner.renew");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnershipTermTransitionSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid term transition", issues: parsed.issues }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_transition_partnership_term", { p_partner_id: params.id,
    p_term_id: params.termId, p_expected_version: value.expectedVersion, p_action: value.action,
    p_effective_on: value.effectiveOn, p_reason: value.reason });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.termId, rowVersion: data, status: value.action === "end" ? "ended" : value.action === "suspend" ? "suspended" : "active" } });
}
