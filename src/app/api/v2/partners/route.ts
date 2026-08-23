import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { partnerCreateSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("partnership.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const { data, error } = await auth.supabase.rpc("phase2_list_partners");
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id, code: row.code, name: row.name, legalName: row.legal_name, type: row.entity_type,
    classification: row.classification, lifecycle: row.lifecycle, barangayId: row.barangay_id,
    rowVersion: row.row_version, roles: row.roles ?? [], currentTerm: row.term_status ? {
      status: row.term_status, derivedStatus: row.derived_term_status, startsOn: row.starts_on, expiresOn: row.expires_on,
    } : null,
  })) });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("partnership.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  const parsed = parseStrict(partnerCreateSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid partner", issues: parsed.issues }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_create_partner", { p_payload: {
    name: value.name, legal_name: value.legalName ?? null, entity_type: value.type, classification: value.classification,
    roles: value.roles, barangay_id: value.barangayId ?? null,
  } });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
