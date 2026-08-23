import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { legacyPartnerMappingSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";
import { createAdminClient } from "@/lib/supabase/admin";
import { INACTIVE_AUTH_BAN_DURATION } from "@/lib/auth/account-status";

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const auth = await authorizeCapability("partner.legacy_mapping.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(legacyPartnerMappingSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid mapping action", issues: parsed.issues }, { status: 400 });
  const value = parsed.data;
  const { error } = await auth.supabase.rpc("phase2_reconcile_legacy_partner_mapping", {
    p_legacy_user_id: params.userId, p_partner_id: value.partnerId, p_responsible_officer_id: value.responsibleOfficerId,
    p_expected_version: value.expectedVersion, p_action: value.action, p_notes: value.notes,
  });
  if (error) return phase2RpcError(error);
  if (value.action === "sign_off") {
    const suspended = await createAdminClient().auth.admin.updateUserById(params.userId, { ban_duration: INACTIVE_AUTH_BAN_DURATION });
    if (suspended.error) return NextResponse.json({ error: "Application access is suspended, but Auth suspension must be retried before cutover", code: "auth_suspension_pending" }, { status: 503 });
  }
  return NextResponse.json({ data: { userId: params.userId, action: value.action } });
}
