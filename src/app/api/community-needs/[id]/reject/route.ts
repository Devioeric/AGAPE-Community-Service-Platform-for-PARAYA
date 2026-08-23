import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/dispatch";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/community-needs/[id]/reject
// Body: { notes: string, action?: "reject" | "needs_revision" }
//
// Only the Barangay Captain of the matching barangay may reject.
// "needs_revision" lets the Captain ask the submitter to revise without a hard reject.
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

  if (!auth.actor.barangayId || auth.actor.barangayId !== need.barangay_id) {
    return NextResponse.json({ error: "Only the Barangay Captain may take action on needs from this barangay" }, { status: 403 });
  }

  const { error } = await admin
    .from("community_needs")
    .update({
      approval_status: status,
      approved_by:     auth.actor.id,    // record who took the action
      approved_at:     new Date().toISOString(),
      approval_notes:  body.notes.trim(),
      updated_at:      new Date().toISOString(),
    })
    .eq("id", id);

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
