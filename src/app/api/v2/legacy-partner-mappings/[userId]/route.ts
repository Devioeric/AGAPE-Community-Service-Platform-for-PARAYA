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
  const { data, error } = await auth.supabase.rpc("phase2_reconcile_legacy_partner_mapping_v2", {
    p_legacy_user_id: params.userId, p_partner_id: value.partnerId, p_responsible_officer_id: value.responsibleOfficerId,
    p_expected_version: value.expectedVersion, p_action: value.action, p_notes: value.notes,
  });
  if (error) return phase2RpcError(error);
  if (value.action === "sign_off") {
    const prepared = data as { suspensionRequestId: string; dataMode: "synthetic" | "live"; rowVersion: number };
    if (prepared.dataMode !== "synthetic") {
      return NextResponse.json({ data: { ...prepared, authSuspensionStatus: "requested", productionChangeRequired: true } }, { status: 202 });
    }
    const admin = createAdminClient();
    const suspended = await admin.auth.admin.updateUserById(params.userId, { ban_duration: INACTIVE_AUTH_BAN_DURATION });
    if (suspended.error) {
      const recorded = await admin.rpc("phase2_finalize_legacy_auth_suspension", { p_actor_id: auth.actor.id,
        p_legacy_user_id: params.userId, p_request_id: prepared.suspensionRequestId, p_succeeded: false, p_error_code: "auth_admin_update_failed" });
      if (recorded.error) return phase2RpcError(recorded.error);
      return NextResponse.json({ error: "Auth suspension failed; the application account remains historical-read-only and active pending retry", code: "auth_suspension_pending", data: recorded.data }, { status: 503 });
    }
    const finalized = await admin.rpc("phase2_finalize_legacy_auth_suspension", { p_actor_id: auth.actor.id,
      p_legacy_user_id: params.userId, p_request_id: prepared.suspensionRequestId, p_succeeded: true, p_error_code: null });
    if (finalized.error) return NextResponse.json({ error: "Auth is suspended but application finalization requires an audited retry", code: "application_suspension_finalize_pending" }, { status: 503 });
    return NextResponse.json({ data: finalized.data });
  }
  return NextResponse.json({ data });
}
