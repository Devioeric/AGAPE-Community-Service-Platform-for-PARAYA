import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/dispatch";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/community-needs/[id]/reject
// Body: { notes: string, action?: "reject" | "needs_revision" }
//
// Only the PARAYA Officer may decide a Secretary-submitted need.
// "needs_revision" returns it for correction without a hard rejection.
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("community_need.validate");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = z.object({ notes: z.string().trim().min(3).max(1_000), action: z.enum(["reject", "needs_revision"]).default("reject") }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Rejection notes are required" }, { status: 400 });
  const body = parsed.data;

  const status = body.action === "needs_revision" ? "needs_revision" : "rejected";

  const admin = createAdminClient();
  const { data: need } = await admin.from("community_needs")
      .select("id, title, barangay_id, submitted_by, approval_status")
      .eq("id", id)
      .single();

  if (!need) return NextResponse.json({ error: "Need not found" }, { status: 404 });

  const { error } = await auth.supabase.rpc("phase1_decide_community_need", {
    p_community_need_id: id,
    p_decision: body.action,
    p_notes: body.notes.trim(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the submitter
  if (need.submitted_by) {
    await notify({
      user_id:    need.submitted_by,
      title:      status === "needs_revision" ? "Community need needs revision" : "Community need rejected",
      message:    `Your submission "${need.title}" — ${body.notes.trim()}`,
      type:       status === "needs_revision" ? "warning" : "danger",
      action_url: "/barangay/submit-needs",
    });
  }

  return NextResponse.json({ success: true, status });
}
