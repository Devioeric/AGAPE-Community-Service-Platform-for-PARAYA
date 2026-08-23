import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; distributionId: string }> }) {
  const auth = await authorizeCapability("donation.manage"); if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = z.object({ reason: z.string().trim().min(3).max(1000) }).strict().safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  const { id, distributionId } = await params; const { error } = await auth.supabase.rpc("phase1_void_donation_record", { p_entity_type: "distribution", p_entity_id: distributionId, p_parent_id: id, p_reason: parsed.data.reason });
  if (error) return NextResponse.json({ error: error.message }, { status: 422 }); return NextResponse.json({ success: true });
}
