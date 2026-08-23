import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, partnershipTermSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("partner.renew");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnershipTermSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid renewal", issues: parsed.issues }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_renew_partnership_term", { p_partner_id: params.id, p_expected_term_version: value.expectedVersion, p_payload: {
    starts_on: value.startsOn, expires_on: value.expiresOn ?? null, responsible_officer_id: value.responsibleOfficerId,
    agreement_document_id: value.agreementDocumentId ?? null, agreement_exception_reason: value.agreementExceptionReason ?? null,
    agreement_exception_due_on: value.agreementExceptionDueOn ?? null,
  } });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
