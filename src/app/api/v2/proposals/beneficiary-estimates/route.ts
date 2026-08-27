import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { beneficiaryEstimateRequestSchema, beneficiaryEvidenceOptionsQuerySchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET(request: Request) {
  const auth = await authorizeCapability("proposal.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  const url = new URL(request.url);
  const parsed = parseStrict(beneficiaryEvidenceOptionsQuerySchema, Object.fromEntries(url.searchParams));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid evidence options request", issues: parsed.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_list_beneficiary_evidence_options", {
    p_barangay_id: parsed.data.barangayId,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("proposal.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  const parsed = parseStrict(beneficiaryEstimateRequestSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid beneficiary estimate request", issues: parsed.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_calculate_beneficiary_estimate", {
    p_category_code: parsed.data.categoryCode, p_barangay_id: parsed.data.barangayId,
    p_sitio_id: parsed.data.sitioId ?? null, p_evidence_snapshot_id: parsed.data.evidenceSnapshotId,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
