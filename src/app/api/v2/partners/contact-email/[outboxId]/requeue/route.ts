import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { isPhase2ComponentEnabled, phase2DisabledResponse, phase2RpcError } from "@/lib/phase2/feature";

const bodySchema = z.strictObject({ reason: z.string().trim().min(10).max(1000) });
export async function POST(request: Request, { params }: { params: { outboxId: string } }) {
  const auth = await authorizeCapability("partnership.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isPhase2ComponentEnabled("partners")) return phase2DisabledResponse("partners");
  if (!isPhase2ComponentEnabled("external_contact_email")) return phase2DisabledResponse("external_contact_email");
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "A requeue reason is required" }, { status: 400 });
  const { error } = await auth.supabase.rpc("phase2_requeue_contact_email", { p_outbox_id: params.outboxId, p_reason: body.data.reason });
  if (error) return phase2RpcError(error);
  return NextResponse.json({ data: { id: params.outboxId, status: "queued" } });
}
