import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  advisoryRecommendationResponseSchema,
  buildAdvisoryRecommendations,
} from "../../src/lib/ai/advisory-recommendations.ts";
import { assessProposalAlignment } from "../../src/lib/ai/proposal-alignment.ts";

const NEED = {
  id: "10000000-0000-4000-8000-000000000001",
  barangayId: "20000000-0000-4000-8000-000000000001",
  barangayName: "Synthetic Barangay",
  status: "identified",
  identifiedDate: "2026-08-20",
  plannedProposalCount: 0,
  activeProgramCount: 0,
  activeFullProgramCount: 0,
  completedProgramCount: 0,
  profilingEvidence: null,
  historicalBenchmark: null,
};

test("advisory engine ranks uncovered approved needs and excludes active coverage", () => {
  const result = buildAdvisoryRecommendations({
    now: new Date("2026-08-27T00:00:00.000Z"),
    needs: [
      { ...NEED, category: "education", priorityScore: 4, plannedProposalCount: 1 },
      { ...NEED, id: "10000000-0000-4000-8000-000000000002", category: "health", priorityScore: 5 },
      { ...NEED, id: "10000000-0000-4000-8000-000000000003", category: "livelihood", priorityScore: 5, activeProgramCount: 1, activeFullProgramCount: 1 },
    ],
  });

  assert.equal(result.schema, "agape.ai.need-recommendations.v2");
  assert.equal(result.advisoryOnly, true);
  assert.deepEqual(result.summary, {
    approvedOpenNeeds: 3,
    unaddressedNeeds: 1,
    needsWithPlannedResponses: 1,
    needsWithActivePrograms: 1,
    needsWithPartialActiveCoverage: 0,
    needsWithFullActiveCoverage: 1,
    recommendationCount: 2,
  });
  assert.equal(result.recommendations[0].category, "health");
  assert.equal(result.recommendations[0].priority.label, "critical");
  assert.equal(result.recommendations[0].action, "develop_response");
  assert.equal(result.recommendations[0].alternatives.length, 3);
  assert.equal(result.recommendations[0].alternatives[0].code, result.recommendations[0].intervention.code);
  assert.equal(result.recommendations[0].indicativeResources.length, 3);
  assert.match(result.recommendations[0].recommendationFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(result.recommendations[0].review.status, "open");
  assert.equal(result.scope.canReview, false);
  assert.equal(result.recommendations[1].action, "review_planned_response");
  assert.equal(result.recommendations.some((item) => item.category === "livelihood"), false);
  assert.equal(advisoryRecommendationResponseSchema.safeParse(result).success, true);
});

test("recommendation fingerprints change only when material planning inputs change", () => {
  const first = buildAdvisoryRecommendations({
    now: new Date("2026-08-27T00:00:00.000Z"),
    needs: [{ ...NEED, category: "health", priorityScore: 4 }],
  });
  const nextDay = buildAdvisoryRecommendations({
    now: new Date("2026-08-28T00:00:00.000Z"),
    needs: [{ ...NEED, category: "health", priorityScore: 4 }],
  });
  const changed = buildAdvisoryRecommendations({
    now: new Date("2026-08-28T00:00:00.000Z"),
    needs: [{ ...NEED, category: "health", priorityScore: 5 }],
  });
  assert.equal(first.recommendations[0].recommendationFingerprint, nextDay.recommendations[0].recommendationFingerprint);
  assert.notEqual(first.recommendations[0].recommendationFingerprint, changed.recommendations[0].recommendationFingerprint);
});

test("recommendation review timestamps accept PostgreSQL UTC offsets", () => {
  const result = buildAdvisoryRecommendations({
    needs: [{ ...NEED, category: "health", priorityScore: 4 }],
  });
  const reviewed = structuredClone(result);
  reviewed.recommendations[0].review = {
    status: "endorsed",
    lastAction: "endorsed",
    reasonCode: null,
    reviewedAt: "2026-08-27T10:15:30.123456+00:00",
    reviewedBy: { id: "f2200000-0000-4000-8000-000000000004", name: "Synthetic Researcher" },
  };
  assert.equal(advisoryRecommendationResponseSchema.safeParse(reviewed).success, true);
});

test("partial active coverage remains visible while full active coverage suppresses duplicate work", () => {
  const result = buildAdvisoryRecommendations({
    needs: [
      { ...NEED, category: "health", priorityScore: 5, activeProgramCount: 1, activeFullProgramCount: 0 },
      { ...NEED, id: "10000000-0000-4000-8000-000000000004", category: "education", priorityScore: 5, activeProgramCount: 1, activeFullProgramCount: 1 },
    ],
  });
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].coverage.state, "partial_active");
  assert.equal(result.recommendations[0].coverage.activePartialPrograms, 1);
  assert.equal(result.recommendations[0].action, "review_active_gap");
  assert.match(result.recommendations[0].rationale, /recorded coverage is partial/);
  assert.equal(result.summary.needsWithPartialActiveCoverage, 1);
  assert.equal(result.summary.needsWithFullActiveCoverage, 1);
});

test("advisory engine uses a conservative default when priority evidence is missing", () => {
  const result = buildAdvisoryRecommendations({
    needs: [{ ...NEED, category: "environment", priorityScore: null, completedProgramCount: 2 }],
  });
  assert.equal(result.recommendations[0].priority.score, 3);
  assert.equal(result.recommendations[0].confidence, "medium");
  assert.match(result.recommendations[0].rationale, /2 completed related programs are recorded/);
  assert.deepEqual(result.recommendations[0].suggestedSdgs, [6, 11, 13]);
});

test("recommendations cite only de-identified profiling provenance and suppression-safe counts", () => {
  const profilingEvidence = {
    evidenceSnapshotId: "30000000-0000-4000-8000-000000000001",
    cycleId: "30000000-0000-4000-8000-000000000002",
    cycleName: "Synthetic Completed Cycle",
    reportingDate: "2026-07-31",
    sampleMethod: "systematic",
    approvedHouseholds: 20,
    approvedResidents: 75,
    coveragePercent: 80,
    responseRatePercent: 90,
    needCount: { suppressed: true, value: null, label: "<5" },
    dataQuality: { pendingPackages: 0, returnedPackages: 0, excludedPackages: 1, unresolvedDuplicates: 0 },
  };
  const result = buildAdvisoryRecommendations({
    needs: [{ ...NEED, category: "environment", priorityScore: 4, profilingEvidence }],
  });
  assert.deepEqual(result.recommendations[0].evidence.profiling, profilingEvidence);
  assert.equal(result.recommendations[0].evidence.profiling.needCount.value, null);
  assert.equal(result.recommendations[0].evidence.profiling.needCount.label, "<5");
  assert.equal("cells" in result.recommendations[0].evidence.profiling, false);
});

test("verified history produces bounded budget and volunteer ranges without inventing sparse estimates", () => {
  const result = buildAdvisoryRecommendations({
    now: new Date("2026-08-27T00:00:00.000Z"),
    needs: [{
      ...NEED,
      category: "education",
      priorityScore: 4,
      historicalBenchmark: {
        matchedRecords: 3,
        budgetTotals: [2500, 1000, 1800],
        volunteerCounts: [12, 5, 8],
        windowStart: "2021-08-27",
        asOfDate: "2026-08-27",
      },
    }],
  });
  assert.deepEqual(result.recommendations[0].planningBenchmarks.budgetRange, { low: "1000.00", high: "2500.00", currency: "PHP" });
  assert.deepEqual(result.recommendations[0].planningBenchmarks.volunteerRange, { low: 5, high: 12 });
  assert.equal(result.recommendations[0].planningBenchmarks.confidence, "moderate");

  const sparse = buildAdvisoryRecommendations({
    needs: [{ ...NEED, category: "education", priorityScore: 4, historicalBenchmark: { matchedRecords: 1, budgetTotals: [1000], volunteerCounts: [5], windowStart: "2021-08-27", asOfDate: "2026-08-27" } }],
  });
  assert.equal(sparse.recommendations[0].planningBenchmarks.budgetRange, null);
  assert.equal(sparse.recommendations[0].planningBenchmarks.volunteerRange, null);
  assert.equal(sparse.recommendations[0].planningBenchmarks.confidence, "limited");
});

test("advisory response rejects extra or resident-identifying fields", () => {
  const result = buildAdvisoryRecommendations({
    needs: [{ ...NEED, category: "infrastructure", priorityScore: 4 }],
  });
  const unsafe = structuredClone(result);
  unsafe.recommendations[0].residentName = "Forbidden resident canary";
  assert.equal(advisoryRecommendationResponseSchema.safeParse(unsafe).success, false);
});

test("recommendation API is capability-gated, allowlisted, audited, and read-only", () => {
  const route = readFileSync("src/app/api/ai/recommendations/route.ts", "utf8");
  assert.match(route, /authorizeCapability\("analytics\.aggregate\.read"\)/);
  assert.match(route, /hasCapability\(auth\.actor\.role, auth\.actor\.permissions, "ai\.assist"\)/);
  assert.match(route, /\.eq\("approval_status", "approved"\)/);
  assert.match(route, /\.neq\("status", "addressed"\)/);
  assert.match(route, /ai\.advisory_recommendations\.read/);
  assert.match(route, /isMissingOptionalPhase2Relation/);
  assert.match(route, /intended_coverage/);
  assert.match(route, /activeFullProgramCount/);
  assert.match(route, /validateProfilingAggregateDTO/);
  assert.match(route, /aggregate_schema_version", "agape\.profiling\.aggregate\.v2/);
  assert.match(route, /cell\.dimension === "needs"/);
  assert.match(route, /isPhase2ComponentEnabled\("historical_programs"\)/);
  assert.match(route, /\.in\("quality", \["complete", "partial_verified"\]\)/);
  assert.match(route, /\.select\("category,budget_total,volunteer_count,quality,status,starts_on,data_mode"\)/);
  assert.match(route, /\.from\("ai_recommendation_reviews"\)/);
  assert.match(route, /event_sequence,recommendation_fingerprint,action,reason_code,actor_id,created_at/);
  assert.match(route, /status: isCurrent \? storedReview\.action : "stale"/);
  assert.match(route, /"ai\.recommendation\.review"/);
  assert.doesNotMatch(route, /select\(["'`]\*["'`]\)/);
  assert.doesNotMatch(route, /need_description|resident_name|contact|receipt|storage_path|profiling_resident_versions|profiling_household_versions/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.doesNotMatch(route, /anthropic|generativelanguage|openai|googleapis/i);
});

test("recommendation review is capability-gated, strict, append-only, and cannot transition proposals", () => {
  const route = readFileSync("src/app/api/ai/recommendations/reviews/route.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260818000950_phase3_recommendation_review_state.sql", "utf8");
  const scopes = JSON.parse(readFileSync("supabase/database-gate-scopes.json", "utf8"));
  assert.match(route, /authorizeCapability\("ai\.recommendation\.review"\)/);
  assert.match(route, /recommendationFingerprint: z\.string\(\)\.regex/);
  assert.match(route, /Dismissal requires a reason/);
  assert.match(route, /phase3_record_recommendation_review/);
  assert.match(migration, /CREATE TABLE public\.ai_recommendation_reviews/);
  assert.match(migration, /ai_recommendation_reviews_immutable/);
  assert.match(migration, /phase2_current_has_capability\('ai\.recommendation\.review'\)/);
  assert.match(migration, /approval_status<>'approved' OR need\.status='addressed'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase3_record_recommendation_review\(uuid,text,text,text\) FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.phase3_record_recommendation_review\(uuid,text,text,text\) TO authenticated/);
  assert.doesNotMatch(route, /proposal|advance|approve|reject|submit/i);
  assert.equal(scopes.scopes.phase1.migrationNames.includes("20260818000950_phase3_recommendation_review_state.sql"), false);
  assert.equal(scopes.scopes.phase2.migrationNames.at(-1), "20260818000950_phase3_recommendation_review_state.sql");
});

test("recommendation interface clearly remains advisory and is reachable from Analytics", () => {
  const page = readFileSync("src/app/(dashboard)/officer/analytics/recommendations/page.tsx", "utf8");
  const sidebar = readFileSync("src/components/layout/Sidebar.tsx", "utf8");
  assert.match(page, /Advisory only/);
  assert.match(page, /do not create or change proposals/);
  assert.match(page, /\/api\/ai\/recommendations/);
  assert.match(page, /Prepare a proposal draft/);
  assert.match(page, /recommendation\.action === "develop_response"/);
  assert.match(page, /Review proposal pipeline/);
  assert.match(page, /Review active coverage/);
  assert.match(page, /Partial active coverage/);
  assert.match(page, /Approved profiling context/);
  assert.match(page, /Small cells remain suppressed and have no drill-through/);
  assert.match(page, /Ranked alternatives/);
  assert.match(page, /Indicative resources/);
  assert.match(page, /Verified five-year history benchmark/);
  assert.match(page, /insufficient comparable values/);
  assert.match(page, /recommendation-review-controls/);
  assert.match(page, /Select a reason only when dismissing/);
  assert.match(page, /Endorsement and dismissal are advisory review records only/);
  assert.match(page, /Showing \{visibleRecommendations\.length\} of \{data\.recommendations\.length\} recommendations/);
  assert.match(page, /No recommendations match these filters/);
  assert.match(sidebar, /\/officer\/analytics\/recommendations/);
  assert.match(sidebar, /capabilities: \["analytics\.aggregate\.read", "ai\.assist"\]/);
  assert.match(sidebar, /c\.capabilities\.every/);
  const proposals = readFileSync("src/app/(dashboard)/officer/proposals/page.tsx", "utf8");
  assert.match(proposals, /searchParams\.get\("from_need"\)/);
  assert.match(proposals, /Review and edit every field before saving/);
  assert.match(proposals, /suggestedSdgs\.filter/);
  assert.doesNotMatch(proposals, /from_need[\s\S]{0,1000}(POST|\/advance)/);
});

test("legacy proposal reads use the canonical allowlisted fields needed by the working interface", () => {
  const listRoute = readFileSync("src/app/api/proposals/route.ts", "utf8");
  const detailRoute = readFileSync("src/app/api/proposals/[id]/route.ts", "utf8");
  for (const source of [listRoute, detailRoute]) {
    assert.match(source, /rationale/);
    assert.match(source, /timeline_start/);
    assert.match(source, /target_beneficiaries/);
    assert.doesNotMatch(source, /select\(\s*["'`]\*/);
  }
  assert.doesNotMatch(listRoute, /proposed_date|estimated_beneficiaries/);
  assert.doesNotMatch(detailRoute, /proposal_sdg_alignment\(\*\)|proposal_reviews\(\*/);
  const proposalsPage = readFileSync("src/app/(dashboard)/officer/proposals/page.tsx", "utf8");
  assert.match(proposalsPage, /expected_beneficiary_count/);
  assert.match(proposalsPage, /Use a completed profiling aggregate when available/);
});

test("proposal alignment remains advisory and reports actionable draft gaps", () => {
  const result = assessProposalAlignment({
    title: "Learning support",
    rationale: "Approved education evidence shows that targeted support should be considered.",
    objectives: "Improve access to guided learning activities.",
    targetBeneficiaries: "Selected learners",
    expectedBeneficiaryCount: 40,
    expectedOutput: "Conduct structured learning sessions.",
    timelineStart: "2026-09-01",
    timelineEnd: "2026-09-30",
    budget: 0,
    barangayId: "20000000-0000-4000-8000-000000000001",
    isIncomeGenerating: false,
    sdgs: [4],
    priorInitiativeCount: 1,
  });
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.schema, "agape.ai.proposal-alignment.v2");
  assert.equal(result.overall, "recommended");
  assert.equal(result.dimensions.length, 8);
  assert.equal(result.dimensions.find((item) => item.code === "beneficiary_fit")?.rating, "strong");
  assert.equal(result.dimensions.find((item) => item.code === "institutional_alignment")?.rating, "insufficient_evidence");
  assert.equal("score" in result, false);

  const incomplete = assessProposalAlignment({
    title: "",
    rationale: "",
    objectives: "",
    targetBeneficiaries: "",
    expectedBeneficiaryCount: null,
    expectedOutput: "",
    timelineStart: "",
    timelineEnd: "",
    budget: null,
    barangayId: null,
    isIncomeGenerating: true,
    sdgs: [],
    priorInitiativeCount: 0,
  });
  assert.equal(incomplete.overall, "not_recommended");
  assert.equal(incomplete.priorityActions.length, 8);
  assert.match(incomplete.priorityActions.join(" "), /Confirm scope and policy with the Director instead of relying on automation/);
  assert.match(incomplete.limitations.join(" "), /never rejects or changes the proposal workflow automatically/);
});

test("proposal alignment exposes all approved dimensions as textual evidence rather than one score", () => {
  const source = readFileSync("src/lib/ai/proposal-alignment.ts", "utf8");
  const page = readFileSync("src/app/(dashboard)/officer/proposals/page.tsx", "utf8");
  for (const dimension of [
    "community_need",
    "beneficiary_fit",
    "implementation_feasibility",
    "sdg_alignment",
    "resource_feasibility",
    "institutional_alignment",
    "previous_program_evidence",
    "policy_scope",
  ]) assert.match(source, new RegExp(`"${dimension}"`));
  assert.match(source, /strong/);
  assert.match(source, /moderate/);
  assert.match(source, /weak/);
  assert.match(source, /insufficient_evidence/);
  assert.match(page, /alignment\.dimensions\.map/);
  assert.doesNotMatch(page, /Score \{alignment\.score\}/);
});

test("forward proposal correction supplies beneficiary count and the complete SDG catalog", () => {
  const migration = readFileSync("supabase/migrations/20260818000930_phase2_proposal_compatibility_correction.sql", "utf8");
  const scopes = JSON.parse(readFileSync("supabase/database-gate-scopes.json", "utf8"));
  const proposals = readFileSync("src/app/(dashboard)/officer/proposals/page.tsx", "utf8");
  assert.match(migration, /^--[\s\S]*\bBEGIN;/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS expected_beneficiary_count integer/);
  assert.match(migration, /CHECK \(sdg_number BETWEEN 1 AND 17\)/);
  assert.match(migration, /CHECK \(sdg_goal BETWEEN 1 AND 17\)/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.equal(scopes.scopes.phase1.migrationNames.includes("20260818000930_phase2_proposal_compatibility_correction.sql"), false);
  assert.equal(scopes.scopes.phase2.migrationNames.includes("20260818000930_phase2_proposal_compatibility_correction.sql"), true);
  assert.equal(scopes.scopes.phase2.migrationNames.includes("20260818000940_phase2_beneficiary_evidence_options.sql"), true);
  for (let sdg = 1; sdg <= 17; sdg += 1) assert.match(proposals, new RegExp(`\\{ n: ${sdg},`));
});

test("officer dashboard surfaces advisory counts without making workflow decisions", () => {
  const dashboard = readFileSync("src/app/(dashboard)/officer/page.tsx", "utf8");
  assert.match(dashboard, /fetch\("\/api\/ai\/recommendations"/);
  assert.match(dashboard, /approved need\{recommendations\.summary\.recommendationCount === 1/);
  assert.match(dashboard, /Review recommendations/);
  assert.doesNotMatch(dashboard, /\/advance|director_approve|finance_clear/);
});
