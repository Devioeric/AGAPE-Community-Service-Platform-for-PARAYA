import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { parseStrict, partnerContactUpdateSchema } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function PATCH(request: Request, { params }: { params: { id: string; contactId: string } }) {
  const auth = await authorizeCapability("partner.contact.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnerContactUpdateSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid contact update", issues: parsed.issues }, { status: 400 });
  const { expectedVersion, ...value } = parsed.data;
  const payload: Record<string, unknown> = {};
  if (value.fullName !== undefined) payload.full_name = value.fullName;
  if (value.title !== undefined) payload.title = value.title;
  if (value.email !== undefined) payload.email = value.email;
  if (value.phone !== undefined) payload.phone = value.phone;
  if (value.preferredChannel !== undefined) payload.preferred_channel = value.preferredChannel;
  if (value.isPrimary !== undefined) payload.is_primary = value.isPrimary;
  if (value.statusEmailOptIn !== undefined) payload.status_email_opt_in = value.statusEmailOptIn;
  if (value.consentSource !== undefined) payload.consent_source = value.consentSource;
  if (value.consentAt !== undefined) payload.consent_at = value.consentAt;
  if (value.activeUntil !== undefined) payload.active_until = value.activeUntil;
  const { data, error } = await auth.supabase.rpc("phase2_update_partner_contact", { p_partner_id: params.id,
    p_contact_id: params.contactId, p_expected_version: expectedVersion, p_payload: payload });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.contactId, rowVersion: data } });
}
