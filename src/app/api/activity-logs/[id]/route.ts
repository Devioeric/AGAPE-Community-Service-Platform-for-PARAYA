import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("activity_log.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id }    = await params;
  const parsed = z.object({ status: z.enum(["approved", "rejected"]) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review decision" }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("activity_logs")
    .update({ status: parsed.data.status, reviewed_by: auth.actor.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
