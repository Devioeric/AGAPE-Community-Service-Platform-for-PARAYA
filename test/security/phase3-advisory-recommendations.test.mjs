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
  completedProgramCount: 0,
};

test("advisory engine ranks uncovered approved needs and excludes active coverage", () => {
  const result = buildAdvisoryRecommendations({
    now: new Date("2026-08-27T00:00:00.000Z"),
    needs: [
      { ...NEED, category: "education", priorityScore: 4, plannedProposalCount: 1 },
      { ...NEED, id: "10000000-0000-4000-8000-000000000002", category: "health", priorityScore: 5 },
      { ...NEED, id: "10000000-0000-4000-8000-000000000003", category: "livelihood", priorityScore: 5, activeProgramCount: 1 },
    ],
  });

  assert.equal(result.schema, "agape.ai.need-recommendations.v1");
  assert.equal(result.advisoryOnly, true);
  assert.deepEqual(result.summary, {
    approvedOpenNeeds: 3,
    unaddressedNeeds: 1,
    needsWithPlannedResponses: 1,
    needsWithActivePrograms: 1,
    recommendationCount: 2,
  });
  assert.equal(result.recommendations[0].category, "health");
  assert.equal(result.recommendations[0].priority.label, "critical");
  assert.equal(result.recommendations[0].action, "develop_response");
  assert.equal(result.recommendations[1].action, "review_planned_response");
  assert.equal(result.recommendations.some((item) => item.category === "livelihood"), false);
  assert.equal(advisoryRecommendationResponseSchema.safeParse(result).success, true);
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
  assert.doesNotMatch(route, /select\(["'`]\*["'`]\)/);
  assert.doesNotMatch(route, /need_description|resident|contact|receipt|storage_path/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.doesNotMatch(route, /anthropic|generativelanguage|openai|googleapis/i);
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
    expectedOutput: "Conduct structured learning sessions.",
    timelineStart: "2026-09-01",
    timelineEnd: "2026-09-30",
    budget: 0,
    barangayId: "20000000-0000-4000-8000-000000000001",
    isIncomeGenerating: false,
    sdgs: [4],
  });
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.score, 100);
  assert.equal(result.level, "ready_for_human_review");
  assert.equal(result.checks.every((check) => check.status === "ready"), true);

  const incomplete = assessProposalAlignment({
    title: "",
    rationale: "",
    objectives: "",
    targetBeneficiaries: "",
    expectedOutput: "",
    timelineStart: "",
    timelineEnd: "",
    budget: null,
    barangayId: null,
    isIncomeGenerating: true,
    sdgs: [],
  });
  assert.equal(incomplete.score, 0);
  assert.equal(incomplete.suggestions.length, 10);
  assert.match(incomplete.suggestions.join(" "), /Confirm scope and policy with the Director instead of relying on automation/);
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
  assert.equal(scopes.scopes.phase2.migrationNames.at(-1), "20260818000940_phase2_beneficiary_evidence_options.sql");
  for (let sdg = 1; sdg <= 17; sdg += 1) assert.match(proposals, new RegExp(`\\{ n: ${sdg},`));
});

test("officer dashboard surfaces advisory counts without making workflow decisions", () => {
  const dashboard = readFileSync("src/app/(dashboard)/officer/page.tsx", "utf8");
  assert.match(dashboard, /fetch\("\/api\/ai\/recommendations"/);
  assert.match(dashboard, /approved need\{recommendations\.summary\.recommendationCount === 1/);
  assert.match(dashboard, /Review recommendations/);
  assert.doesNotMatch(dashboard, /\/advance|director_approve|finance_clear/);
});
