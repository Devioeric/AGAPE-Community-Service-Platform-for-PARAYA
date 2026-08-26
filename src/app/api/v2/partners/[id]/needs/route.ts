import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, partnerNeedLinkSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("partnership.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnerNeedLinkSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid Partner need link", issues: parsed.issues }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_upsert_partnership_need", { p_partner_id: params.id,
    p_term_id: value.termId, p_need_id: value.needId, p_expected_term_version: value.expectedTermVersion,
    p_coverage: value.coverage, p_notes: value.notes ?? null, p_evidence_type: value.evidenceType, p_evidence_id: value.evidenceId ?? null });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: data } });
}
