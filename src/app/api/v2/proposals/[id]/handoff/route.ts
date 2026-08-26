import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

const bodySchema = z.strictObject({ expectedVersion: z.number().int().positive() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeCapability("proposal.handoff");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("proposals")) return phase2DisabledResponse("proposals");
  if (!isPhase2ComponentEnabled("program_finance")) return phase2DisabledResponse("program_finance");
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid handoff request", issues: body.error.issues }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase2_handoff_proposal_v2", { p_proposal_id: params.id, p_expected_version: body.data.expectedVersion });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
