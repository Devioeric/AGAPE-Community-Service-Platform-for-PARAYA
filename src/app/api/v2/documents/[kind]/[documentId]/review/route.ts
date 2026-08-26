import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

const kindSchema = z.enum(["partnership", "historical", "proposal_budget", "program_finance"]);
const componentByKind = { partnership: "partners", historical: "historical_programs", proposal_budget: "proposals", program_finance: "program_finance" } as const;
const bodySchema = z.strictObject({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(5).max(2000) })
  .superRefine((value, context) => { if (value.decision === "reject" && value.reason.length < 10) context.addIssue({ code: "custom", path: ["reason"], message: "Rejection reason must contain at least 10 characters" }); });

export async function POST(request: Request, { params }: { params: { kind: string; documentId: string } }) {
  const auth = await authorizeCapability("partner.policy.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const kind = kindSchema.safeParse(params.kind);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!kind.success || !z.string().uuid().safeParse(params.documentId).success || !body.success) {
    return NextResponse.json({ error: "Invalid document review" }, { status: 400 });
  }
  const component = componentByKind[kind.data];
  if (!isPhase2ComponentEnabled(component)) return phase2DisabledResponse(component);
  const { data, error } = await auth.supabase.rpc("phase2_review_document", {
    p_kind: kind.data, p_document_id: params.documentId, p_decision: body.data.decision, p_reason: body.data.reason,
  });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data });
}
