import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, notifyMany } from "@/lib/notifications/dispatch";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/community-needs/[id]/approve
// Approves a community need so PARAYA staff can see it.
// Only the Barangay Captain of the matching barangay may approve.
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("community_need.validate");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = z.object({ notes: z.string().trim().max(1_000).optional() }).strict().safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval decision" }, { status: 400 });
  const body = parsed.data;

  const admin = createAdminClient();

  // Load the need + the caller's role/barangay
  const { data: need } = await admin.from("community_needs")
      .select("id, title, category, barangay_id, submitted_by, approval_status")
      .eq("id", id)
      .single();

  if (!need) return NextResponse.json({ error: "Need not found" }, { status: 404 });

  if (!auth.actor.barangayId || auth.actor.barangayId !== need.barangay_id) {
    return NextResponse.json({ error: "Only the Barangay Captain may approve needs from this barangay" }, { status: 403 });
  }

  if (need.approval_status === "approved") {
    return NextResponse.json({ error: "Already approved" }, { status: 400 });
  }

  const { error } = await admin
    .from("community_needs")
    .update({
      approval_status: "approved",
      approved_by:     auth.actor.id,
      approved_at:     new Date().toISOString(),
      approval_notes:  body.notes?.trim() || null,
      updated_at:      new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the submitter
  if (need.submitted_by) {
    await notify({
      user_id:    need.submitted_by,
      title:      "Community need approved",
      message:    `Your submission "${need.title}" has been approved by the Barangay Captain and forwarded to PARAYA.`,
      type:       "success",
      action_url: "/barangay/submit-needs",
    });
  }

  // Notify PARAYA Researchers (they primarily own needs assessment per scope)
  const { data: researchers } = await admin
    .from("users")
    .select("id")
    .in("role", ["paraya_researcher", "paraya_director", "paraya_associate"])
    .eq("status", "active")
    .eq("is_active", true);
  const researcherIds = (researchers ?? []).map((r) => r.id);
  if (researcherIds.length > 0) {
    await notifyMany(researcherIds, {
      title:      "New community need received",
      message:    `${need.title} (${need.category}) was approved by the Barangay Captain and is now visible in Community Needs.`,
      type:       "info",
      action_url: "/officer/community-profile",
    });
  }

  return NextResponse.json({ success: true });
}
