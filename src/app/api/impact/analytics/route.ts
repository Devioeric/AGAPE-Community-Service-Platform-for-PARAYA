import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";

const querySchema = z.object({ programId: z.string().uuid().optional() }).strict();

export async function GET(request: NextRequest) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { data, error } = await auth.supabase.rpc("phase6_impact_aggregate", { p_program_id: parsed.data.programId ?? null });
  if (error) return NextResponse.json({ error: "Unable to load impact analytics" }, { status: 500 });
  return NextResponse.json(data);
}
