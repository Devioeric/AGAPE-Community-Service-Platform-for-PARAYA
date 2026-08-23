import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";

const schema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("impact.manage"); if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "A correction reason is required" }, { status: 400 });
  const { id } = await params; const { error } = await auth.supabase.rpc("phase1_void_impact_record", { p_entity_type: "indicator", p_entity_id: id, p_reason: parsed.data.reason });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "P0002" ? 404 : 422 }); return NextResponse.json({ data: { voided: true } });
}
