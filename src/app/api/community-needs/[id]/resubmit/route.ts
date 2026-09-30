import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMany } from "@/lib/notifications/dispatch";

const schema = z.object({
  expected_updated_at: z.string().datetime({ offset: true }),
  category: z.enum(["health", "livelihood", "education", "infrastructure", "environment"]),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(2000),
  priority: z.enum(["low", "medium", "high", "critical"]),
  affected_count: z.number().int().nonnegative().max(1_000_000).optional().nullable(),
  sitio: z.string().trim().max(120).optional().nullable(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("community_need.submit");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid community need revision" }, { status: 400 });
  const { id } = await params;
  const { expected_updated_at, ...payload } = parsed.data;
  const { data, error } = await auth.supabase.rpc("phase1_resubmit_community_need", {
    p_community_need_id: id,
    p_expected_updated_at: expected_updated_at,
    p_payload: payload,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "40001" ? 409 : 400 });
  const admin = createAdminClient();
    const { data: researchers } = await admin.from("users").select("id").eq("role", "paraya_officer").eq("status", "active").eq("is_active", true);
  await notifyMany((researchers ?? []).map((researcher) => researcher.id), {
    title: "Revised community need awaiting review",
    message: "A Barangay Secretary resubmitted a returned community need.",
    type: "approval",
    action_url: "/officer/community-needs?status=pending_paraya_review",
  });
  return NextResponse.json({ data });
}
