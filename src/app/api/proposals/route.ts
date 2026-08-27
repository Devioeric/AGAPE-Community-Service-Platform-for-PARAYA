import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { guardV1Mutation } from "@/lib/phase2/feature";
import { hasCapability } from "@/lib/auth/capabilities";
import { parseProposalCreateInput } from "@/lib/proposals/mutation-contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

const PROPOSAL_LIST_FIELDS = "id,title,rationale,objectives,target_beneficiaries,expected_beneficiary_count,expected_output,timeline_start,timeline_end,budget,status,is_income_generating,finance_clearance,finance_cleared_at,finance_notes,prescreening_passed,prescreening_checks,prescreening_ran_at,revision_count,revision_requested_from,community_validated,community_validation_notes,community_validated_at,informed_by_proposals,created_at,updated_at,barangay_id,barangays(name),proposal_sdg_alignment(sdg_number,indicator)";
const proposalCreateResultSchema = z.object({
  id: z.string().uuid(),
  status: z.literal("draft"),
  recommendationProvenance: z.object({
    linked: z.literal(true),
    linkCount: z.number().int().min(1).max(2),
  }).strict().nullable(),
}).strict();

// Read-only gate for endpoints that should be visible to Finance Officers
// and partner accounts (so they can see their own submissions). The GET handler
// filters to own rows for partners.
export async function GET() {
  const auth = await authorizeAnyCapability(["proposal.read", "legacy_partner.history.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!hasCapability(auth.actor.role, auth.actor.permissions, "proposal.read")) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("project_proposals")
      .select("id, title, status, created_at")
      .eq("created_by", auth.actor.id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Historical proposals could not be loaded" }, { status: 500 });
    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: auth.actor.id,
      user_email: auth.actor.email,
      action: "proposal.legacy_history.read",
      resource_type: "project_proposal_collection",
      resource_id: null,
      level: "info",
      metadata: { result_count: (data ?? []).length },
    });
    if (auditError) return NextResponse.json({ error: "Historical proposal access could not be audited" }, { status: 500 });
    return NextResponse.json({ data });
  }

  const admin = createAdminClient();
  const query = admin
    .from("project_proposals")
    .select(PROPOSAL_LIST_FIELDS)
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error("Proposal list query failed", { code: error.code });
    return NextResponse.json({ error: "Proposals could not be loaded" }, { status: 500 });
  }
  const { error: auditError } = await admin.from("audit_logs").insert({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: "proposal.list.read",
    resource_type: "project_proposal_collection",
    resource_id: null,
    level: "info",
    metadata: { result_count: (data ?? []).length },
  });
  if (auditError) return NextResponse.json({ error: "Proposal list access could not be audited" }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await authorizeCapability("proposal.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const retired = await guardV1Mutation("proposals", auth.supabase);
  if (retired) return retired;

  const body = await request.json().catch(() => null);
  const parsed = parseProposalCreateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { sdg_alignments = [], recommendation_context: recommendationContext, ...meta } = parsed.data;

  const { data, error } = await auth.supabase.rpc("proposal_create_draft_graph", {
    p_proposal: meta,
    p_sdg_alignments: sdg_alignments,
    p_recommendation_context: recommendationContext ?? null,
  });

  if (error) {
    const status = error.code === "42501" ? 403
      : error.code === "40001" ? 409
        : error.code === "22023" ? 400
          : error.code === "23503" ? 422
            : 500;
    console.error("Proposal creation failed", { code: error.code });
    return NextResponse.json({ error: "The proposal could not be created" }, { status });
  }

  const result = proposalCreateResultSchema.safeParse(data);
  if (!result.success) {
    console.error("Proposal creation returned an invalid result");
    return NextResponse.json({ error: "The proposal returned an invalid result" }, { status: 500 });
  }

  return NextResponse.json({
    data: { id: result.data.id, status: result.data.status },
    recommendationProvenance: result.data.recommendationProvenance,
  }, { status: 201 });
}
