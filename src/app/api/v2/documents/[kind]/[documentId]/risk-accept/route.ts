import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { phase2RpcError } from "@/lib/phase2/feature";

const kindSchema = z.enum(["partnership", "historical", "proposal_budget", "program_finance"]);
const bodySchema = z.strictObject({ reason: z.string().trim().min(20).max(2000) });
export async function POST(request: Request, { params }: { params: { kind: string; documentId: string } }) {
  const auth = await authorizeCapability("partner.policy.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const kind = kindSchema.safeParse(params.kind); const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!kind.success || !body.success) return NextResponse.json({ error: "Invalid risk acceptance" }, { status: 400 });
  const { error } = await auth.supabase.rpc("phase2_accept_document_risk", { p_kind: kind.data, p_document_id: params.documentId, p_reason: body.data.reason });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.documentId, scanStatus: "risk_accepted" } });
}
