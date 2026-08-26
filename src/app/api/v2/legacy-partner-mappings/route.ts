import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("partner.legacy_mapping.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const { data, error } = await auth.supabase.rpc("phase2_list_legacy_partner_mappings");
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: (data ?? []).map((row: Record<string, unknown>) => ({
    legacyUserId: row.legacy_user_id, legacyEmail: row.legacy_email, legacyRole: row.legacy_role, organizationName: row.org_name,
    partnerId: row.partner_id, partnerName: row.partner_name, reconciliationStatus: row.reconciliation_status,
    responsibleOfficerId: row.responsible_officer_id, proposalCount: row.proposal_count, programCount: row.program_count,
    pendingWorkCount: row.pending_work_count, rowVersion: row.row_version, authSuspensionStatus: row.auth_suspension_status,
    authSuspensionRequestId: row.auth_suspension_request_id,
  })) });
}
