import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { guardV1Mutation } from "@/lib/phase2/feature";
import { NextResponse } from "next/server";
import {
  runPrescreening,
  type ProposalForScreening,
} from "@/lib/proposals/prescreening";
import {
  authorizeProposalAction,
  normalizeProposalRevisionReturnStatus,
  parseProposalActionInput,
  PROPOSAL_PIPELINE,
} from "@/lib/proposals/workflow-policy";

type Ctx = { params: Promise<{ id: string }> };

type WorkflowReview = {
  stage: string;
  decision: string;
  notes?: string | null;
};

export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeAnyCapability(["proposal.create", "proposal.review", "proposal.finance", "proposal.decide"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const retired = await guardV1Mutation("proposals", auth.supabase);
  if (retired) return retired;
  const supabase = auth.supabase;
  const { id } = await params;
  const rawBody = await request.json().catch(() => null);
  const parsedBody = parseProposalActionInput(rawBody);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const body = parsedBody.data;

  const { data: proposal, error: proposalError } = await supabase
    .from("project_proposals")
    .select(`
      id, title, rationale, objectives, status, is_income_generating, finance_clearance,
      target_beneficiaries, budget, timeline_start, timeline_end,
      revision_count, revision_requested_from, community_validated,
      proposal_sdg_alignment(sdg_number)
    `)
    .eq("id", id)
    .single();

  if (proposalError || !proposal) {
    const notFound = proposalError?.code === "PGRST116";
    return NextResponse.json(
      { error: notFound ? "Proposal not found" : "Unable to load proposal" },
      { status: notFound ? 404 : 500 },
    );
  }

  const currentStatus = proposal.status as string;
  const expectedFinanceClearance = proposal.finance_clearance ?? false;
  const reviewerId = auth.actor.id;
  const authorization = authorizeProposalAction({
    ...body,
    role: auth.actor.role,
    currentStatus,
    financeClearance: expectedFinanceClearance,
  });
  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error ?? "Forbidden" },
      { status: authorization.httpStatus ?? 403 },
    );
  }

  const workflowDb = createAdminClient();

  async function applyWorkflowChange(
    patch: Record<string, unknown>,
    review?: WorkflowReview,
  ): Promise<NextResponse | null> {
    const { error } = await workflowDb.rpc(
      "phase0_apply_proposal_workflow_change",
      {
        p_proposal_id: id,
        p_expected_status: currentStatus,
        p_expected_finance_clearance: expectedFinanceClearance,
        p_patch: patch,
        p_reviewer_id: review ? reviewerId : null,
        p_review_stage: review?.stage ?? null,
        p_review_decision: review?.decision ?? null,
        p_review_notes: review?.notes ?? null,
      },
    );

    if (!error) return null;
    if (error.code === "40001") {
      return NextResponse.json(
        { error: "This proposal changed while you were reviewing it. Reload and try again." },
        { status: 409 },
      );
    }

    console.error("Proposal workflow transaction failed", {
      proposalId: id,
      action: body.action,
      code: error.code,
    });
    return NextResponse.json(
      { error: "The proposal workflow action could not be saved." },
      { status: 500 },
    );
  }

  if (body.action === "request_revisions") {
    const workflowError = await applyWorkflowChange(
      {
        status: "revisions_requested",
        revision_requested_from: currentStatus,
        ...(currentStatus === "finance_review"
          ? {
              finance_clearance: false,
              finance_cleared_at: null,
              finance_cleared_by: null,
              finance_notes: null,
            }
          : {}),
      },
      {
        stage: currentStatus,
        decision: "revisions_requested",
        notes: body.notes,
      },
    );
    if (workflowError) return workflowError;
    return NextResponse.json({ status: "revisions_requested" });
  }

  if (body.action === "resubmit") {
    const returnTo = normalizeProposalRevisionReturnStatus(
      proposal.revision_requested_from,
    );
    const workflowError = await applyWorkflowChange(
      {
        status: returnTo,
        revision_count: (proposal.revision_count ?? 0) + 1,
        revision_requested_from: null,
      },
      {
        stage: returnTo,
        decision: "resubmitted",
        notes: body.notes,
      },
    );
    if (workflowError) return workflowError;
    return NextResponse.json({ status: returnTo });
  }

  if (body.action === "mark_finance_cleared") {
    const workflowError = await applyWorkflowChange(
      {
        finance_clearance: true,
        finance_cleared_at: new Date().toISOString(),
        finance_cleared_by: reviewerId,
        finance_notes: body.finance_notes,
      },
      {
        stage: currentStatus,
        decision: "finance_cleared",
        notes: body.finance_notes,
      },
    );
    if (workflowError) return workflowError;
    return NextResponse.json({ success: true, finance_clearance: true });
  }

  if (body.action === "reject") {
    const workflowError = await applyWorkflowChange(
      { status: "rejected" },
      {
        stage: currentStatus,
        decision: "rejected",
        notes: body.notes,
      },
    );
    if (workflowError) return workflowError;
    return NextResponse.json({ status: "rejected" });
  }

  if (currentStatus === "draft") {
    const workflowError = await applyWorkflowChange(
      { status: "submitted" },
      {
        stage: "draft",
        decision: "submitted",
        notes: body.notes,
      },
    );
    if (workflowError) return workflowError;
    return NextResponse.json({ status: "submitted" });
  }

  const nextStatus = PROPOSAL_PIPELINE[currentStatus];
  if (!nextStatus) {
    return NextResponse.json(
      { error: "Cannot advance from this status" },
      { status: 400 },
    );
  }

  let screeningPatch: Record<string, unknown> = {};
  if (currentStatus === "pre_screening") {
    const sdgCount = Array.isArray(proposal.proposal_sdg_alignment)
      ? proposal.proposal_sdg_alignment.length
      : 0;
    const forScreening: ProposalForScreening = {
      title: proposal.title ?? "",
      rationale: proposal.rationale ?? null,
      objectives: proposal.objectives ?? null,
      target_beneficiaries: proposal.target_beneficiaries ?? null,
      budget: proposal.budget ?? null,
      is_income_generating: proposal.is_income_generating ?? false,
      timeline_start: proposal.timeline_start ?? null,
      timeline_end: proposal.timeline_end ?? null,
      sdg_count: sdgCount,
      community_validated: proposal.community_validated ?? false,
    };
    const result = runPrescreening(forScreening);

    screeningPatch = {
      prescreening_passed: result.passed,
      prescreening_checks: result.checks,
      prescreening_ran_at: new Date().toISOString(),
    };

    if (!result.passed) {
      const failed = result.checks.filter((check) => !check.passed);
      const workflowError = await applyWorkflowChange(
        screeningPatch,
        {
          stage: currentStatus,
          decision: "prescreening_failed",
          notes: `Failed checks: ${failed.map((check) => check.name).join(", ")}`,
        },
      );
      if (workflowError) return workflowError;
      return NextResponse.json(
        {
          error: "Pre-screening checks failed.",
          checks: result.checks,
          failedCount: failed.length,
        },
        { status: 422 },
      );
    }
  }

  const workflowError = await applyWorkflowChange(
    { ...screeningPatch, status: nextStatus },
    {
      stage: currentStatus,
      decision: "approved",
      notes: body.notes,
    },
  );
  if (workflowError) return workflowError;

  return NextResponse.json({ status: nextStatus });
}
