import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAnyCapability, authorizeCapability } from "@/lib/auth/authorize";
import { guardV1Mutation } from "@/lib/phase2/feature";
import { hasCapability } from "@/lib/auth/capabilities";
import { parseProposalCreateInput } from "@/lib/proposals/mutation-contracts";
import { NextResponse } from "next/server";

const PROPOSAL_LIST_FIELDS = "id,title,rationale,objectives,target_beneficiaries,expected_beneficiary_count,expected_output,timeline_start,timeline_end,budget,status,is_income_generating,finance_clearance,finance_cleared_at,finance_notes,prescreening_passed,prescreening_checks,prescreening_ran_at,revision_count,revision_requested_from,community_validated,community_validation_notes,community_validated_at,informed_by_proposals,created_at,updated_at,barangay_id,created_by,barangays(name),proposal_sdg_alignment(sdg_number,indicator)";
const PROPOSAL_WRITE_FIELDS = "id,title,rationale,objectives,target_beneficiaries,expected_beneficiary_count,expected_output,timeline_start,timeline_end,budget,status,is_income_generating,informed_by_proposals,created_at,updated_at,barangay_id,created_by";

// Looser read-only gate for endpoints that should be visible to Finance Officers
// and partner accounts (so they can see their own submissions). The GET handler
// filters to own rows for partners.
export async function GET() {
  const auth = await authorizeAnyCapability(["proposal.read", "legacy_partner.history.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!hasCapability(auth.actor.role, auth.actor.permissions, "proposal.read")) {
    const { data, error } = await createAdminClient()
      .from("project_proposals")
      .select("id, title, status, created_at")
      .eq("created_by", auth.actor.id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Historical proposals could not be loaded" }, { status: 500 });
    return NextResponse.json({ data });
  }

  const query = createAdminClient()
    .from("project_proposals")
    .select(PROPOSAL_LIST_FIELDS)
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error("Proposal list query failed", { code: error.code });
    return NextResponse.json({ error: "Proposals could not be loaded" }, { status: 500 });
  }
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

  // Role is already verified above via canSubmitProposal(). Use the admin client
  // for the write so the insert isn't blocked by RLS policies written before the
  // role expansion (R-1 / R-6) added paraya_director, partner roles, etc.
  const admin = createAdminClient();

  let verifiedSnapshotId: string | null = null;
  if (recommendationContext) {
    const { data: need, error: needError } = await admin.from("community_needs")
      .select("id,barangay_id,approval_status")
      .eq("id", recommendationContext.need_id)
      .maybeSingle();
    if (needError) return NextResponse.json({ error: "Recommendation provenance could not be verified" }, { status: 500 });
    if (!need || need.approval_status !== "approved" || !meta.barangay_id || need.barangay_id !== meta.barangay_id) {
      return NextResponse.json({ error: "The recommendation need is not approved for the selected barangay" }, { status: 422 });
    }
    if (recommendationContext.evidence_snapshot_id) {
      const { data: snapshot, error: snapshotError } = await admin.from("profiling_evidence_snapshots")
        .select("id,cycle_id,aggregate_schema_version")
        .eq("id", recommendationContext.evidence_snapshot_id)
        .maybeSingle();
      if (snapshotError) return NextResponse.json({ error: "Recommendation provenance could not be verified" }, { status: 500 });
      const cycleResult = snapshot
        ? await admin.from("profiling_cycles").select("id,barangay_id,status").eq("id", snapshot.cycle_id).maybeSingle()
        : { data: null, error: null };
      if (cycleResult.error) return NextResponse.json({ error: "Recommendation provenance could not be verified" }, { status: 500 });
      if (!snapshot || snapshot.aggregate_schema_version !== "agape.profiling.aggregate.v2"
        || !cycleResult.data || !["completed", "archived"].includes(cycleResult.data.status)
        || cycleResult.data.barangay_id !== meta.barangay_id) {
        return NextResponse.json({ error: "The recommendation evidence is not a completed approved snapshot for the selected barangay" }, { status: 422 });
      }
      verifiedSnapshotId = snapshot.id;
    }
  }

  const { data: proposal, error } = await admin
    .from("project_proposals")
    .insert({ ...meta, status: "draft", created_by: auth.actor.id })
    .select(PROPOSAL_WRITE_FIELDS)
    .single();

  if (error) {
    console.error("Proposal creation failed", { code: error.code });
    return NextResponse.json({ error: "The proposal could not be created" }, { status: 500 });
  }

  if (sdg_alignments.length > 0) {
    const { error: sdgError } = await admin.from("proposal_sdg_alignment").insert(
      sdg_alignments.map((a) => ({
        proposal_id: proposal.id,
        sdg_number:  a.sdg_number,
        indicator:   a.indicator ?? null,
      }))
    );
    if (sdgError) {
      const { error: cleanupError } = await admin
        .from("project_proposals")
        .delete()
        .eq("id", proposal.id)
        .eq("status", "draft");
      console.error("Proposal SDG creation failed", {
        proposalId: proposal.id,
        code: sdgError.code,
        cleanupFailed: Boolean(cleanupError),
      });
      return NextResponse.json(
        { error: "The proposal could not be created with its SDG alignments." },
        { status: 500 },
      );
    }
  }

  if (recommendationContext) {
    const rationale = `Preserved from advisory recommendation ${recommendationContext.recommendation_fingerprint}; the officer explicitly created this draft.`;
    const links = [
      {
        proposal_id: proposal.id,
        source_type: "community_need",
        source_id: recommendationContext.need_id,
        provenance_kind: "advisory_planning",
        rationale,
        linked_by: auth.actor.id,
      },
      ...(verifiedSnapshotId ? [{
        proposal_id: proposal.id,
        source_type: "profiling_evidence_snapshot",
        source_id: verifiedSnapshotId,
        provenance_kind: "advisory_planning",
        rationale,
        linked_by: auth.actor.id,
      }] : []),
    ];
    const { error: provenanceError } = await admin.from("proposal_validation_links").insert(links);
    if (provenanceError) {
      const { error: sdgCleanupError } = await admin.from("proposal_sdg_alignment").delete().eq("proposal_id", proposal.id);
      const { error: proposalCleanupError } = await admin.from("project_proposals").delete().eq("id", proposal.id).eq("status", "draft");
      console.error("Recommendation provenance creation failed", {
        proposalId: proposal.id,
        code: provenanceError.code,
        cleanupFailed: Boolean(sdgCleanupError || proposalCleanupError),
      });
      return NextResponse.json({ error: "The proposal could not be created with its recommendation provenance" }, { status: 500 });
    }
  }

  return NextResponse.json({
    data: proposal,
    recommendationProvenance: recommendationContext
      ? { linked: true, linkCount: verifiedSnapshotId ? 2 : 1 }
      : null,
  }, { status: 201 });
}
