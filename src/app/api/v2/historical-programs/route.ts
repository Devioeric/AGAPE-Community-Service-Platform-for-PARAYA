import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { historicalProgramCreateSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET() {
  const auth = await authorizeCapability("historical_program.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const { data, error } = await auth.supabase.rpc("phase2_list_historical_programs");
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id, code: row.code, title: row.title, summary: row.summary, category: row.category,
    datePrecision: row.date_precision, startsOn: row.starts_on, endsOn: row.ends_on,
    beneficiaryCount: row.beneficiary_count, volunteerCount: row.volunteer_count, volunteerHours: row.volunteer_hours,
    budgetTotal: row.budget_total, currency: row.currency, sourceType: row.source_type,
    status: row.status, quality: row.quality, rowVersion: row.row_version, createdAt: row.created_at,
  })) });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("historical_program.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const parsed = parseStrict(historicalProgramCreateSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid historical program", issues: parsed.issues }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase2_create_historical_program", { p_payload: {
    title: value.title, summary: value.summary ?? null, category: value.category, date_precision: value.datePrecision,
    starts_on: value.startsOn, ends_on: value.endsOn ?? null, beneficiary_count: value.beneficiaryCount ?? null,
    volunteer_count: value.volunteerCount ?? null, volunteer_hours: value.volunteerHours ?? null, budget_total: value.budgetTotal ?? null,
    currency: value.currency, resources: value.resources ?? null, historical_need_description: value.historicalNeedDescription ?? null,
    outcomes: value.outcomes ?? null, follow_up: value.followUp ?? null, source_type: value.sourceType, source_notes: value.sourceNotes ?? null,
    partner_ids: value.partnerIds, barangay_ids: value.barangayIds, need_ids: value.needIds,
    sdgs: value.sdgs.map((sdg) => ({ number: sdg.number, source: sdg.source })),
  } });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: data, rowVersion: 1 } }, { status: 201 });
}
