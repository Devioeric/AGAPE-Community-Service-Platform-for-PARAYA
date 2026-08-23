import { NextResponse } from "next/server";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { historicalProgramUpdateSchema, parseStrict } from "@/lib/phase2/contracts";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("historical_program.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const { data, error } = await auth.supabase.rpc("phase2_get_historical_program", { p_id: params.id });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeAnyCapability(["historical_program.create", "historical_program.review"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("historical_programs")) return phase2DisabledResponse("historical_programs");
  const parsed = parseStrict(historicalProgramUpdateSchema, await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "Invalid historical program update", issues: parsed.issues }, { status: 400 });
  const { expectedVersion, ...changes } = parsed.data;
  const payload = Object.fromEntries(Object.entries({ title: changes.title, summary: changes.summary, category: changes.category,
    date_precision: changes.datePrecision, starts_on: changes.startsOn, ends_on: changes.endsOn,
    beneficiary_count: changes.beneficiaryCount, volunteer_count: changes.volunteerCount, volunteer_hours: changes.volunteerHours,
    budget_total: changes.budgetTotal, resources: changes.resources, historical_need_description: changes.historicalNeedDescription,
    outcomes: changes.outcomes, follow_up: changes.followUp, source_type: changes.sourceType, source_notes: changes.sourceNotes,
  }).filter(([, value]) => value !== undefined));
  const { error } = await auth.supabase.rpc("phase2_update_historical_program", { p_id: params.id, p_expected_version: expectedVersion, p_changes: payload });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.id } });
}
