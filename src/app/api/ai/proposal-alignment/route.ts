import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { assessProposalAlignment, proposalAlignmentRequestSchema } from "@/lib/ai/proposal-alignment";
import { recordAudit } from "@/lib/audit/log";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await authorizeCapability("proposal.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "ai.assist")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = proposalAlignmentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid proposal alignment request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [needResult, snapshotResult] = await Promise.all([
    parsed.data.evidence.approvedNeedId
      ? admin.from("community_needs")
          .select("id,barangay_id,approval_status")
          .eq("id", parsed.data.evidence.approvedNeedId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    parsed.data.evidence.profilingEvidenceSnapshotId
      ? admin.from("profiling_evidence_snapshots")
          .select("id,cycle_id,aggregate_schema_version")
          .eq("id", parsed.data.evidence.profilingEvidenceSnapshotId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (needResult.error || snapshotResult.error) {
    return NextResponse.json({ error: "Unable to verify proposal evidence" }, { status: 500 });
  }

  const approvedNeedEvidence = needResult.data !== null
    && needResult.data.approval_status === "approved"
    && (parsed.data.draft.barangayId === null || needResult.data.barangay_id === parsed.data.draft.barangayId);
  if (parsed.data.evidence.approvedNeedId && !approvedNeedEvidence) {
    return NextResponse.json({ error: "The community need is not approved for the selected barangay" }, { status: 422 });
  }

  let approvedAggregateEvidence = false;
  if (snapshotResult.data) {
    const cycleResult = await admin.from("profiling_cycles")
      .select("id,barangay_id,status")
      .eq("id", snapshotResult.data.cycle_id)
      .maybeSingle();
    if (cycleResult.error) {
      return NextResponse.json({ error: "Unable to verify proposal evidence" }, { status: 500 });
    }
    approvedAggregateEvidence = snapshotResult.data.aggregate_schema_version === "agape.profiling.aggregate.v2"
      && cycleResult.data !== null
      && ["completed", "archived"].includes(cycleResult.data.status)
      && (parsed.data.draft.barangayId === null || cycleResult.data.barangay_id === parsed.data.draft.barangayId);
  }
  if (parsed.data.evidence.profilingEvidenceSnapshotId && !approvedAggregateEvidence) {
    return NextResponse.json({ error: "The profiling evidence is not a completed approved snapshot for the selected barangay" }, { status: 422 });
  }

  const result = assessProposalAlignment({
    ...parsed.data.draft,
    approvedNeedEvidence,
    approvedAggregateEvidence,
  });
  const draftFingerprint = createHash("sha256")
    .update(JSON.stringify(parsed.data))
    .digest("hex");
  const auditWritten = await recordAudit({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: "ai.proposal_alignment.assessed",
    resource_type: "proposal_draft_aggregate",
    metadata: {
      schema: result.schema,
      draft_fingerprint: draftFingerprint,
      overall: result.overall,
      dimension_ratings: Object.fromEntries(result.dimensions.map((dimension) => [dimension.code, dimension.rating])),
      sdg_count: parsed.data.draft.sdgs.length,
      has_barangay: parsed.data.draft.barangayId !== null,
      prior_initiative_count: parsed.data.draft.priorInitiativeCount,
      approved_need_evidence: approvedNeedEvidence,
      approved_aggregate_evidence: approvedAggregateEvidence,
    },
  });
  if (!auditWritten) {
    return NextResponse.json({ error: "Unable to audit proposal alignment" }, { status: 503 });
  }

  return NextResponse.json(
    {
      data: result,
      assessment: {
        assessedAt: new Date().toISOString(),
        draftFingerprint,
      },
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
