import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { recordAudit } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPACT_HEADERS } from "@/lib/impact/load";

const idSchema = z.string().uuid();
const bodySchema = z.object({ need_id: z.string().uuid(), intended_coverage: z.enum(["full", "partial"]) }).strict();
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: IMPACT_HEADERS });

/**
 * Links an approved community need of the program's own barangay to the
 * program. Links made at proposal handoff already exist; this covers programs
 * planned outside the proposal workflow.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCapability("impact.manage");
  if (!auth.ok) return fail(auth.status, auth.error);
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return fail(404, "Program not found");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Choose a community need and how much of it the program covers");

  const admin = createAdminClient();
  const [program, need, existing] = await Promise.all([
    admin.from("programs").select("id, barangay_id").eq("id", id).maybeSingle(),
    admin.from("community_needs").select("id, title, category, priority, barangay_id, approval_status").eq("id", parsed.data.need_id).maybeSingle(),
    admin.from("program_need_links_v2").select("id").eq("program_id", id).eq("need_id", parsed.data.need_id).limit(1),
  ]);
  if (program.error || need.error || existing.error) return fail(503, "The need could not be linked right now");
  if (!program.data) return fail(404, "Program not found");
  if (!program.data.barangay_id) return fail(422, "Assign the program to a barangay before linking needs");
  if (!need.data || need.data.approval_status !== "approved") return fail(422, "Only approved community needs can be linked");
  if (need.data.barangay_id !== program.data.barangay_id) return fail(422, "That need belongs to a different barangay");
  if ((existing.data ?? []).length > 0) return fail(409, "This need is already linked to the program");

  const inserted = await admin.from("program_need_links_v2").insert({
    program_id: id,
    need_id: need.data.id,
    intended_coverage: parsed.data.intended_coverage,
    need_snapshot: {
      title: need.data.title, category: need.data.category, priority: need.data.priority,
      barangay_id: need.data.barangay_id, linked_from: "impact", captured_at: new Date().toISOString(),
    },
  }).select("id").single();
  if (inserted.error || !inserted.data) return fail(503, "The need could not be linked right now");

  await recordAudit({
    user_id: auth.actor.id, user_email: auth.actor.email, action: "impact.need_linked", resource_type: "program", resource_id: id,
    metadata: { need_id: need.data.id, link_id: inserted.data.id, intended_coverage: parsed.data.intended_coverage },
  });
  return NextResponse.json({ data: { id: inserted.data.id } }, { status: 201, headers: IMPACT_HEADERS });
}
