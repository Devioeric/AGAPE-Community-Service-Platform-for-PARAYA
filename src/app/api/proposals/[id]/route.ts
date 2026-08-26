import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCapability } from "@/lib/auth/authorize";
import { guardV1Mutation } from "@/lib/phase2/feature";
import { hasCapability } from "@/lib/auth/capabilities";
import { parseProposalUpdateInput } from "@/lib/proposals/mutation-contracts";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

const PROPOSAL_DETAIL_FIELDS = "id,title,rationale,objectives,target_beneficiaries,expected_beneficiary_count,expected_output,timeline_start,timeline_end,budget,status,is_income_generating,finance_clearance,finance_cleared_at,finance_cleared_by,finance_notes,prescreening_passed,prescreening_checks,prescreening_ran_at,revision_count,revision_requested_from,community_validated,community_validation_notes,community_validated_at,community_validated_by,informed_by_proposals,created_at,updated_at,barangay_id,created_by,barangays(name),proposal_sdg_alignment(id,sdg_number,indicator),proposal_reviews(id,stage,decision,notes,reviewed_at,users!reviewer_id(full_name))";

/** Proposal content can only be edited by PARAYA while it is a draft or has
 * been explicitly returned for revision. Workflow state changes use /advance. */
async function resolveEditor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proposalId: string,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: self } = await supabase.from("users").select("role, permissions, status, is_active").eq("id", user.id).single();
  if (!self || self.status !== "active" || !self.is_active || !hasCapability(self.role, self.permissions, "proposal.create")) return null;

  const admin = createAdminClient();
  const { data: proposal } = await admin
    .from("project_proposals")
    .select("status")
    .eq("id", proposalId)
    .single();

  if (!proposal) return null;

  if (proposal.status !== "draft" && proposal.status !== "revisions_requested") return null;
  return { user, status: proposal.status as string };
}

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeCapability("proposal.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient();

  // Read access: PARAYA staff + Finance see anything. Legacy partner accounts
  // (and any submitter) can read proposals they themselves created — needed so
  // they can open the revision form when an officer sends back the proposal.
  const { data, error } = await admin
    .from("project_proposals")
    .select(PROPOSAL_DETAIL_FIELDS)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Proposal detail query failed", { proposalId: id, code: error.code });
    return NextResponse.json({ error: "Proposal details could not be loaded" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gateAuth = await authorizeCapability("proposal.create");
  if (!gateAuth.ok) return NextResponse.json({ error: gateAuth.error }, { status: gateAuth.status });
  const retired = await guardV1Mutation("proposals", gateAuth.supabase);
  if (retired) return retired;
  const supabase = await createClient();
  const { id } = await params;
  const ctx = await resolveEditor(supabase, id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = parseProposalUpdateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { sdg_alignments, ...meta } = parsed.data;

  // Use admin client for the write — role + ownership are already verified
  // and the RLS UPDATE policy may not cover every creator role.
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("phase0_update_proposal_content", {
      p_proposal_id: id,
      p_expected_status: ctx.status,
      p_patch: meta,
      p_sdg_alignments: Array.isArray(sdg_alignments) ? sdg_alignments : null,
    });

  if (error) {
    if (error.code === "40001") {
      return NextResponse.json(
        { error: "This proposal changed while you were editing it. Reload and try again." },
        { status: 409 },
      );
    }
    console.error("Proposal content transaction failed", {
      proposalId: id,
      code: error.code,
    });
    return NextResponse.json(
      { error: "The proposal changes could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json({ data, resubmitted: false });
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "Proposal hard deletion is disabled. Retain the record and use the audited workflow; archival will be added separately.",
    },
    { status: 405, headers: { Allow: "GET, PATCH" } },
  );
}
