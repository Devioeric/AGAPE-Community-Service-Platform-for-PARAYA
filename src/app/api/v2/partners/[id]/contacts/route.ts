import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, partnerContactSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("partner.contact.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnerContactSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid contact", issues: parsed.issues }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_add_partner_contact", { p_partner_id: params.id, p_payload: {
    full_name: value.fullName, title: value.title ?? null, email: value.email ?? null, phone: value.phone ?? null,
    preferred_channel: value.preferredChannel, is_primary: value.isPrimary, status_email_opt_in: value.statusEmailOptIn,
    consent_source: value.consentSource ?? null, consent_at: value.consentAt ?? null, active_from: value.activeFrom, active_until: value.activeUntil ?? null,
  } });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
