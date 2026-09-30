import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/dispatch";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/community-needs/[id]/approve
// Approves a Secretary-submitted community need after independent PARAYA review.
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("community_need.validate");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = z.object({ notes: z.string().trim().max(1_000).optional() }).strict().safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval decision" }, { status: 400 });
  const body = parsed.data;

  const admin = createAdminClient();

  const { data: need } = await admin.from("community_needs")
      .select("id, title, category, barangay_id, submitted_by, approval_status")
      .eq("id", id)
      .single();

  if (!need) return NextResponse.json({ error: "Need not found" }, { status: 404 });

  const { error } = await auth.supabase.rpc("phase1_decide_community_need", {
    p_community_need_id: id,
    p_decision: "approve",
    p_notes: body.notes?.trim() || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the submitter
  if (need.submitted_by) {
    await notify({
      user_id:    need.submitted_by,
      title:      "Community need approved",
      message:    `Your submission "${need.title}" has been approved by the PARAYA Officer.`,
      type:       "success",
      action_url: "/barangay/submit-needs",
    });
  }

  return NextResponse.json({ success: true });
}
