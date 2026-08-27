import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  advisoryRecommendationResponseSchema,
  buildAdvisoryRecommendations,
} from "../../src/lib/ai/advisory-recommendations.ts";
import {
  assessProposalAlignment,
  proposalAlignmentRequestSchema,
  proposalAlignmentResponseSchema,
} from "../../src/lib/ai/proposal-alignment.ts";

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
  recentCompletedProgramCount: 0,
  largestLinkedPlannedBeneficiaryCount: null,
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
    needsWithRecentCompletedPrograms: 0,
    automatedAlertCandidates: 2,
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
  assert.equal(result.recommendations[0].automation.eligible, true);
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

test("advisory engine distinguishes recent completed programs from older context", () => {
  const result = buildAdvisoryRecommendations({
    needs: [{ ...NEED, category: "environment", priorityScore: null, completedProgramCount: 3, recentCompletedProgramCount: 2 }],
  });
  assert.equal(result.recommendations[0].priority.score, 3);
  assert.equal(result.recommendations[0].confidence, "medium");
  assert.equal(result.recommendations[0].coverage.recentCompletedPrograms, 2);
  assert.equal(result.recommendations[0].coverage.olderOrUndatedCompletedPrograms, 1);
  assert.match(result.recommendations[0].rationale, /completed within the previous 24 months/);
  assert.match(result.recommendations[0].rationale, /older or undated completed record/);
  assert.deepEqual(result.recommendations[0].suggestedSdgs, [6, 11, 13]);
});

test("recent completed counts cannot exceed total completed history", () => {
  assert.throws(() => buildAdvisoryRecommendations({
    needs: [{ ...NEED, category: "health", priorityScore: 4, completedProgramCount: 0, recentCompletedProgramCount: 1 }],
  }), /Recent completed programs cannot exceed/);
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
  assert.equal(result.recommendations[0].coverage.estimate.status, "suppressed");
  assert.equal(result.recommendations[0].coverage.estimate.estimatedPercent, null);
  assert.equal("cells" in result.recommendations[0].evidence.profiling, false);
});

test("coverage estimates use the largest linked plan and always show underlying counts", () => {
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
    needCount: { suppressed: false, value: 40, label: "40" },
    dataQuality: { pendingPackages: 0, returnedPackages: 0, excludedPackages: 1, unresolvedDuplicates: 0 },
  };
  const result = buildAdvisoryRecommendations({
    needs: [{
      ...NEED,
      category: "education",
      priorityScore: 4,
      plannedProposalCount: 2,
      largestLinkedPlannedBeneficiaryCount: 15,
      profilingEvidence,
    }],
  });
  assert.deepEqual(result.recommendations[0].coverage.estimate, {
    status: "available",
    affectedCount: { suppressed: false, value: 40, label: "40" },
    plannedCount: 15,
    estimatedPercent: 37.5,
    confidence: "moderate",
    limitation: "This sample-based estimate compares the largest linked plan with the approved affected count. Linked plans are not summed because their beneficiaries may overlap; validate reach before deciding.",
  });
  assert.deepEqual(result.recommendations[0].beneficiaryGuidance, {
    categoryCode: "education",
    segmentLabel: "Learners or residents represented in the approved education-need aggregate",
    suggestedCount: 40,
    source: "approved_profile_aggregate",
    asOfDate: "2026-07-31",
    confidence: "moderate",
    limitation: "This count is an editable planning starting point from the approved profiled sample, not a census or promised project reach. Confirm the final target and document any override.",
  });
});

test("coverage estimates remain unavailable when a safe denominator or linked plan is missing", () => {
  const result = buildAdvisoryRecommendations({
    needs: [{ ...NEED, category: "health", priorityScore: 4, largestLinkedPlannedBeneficiaryCount: 10 }],
  });
  assert.equal(result.recommendations[0].coverage.estimate.status, "unavailable");
  assert.equal(result.recommendations[0].coverage.estimate.estimatedPercent, null);
  assert.match(result.recommendations[0].coverage.estimate.limitation, /No compatible unsuppressed/);
  assert.equal(result.recommendations[0].beneficiaryGuidance.suggestedCount, null);
  assert.equal(result.recommendations[0].beneficiaryGuidance.source, "approved_need_only");
});

test("weekly alert candidates are limited to high-priority insufficient gaps", () => {
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
    needCount: { suppressed: false, value: 40, label: "40" },
    dataQuality: { pendingPackages: 0, returnedPackages: 0, excludedPackages: 0, unresolvedDuplicates: 0 },
  };
  const result = buildAdvisoryRecommendations({
    sufficientCoveragePercent: 80,
    needs: [
      { ...NEED, category: "health", priorityScore: 3 },
      { ...NEED, id: "10000000-0000-4000-8000-000000000002", category: "education", priorityScore: 4, plannedProposalCount: 1, largestLinkedPlannedBeneficiaryCount: 35, profilingEvidence },
      { ...NEED, id: "10000000-0000-4000-8000-000000000003", category: "environment", priorityScore: 4, activeProgramCount: 1, largestLinkedPlannedBeneficiaryCount: 40, profilingEvidence },
    ],
  });
  const byCategory = new Map(result.recommendations.map((item) => [item.category, item]));
  assert.equal(byCategory.get("health").automation.reason, "lower_priority_manual_analysis");
  assert.equal(byCategory.get("health").automation.eligible, false);
  assert.equal(byCategory.get("education").coverage.estimate.estimatedPercent, 87.5);
  assert.equal(byCategory.get("education").automation.reason, "planned_coverage_at_or_above_threshold");
  assert.equal(byCategory.get("education").automation.eligible, false);
  assert.equal(byCategory.get("environment").automation.reason, "high_priority_partial_active_gap");
  assert.equal(byCategory.get("environment").automation.eligible, true);
  assert.equal(result.summary.automatedAlertCandidates, 1);
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
  assert.match(route, /planned_beneficiary_count/);
  assert.match(route, /source_proposal_need_link_id/);
  assert.match(route, /select\("id,status,end_date"\)/);
  assert.match(route, /setUTCMonth\(recentProgramWindowStartDate\.getUTCMonth\(\) - 24\)/);
  assert.match(route, /Math\.max\(\.\.\.plannedBeneficiaryCounts\)/);
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
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.match(route, /\.rpc\("phase3_sync_recommendation_notifications"/);
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
  assert.equal(scopes.scopes.phase2.migrationNames.includes("20260818000950_phase3_recommendation_review_state.sql"), true);
  assert.equal(scopes.scopes.phase2.migrationNames.includes("20260818000960_phase3_recommendation_notifications.sql"), true);
});

test("scheduled recommendation notices are disabled, mode-bound, deduplicated, and advisory-only", () => {
  const route = readFileSync("src/app/api/ai/recommendations/route.ts", "utf8");
  const feature = readFileSync("src/lib/ai/recommendation-automation.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260818000960_phase3_recommendation_notifications.sql", "utf8");
  const env = readFileSync(".env.example", "utf8");
  const vercel = readFileSync("vercel.json", "utf8");
  const notifications = readFileSync("src/app/api/notifications/route.ts", "utf8");
  assert.match(env, /^AGAPE_AI_RECOMMENDATION_AUTOMATION_ENABLED=false$/m);
  assert.match(env, /^AGAPE_AI_RECOMMENDATION_AUTOMATION_MODE=off$/m);
  assert.match(feature, /=== "true"/);
  assert.match(feature, /!== "off"/);
  assert.match(route, /requireCronAuth\(request\)/);
  assert.match(route, /phase3_sync_recommendation_notifications/);
  assert.match(route, /filter\(\(recommendation\) => recommendation\.automation\.eligible\)/);
  assert.match(route, /recommendationFingerprint/);
  assert.match(vercel, /\/api\/ai\/recommendations\?scheduled=true/);
  assert.match(migration, /UNIQUE\(need_id,recommendation_fingerprint,recipient_user_id\)/);
  assert.match(migration, /current_review_action='dismissed'/);
  assert.match(migration, /expected_priority='critical' OR current_review_action='endorsed'/);
  assert.match(migration, /u\.role IN\('paraya_researcher','paraya_associate'\)/);
  assert.match(migration, /is_synthetic_test IS DISTINCT FROM \(p_mode='synthetic'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase3_sync_recommendation_notifications\(text,jsonb\) FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.phase3_sync_recommendation_notifications\(text,jsonb\) TO service_role/);
  assert.doesNotMatch(route, /project_proposals[\s\S]{0,500}\.(insert|update|upsert)\(/);
  assert.doesNotMatch(route, /director_approve|finance_clear|\/advance/);
  assert.doesNotMatch(notifications, /\.select\("\*"\)/);
  assert.match(notifications, /markReadSchema/);
});

test("recommendation thresholds are Director-only, versioned, audited, and cannot enable automation", () => {
  const route = readFileSync("src/app/api/ai/recommendations/settings/route.ts", "utf8");
  const page = readFileSync("src/app/(dashboard)/officer/analytics/recommendations/page.tsx", "utf8");
  const migration = readFileSync("supabase/migrations/20260818000970_phase3_recommendation_settings.sql", "utf8");
  const scopes = JSON.parse(readFileSync("supabase/database-gate-scopes.json", "utf8"));
  assert.match(route, /authorizeCapability\("ai\.recommendation\.configure"\)/);
  assert.match(route, /recommendationSettingsUpdateSchema/);
  assert.match(route, /phase3_update_recommendation_settings/);
  assert.match(migration, /CREATE TABLE public\.ai_recommendation_settings/);
  assert.match(migration, /sufficient_coverage_percent BETWEEN 1 AND 100/);
  assert.match(migration, /actor\.role<>'paraya_director'/);
  assert.match(migration, /phase2_current_has_capability\('ai\.recommendation\.configure'\)/);
  assert.match(migration, /current_settings\.row_version<>p_expected_version/);
  assert.match(migration, /ai\.recommendation\.settings\.updated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase3_update_recommendation_settings\(integer,bigint\) FROM PUBLIC,anon/);
  assert.match(page, /Director alert threshold/);
  assert.match(page, /does not enable the weekly worker/);
  assert.doesNotMatch(route, /AGAPE_AI_RECOMMENDATION_AUTOMATION_ENABLED|proposal|submit|approve|reject/i);
  assert.equal(scopes.scopes.phase2.migrationNames.includes("20260818000970_phase3_recommendation_settings.sql"), true);
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
  assert.match(page, /Conservative planning coverage/);
  assert.match(page, /Largest linked plan/);
  assert.match(page, /Percentage suppressed for privacy/);
  assert.match(page, /Beneficiary planning guidance/);
  assert.match(page, /Weekly alert candidate/);
  assert.match(page, /Manual analysis only/);
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
  assert.match(proposalsPage, /recommendation\.action !== "develop_response"/);
  assert.match(proposalsPage, /recommendation\.beneficiaryGuidance\.segmentLabel/);
  assert.match(proposalsPage, /recommendation\.beneficiaryGuidance\.suggestedCount/);
  assert.match(proposalsPage, /Advisory draft starter — not saved/);
  assert.match(proposalsPage, /No proposal exists until you choose Save Draft/);
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
    approvedNeedEvidence: true,
    approvedAggregateEvidence: true,
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

  const proseOnly = assessProposalAlignment({
    title: "Learning support",
    rationale: "A detailed narrative describes a possible local education concern for review.",
    objectives: "Provide guided learning activities.",
    targetBeneficiaries: "Selected learners",
    expectedBeneficiaryCount: 40,
    expectedOutput: "Structured learning sessions",
    timelineStart: "2026-09-01",
    timelineEnd: "2026-09-30",
    budget: 0,
    barangayId: "20000000-0000-4000-8000-000000000001",
    isIncomeGenerating: false,
    sdgs: [4],
    priorInitiativeCount: 0,
  });
  assert.equal(proseOnly.dimensions.find((item) => item.code === "community_need")?.rating, "weak");
  assert.match(proseOnly.dimensions.find((item) => item.code === "community_need")?.finding ?? "", /No approved community-need/);
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

test("proposal alignment is server-validated, metadata-only audited, and cannot change workflow", () => {
  const route = readFileSync("src/app/api/ai/proposal-alignment/route.ts", "utf8");
  const page = readFileSync("src/app/(dashboard)/officer/proposals/page.tsx", "utf8");
  const validDraft = {
    title: "Synthetic learning support",
    rationale: "Approved aggregate evidence indicates a bounded education support need.",
    objectives: "Provide guided learning activities.",
    targetBeneficiaries: "Selected learners",
    expectedBeneficiaryCount: 40,
    expectedOutput: "Structured learning sessions",
    timelineStart: "2026-09-01",
    timelineEnd: "2026-09-30",
    budget: "0",
    barangayId: "20000000-0000-4000-8000-000000000001",
    isIncomeGenerating: false,
    sdgs: [4],
    priorInitiativeCount: 1,
  };

  const emptyEvidence = { approvedNeedId: null, profilingEvidenceSnapshotId: null };
  assert.equal(proposalAlignmentRequestSchema.safeParse({ draft: validDraft, evidence: emptyEvidence }).success, false, "money must remain a number in this bounded advisory request");
  assert.equal(proposalAlignmentRequestSchema.safeParse({ draft: { ...validDraft, budget: 0 }, evidence: emptyEvidence }).success, true);
  assert.equal(proposalAlignmentRequestSchema.safeParse({ draft: { ...validDraft, budget: 0 }, evidence: emptyEvidence, workflowAction: "approve" }).success, false);
  const assessmentResult = assessProposalAlignment({ ...validDraft, budget: 0 });
  assert.equal(proposalAlignmentResponseSchema.safeParse({
    data: assessmentResult,
    assessment: { assessedAt: "2026-08-27T10:00:00+08:00", draftFingerprint: "a".repeat(64) },
  }).success, true);
  assert.equal(proposalAlignmentResponseSchema.safeParse({
    data: assessmentResult,
    assessment: { assessedAt: "not-a-date", draftFingerprint: "a".repeat(64), rawDraft: validDraft },
  }).success, false);
  assert.match(route, /authorizeCapability\("proposal\.create"\)/);
  assert.match(route, /hasCapability\(auth\.actor\.role, auth\.actor\.permissions, "ai\.assist"\)/);
  assert.match(route, /proposalAlignmentRequestSchema\.safeParse/);
  assert.match(route, /\.select\("id,barangay_id,approval_status"\)/);
  assert.match(route, /\.select\("id,cycle_id,aggregate_schema_version"\)/);
  assert.match(route, /\.select\("id,barangay_id,status"\)/);
  assert.match(route, /approval_status === "approved"/);
  assert.match(route, /\["completed", "archived"\]\.includes/);
  assert.match(route, /approvedNeedEvidence/);
  assert.match(route, /approvedAggregateEvidence/);
  assert.doesNotMatch(route, /\.select\("\*"\)/);
  assert.match(route, /createHash\("sha256"\)/);
  assert.match(route, /ai\.proposal_alignment\.assessed/);
  assert.match(route, /dimension_ratings/);
  assert.match(route, /assessedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(route, /draftFingerprint/);
  assert.doesNotMatch(route, /rationale:\s*parsed|objectives:\s*parsed|targetBeneficiaries:\s*parsed/);
  assert.doesNotMatch(route, /\/advance|phase2_\w*workflow|director_approve|finance_clear|\.from\("project_proposals"\)\s*\.(?:insert|update)/i);
  assert.match(page, /fetch\("\/api\/ai\/proposal-alignment"/);
  assert.doesNotMatch(page, /setAlignment\(assessProposalAlignment/);
  assert.match(page, /Outdated after edits/);
  assert.match(page, /Recheck edited draft/);
  assert.match(page, /This result describes an earlier version of the draft/);
});

test("explicit draft creation preserves verified recommendation provenance without advancing workflow", () => {
  const proposalRoute = readFileSync("src/app/api/proposals/route.ts", "utf8");
  const proposalCreateRoute = proposalRoute.slice(proposalRoute.indexOf("export async function POST"));
  const proposalPage = readFileSync("src/app/(dashboard)/officer/proposals/page.tsx", "utf8");

  assert.match(proposalPage, /recommendation_context:\s*!editProposal && recommendationDraftContext/);
  assert.match(proposalPage, /recommendation_fingerprint:\s*recommendationDraftContext\.recommendationFingerprint/);
  assert.match(proposalPage, /preserved recommendation evidence link/);
  assert.match(proposalRoute, /recommendation_context:\s*recommendationContext/);
  assert.match(proposalRoute, /\.select\("id,barangay_id,approval_status"\)/);
  assert.match(proposalRoute, /need\.approval_status !== "approved"/);
  assert.match(proposalRoute, /need\.barangay_id !== meta\.barangay_id/);
  assert.match(proposalRoute, /\.select\("id,cycle_id,aggregate_schema_version"\)/);
  assert.match(proposalRoute, /\["completed", "archived"\]\.includes/);
  assert.match(proposalRoute, /\.from\("proposal_validation_links"\)\.insert\(links\)/);
  assert.match(proposalRoute, /source_type:\s*"community_need"/);
  assert.match(proposalRoute, /source_type:\s*"profiling_evidence_snapshot"/);
  assert.match(proposalRoute, /recommendation_fingerprint/);
  assert.match(proposalRoute, /recommendationProvenance/);
  assert.match(proposalRoute, /proposal_sdg_alignment"\)\.delete\(\)\.eq\("proposal_id", proposal\.id\)/);
  assert.match(proposalRoute, /project_proposals"\)\.delete\(\)\.eq\("id", proposal\.id\)\.eq\("status", "draft"\)/);
  assert.doesNotMatch(proposalCreateRoute, /\/advance|phase2_\w*workflow|director_approve|finance_clear|status:\s*"(?:submitted|approved|rejected)"/i);
  assert.doesNotMatch(proposalRoute, /recommendation\.rationale|recommendation\.intervention|raw_recommendation/i);
});

test("proposal editing visibly reloads preserved recommendation evidence", () => {
  const proposalPage = readFileSync("src/app/(dashboard)/officer/proposals/page.tsx", "utf8");
  assert.match(proposalPage, /proposalEvidenceLinks/);
  assert.match(proposalPage, /proposalEvidenceLoading/);
  assert.match(proposalPage, /proposalEvidenceError/);
  assert.match(proposalPage, /fetch\(`\/api\/proposals\/\$\{p\.id\}\/validation-links`/);
  assert.match(proposalPage, /Preserved proposal evidence/);
  assert.match(proposalPage, /Review these server-verified sources before changing or submitting the draft/);
  assert.match(proposalPage, /Recommendation provenance/);
  assert.match(proposalPage, /Approved need:/);
  assert.match(proposalPage, /Completed profiling evidence:/);
  assert.match(proposalPage, /Reload before relying on the alignment check/);
});

test("advisory provenance remains visible but cannot satisfy human community validation", () => {
  const migration = readFileSync("supabase/migrations/20260818000980_phase3_advisory_provenance_boundary.sql", "utf8");
  const proposalRoute = readFileSync("src/app/api/proposals/route.ts", "utf8");
  const linkRoute = readFileSync("src/app/api/proposals/[id]/validation-links/route.ts", "utf8");
  const section = readFileSync("src/components/shared/CommunityValidationSection.tsx", "utf8");
  const prescreening = readFileSync("src/lib/proposals/prescreening.ts", "utf8");
  const scopes = JSON.parse(readFileSync("supabase/database-gate-scopes.json", "utf8"));

  assert.match(migration, /^--[\s\S]*\bBEGIN;/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS provenance_kind/);
  assert.match(migration, /'validation', 'advisory_planning'/);
  assert.match(migration, /l\.provenance_kind = 'validation'/);
  assert.match(migration, /n\.approval_status = 'approved'/);
  assert.match(migration, /n\.barangay_id = proposal_barangay_id/);
  assert.match(migration, /ELSE NULL/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.recompute_community_validated\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(proposalRoute, /provenance_kind:\s*"advisory_planning"/);
  assert.match(linkRoute, /source_id, provenance_kind, rationale/);
  assert.match(section, /link\.provenance_kind === "validation"/);
  assert.match(section, /excluded from the human-validation threshold/);
  assert.match(prescreening, /Recommendation planning provenance does not count/);
  assert.equal(scopes.scopes.phase2.migrationNames.at(-1), "20260818000980_phase3_advisory_provenance_boundary.sql");
});

test("manual proposal evidence links are strict, state-bound, and same-barangay", () => {
  const route = readFileSync("src/app/api/proposals/[id]/validation-links/route.ts", "utf8");
  const picker = readFileSync("src/components/shared/ValidationLinkPicker.tsx", "utf8");

  assert.match(route, /createLinkSchema = z\.object/);
  assert.match(route, /\.strict\(\)/);
  assert.match(route, /source_id: z\.string\(\)\.uuid\(\)/);
  assert.match(route, /rationale: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(2_000\)/);
  assert.doesNotMatch(route.slice(0, route.indexOf("type SourceType")), /survey_response/);
  assert.match(route, /\.select\("id,barangay_id,status"\)/);
  assert.match(route, /LINKABLE_PROPOSAL_STATUSES/);
  assert.match(route, /need\.approval_status === "approved" && need\.barangay_id === proposal\.barangay_id/);
  assert.match(route, /\["published", "closed"\]\.includes\(survey\.status\)/);
  assert.match(route, /survey\.target_barangay_id === proposal\.barangay_id/);
  assert.match(route, /observation\.barangay_id === proposal\.barangay_id/);
  assert.match(route, /snapshot\.aggregate_schema_version === "agape\.profiling\.aggregate\.v2"/);
  assert.match(route, /cycleResult\.data\.barangay_id === proposal\.barangay_id/);
  assert.match(route, /provenance_kind: "validation"/);
  assert.doesNotMatch(route, /\.select\("\*"\)|error\.message/);
  assert.match(picker, /\/api\/community-needs\?status=approved/);
  assert.match(picker, /sourceBarangayId === brgyId/);
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
