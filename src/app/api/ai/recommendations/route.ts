import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { buildAdvisoryRecommendations } from "@/lib/ai/advisory-recommendations";
import { authorizeCapability } from "@/lib/auth/authorize";
import { hasCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  barangay_id: z.string().uuid().optional(),
}).strict();

const PLANNED_PROPOSAL_STATUSES = new Set([
  "submitted",
  "pre_screening",
  "sdg_review",
  "evidence_review",
  "finance_review",
  "director_review",
  "revisions_requested",
  "approved",
]);
const ACTIVE_PROGRAM_STATUSES = new Set(["planning", "upcoming", "active"]);

function isMissingOptionalPhase2Relation(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function queryObject(searchParams: URLSearchParams): Record<string, string> | null {
  const result: Record<string, string> = {};
  let hasDuplicate = false;
  searchParams.forEach((value, key) => {
    if (key in result) hasDuplicate = true;
    result[key] = value;
  });
  return hasDuplicate ? null : result;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

export async function GET(request: Request) {
  const auth = await authorizeCapability("analytics.aggregate.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasCapability(auth.actor.role, auth.actor.permissions, "ai.assist")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawQuery = queryObject(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json({ error: "Only one valid barangay_id may be supplied" }, { status: 400 });
  }

  const admin = createAdminClient();
  let needsQuery = admin
    .from("community_needs")
    .select("id,barangay_id,category,priority_score,status,identified_date,barangays(name)")
    .eq("approval_status", "approved")
    .neq("status", "addressed")
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(500);
  if (parsed.data.barangay_id) needsQuery = needsQuery.eq("barangay_id", parsed.data.barangay_id);

  const { data: needRows, error: needsError } = await needsQuery;
  if (needsError) {
    console.error("[ai-recommendations] approved need query failed", { code: needsError.code });
    return NextResponse.json({ error: "Unable to load approved community needs" }, { status: 500 });
  }

  const needIds = (needRows ?? []).map((row) => row.id);
  const proposalIdsByNeed = new Map<string, Set<string>>();
  const programIdsByNeed = new Map<string, Set<string>>();

  if (needIds.length > 0) {
    const [v2ProposalLinks, legacyProposalLinks, v2ProgramLinks] = await Promise.all([
      admin.from("proposal_need_links_v2").select("need_id,proposal_id").in("need_id", needIds),
      admin.from("proposal_validation_links").select("source_id,proposal_id").eq("source_type", "community_need").in("source_id", needIds),
      admin.from("program_need_links_v2").select("need_id,program_id").in("need_id", needIds),
    ]);
    const linkError = legacyProposalLinks.error
      ?? (v2ProposalLinks.error && !isMissingOptionalPhase2Relation(v2ProposalLinks.error) ? v2ProposalLinks.error : null)
      ?? (v2ProgramLinks.error && !isMissingOptionalPhase2Relation(v2ProgramLinks.error) ? v2ProgramLinks.error : null);
    if (linkError) {
      console.error("[ai-recommendations] coverage link query failed", { code: linkError.code });
      return NextResponse.json({ error: "Unable to evaluate project coverage" }, { status: 500 });
    }

    for (const link of v2ProposalLinks.data ?? []) addToSetMap(proposalIdsByNeed, link.need_id, link.proposal_id);
    for (const link of legacyProposalLinks.data ?? []) addToSetMap(proposalIdsByNeed, link.source_id, link.proposal_id);
    for (const link of v2ProgramLinks.data ?? []) addToSetMap(programIdsByNeed, link.need_id, link.program_id);
  }

  const proposalIds = Array.from(new Set(Array.from(proposalIdsByNeed.values()).flatMap((ids) => Array.from(ids))));
  const proposalStatuses = new Map<string, string>();
  if (proposalIds.length > 0) {
    const [proposalsResult, profilesResult, legacyProgramsResult] = await Promise.all([
      admin.from("project_proposals").select("id,status").in("id", proposalIds),
      admin.from("proposal_v2_profiles").select("proposal_id,workflow_status").in("proposal_id", proposalIds),
      admin.from("programs").select("id,proposal_id").in("proposal_id", proposalIds),
    ]);
    const proposalError = proposalsResult.error
      ?? legacyProgramsResult.error
      ?? (profilesResult.error && !isMissingOptionalPhase2Relation(profilesResult.error) ? profilesResult.error : null);
    if (proposalError) {
      console.error("[ai-recommendations] proposal coverage query failed", { code: proposalError.code });
      return NextResponse.json({ error: "Unable to evaluate proposal coverage" }, { status: 500 });
    }

    for (const proposal of proposalsResult.data ?? []) proposalStatuses.set(proposal.id, proposal.status);
    for (const profile of profilesResult.data ?? []) proposalStatuses.set(profile.proposal_id, profile.workflow_status);
    for (const program of legacyProgramsResult.data ?? []) {
      if (!program.proposal_id) continue;
      proposalIdsByNeed.forEach((linkedProposals, needId) => {
        if (linkedProposals.has(program.proposal_id)) addToSetMap(programIdsByNeed, needId, program.id);
      });
    }
  }

  const allProgramIds = Array.from(new Set(Array.from(programIdsByNeed.values()).flatMap((ids) => Array.from(ids))));
  const programStatuses = new Map<string, string>();
  if (allProgramIds.length > 0) {
    const { data, error } = await admin.from("programs").select("id,status").in("id", allProgramIds);
    if (error) {
      console.error("[ai-recommendations] program coverage query failed", { code: error.code });
      return NextResponse.json({ error: "Unable to evaluate program coverage" }, { status: 500 });
    }
    for (const program of data ?? []) programStatuses.set(program.id, program.status);
  }

  const result = buildAdvisoryRecommendations({
    barangayId: parsed.data.barangay_id ?? null,
    needs: (needRows ?? []).map((need) => {
      const relatedProposalIds = proposalIdsByNeed.get(need.id) ?? new Set<string>();
      const relatedProgramIds = programIdsByNeed.get(need.id) ?? new Set<string>();
      const barangay = need.barangays as unknown as { name: string } | null;
      return {
        id: need.id,
        barangayId: need.barangay_id,
        barangayName: barangay?.name ?? "Unassigned barangay",
        category: need.category,
        priorityScore: need.priority_score === null ? null : Number(need.priority_score),
        status: need.status,
        identifiedDate: need.identified_date,
        plannedProposalCount: Array.from(relatedProposalIds).filter((id) => PLANNED_PROPOSAL_STATUSES.has(proposalStatuses.get(id) ?? "")).length,
        activeProgramCount: Array.from(relatedProgramIds).filter((id) => ACTIVE_PROGRAM_STATUSES.has(programStatuses.get(id) ?? "")).length,
        completedProgramCount: Array.from(relatedProgramIds).filter((id) => programStatuses.get(id) === "completed").length,
      };
    }),
  });

  const auditWritten = await recordAudit({
    user_id: auth.actor.id,
    user_email: auth.actor.email,
    action: "ai.advisory_recommendations.read",
    resource_type: "community_need_aggregate",
    resource_id: parsed.data.barangay_id ?? undefined,
    metadata: {
      scope: parsed.data.barangay_id ? "barangay" : "all_authorized",
      approved_open_needs: result.summary.approvedOpenNeeds,
      recommendations: result.summary.recommendationCount,
      schema: result.schema,
    },
  });
  if (!auditWritten) return NextResponse.json({ error: "Unable to audit recommendation access" }, { status: 503 });

  return NextResponse.json(
    { data: result },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
