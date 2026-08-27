// Pre-screening rule engine — runs automated checks against PARAYA's
// gatekeeping criteria before a proposal can advance past pre_screening.
//
// Each rule returns { name, passed, message } so reviewers can see exactly
// which criteria a proposal met or missed.

export interface ProposalForScreening {
  title:                string;
  rationale:            string | null;
  objectives:           string | null;
  target_beneficiaries: string | null;
  budget:               number | null;
  is_income_generating: boolean;
  timeline_start:       string | null;
  timeline_end:         string | null;
  sdg_count:            number;       // count of proposal_sdg_alignment rows
  community_validated:  boolean;      // Phase II stakeholder consultation attested
}

export interface CheckResult {
  name:    string;
  passed:  boolean;
  message: string;
}

export interface ScreeningResult {
  passed: boolean;
  checks: CheckResult[];
}

// Mission keywords (loose match): proposal copy should reference at least one
// community-service oriented theme. Adjust per PARAYA Office guidance.
const MISSION_KEYWORDS = [
  "community", "barangay", "outreach", "literacy", "education", "health",
  "livelihood", "training", "skill", "youth", "elderly", "service",
  "development", "welfare", "wellness", "environment", "sanitation",
];

export function runPrescreening(p: ProposalForScreening): ScreeningResult {
  const checks: CheckResult[] = [];

  // ── 1. Must be non-income-generating ──────────────────────────────────────
  checks.push({
    name:    "Non-income-generating",
    passed:  !p.is_income_generating,
    message: p.is_income_generating
      ? "Marked as income-generating — PARAYA only funds non-income-generating community projects."
      : "Confirmed non-income-generating.",
  });

  // ── 2. Must have at least one SDG alignment ───────────────────────────────
  checks.push({
    name:    "SDG alignment",
    passed:  p.sdg_count > 0,
    message: p.sdg_count > 0
      ? `${p.sdg_count} SDG alignment${p.sdg_count === 1 ? "" : "s"} declared.`
      : "No SDG alignment declared — proposal must align with at least one of the 17 Sustainable Development Goals.",
  });

  // ── 3. Must declare target beneficiaries ──────────────────────────────────
  const hasBeneficiaries = (p.target_beneficiaries?.trim().length ?? 0) > 0;
  checks.push({
    name:    "Beneficiary impact",
    passed:  hasBeneficiaries,
    message: hasBeneficiaries
      ? "Target beneficiaries described."
      : "Target beneficiaries must be described.",
  });

  // ── 4. Rationale references PARAYA mission themes ─────────────────────────
  const text = `${p.title} ${p.rationale ?? ""} ${p.objectives ?? ""}`.toLowerCase();
  const matchedKeywords = MISSION_KEYWORDS.filter((kw) => text.includes(kw));
  checks.push({
    name:    "Mission alignment",
    passed:  matchedKeywords.length > 0,
    message: matchedKeywords.length > 0
      ? `References mission themes: ${matchedKeywords.slice(0, 3).join(", ")}${matchedKeywords.length > 3 ? `, +${matchedKeywords.length - 3}` : ""}.`
      : "Title, rationale, or objectives should reference community-service themes (education, health, livelihood, etc.).",
  });

  // ── 5. Has a defined timeline ─────────────────────────────────────────────
  const hasTimeline = !!(p.timeline_start && p.timeline_end);
  checks.push({
    name:    "Defined timeline",
    passed:  hasTimeline,
    message: hasTimeline
      ? "Start and end dates set."
      : "Both start and end dates must be set.",
  });

  // ── 6. Budget is set and reasonable ──────────────────────────────────────
  const hasBudget = p.budget !== null && p.budget >= 0;
  checks.push({
    name:    "Budget declared",
    passed:  hasBudget,
    message: hasBudget
      ? `Budget of ₱${(p.budget ?? 0).toLocaleString()} declared.`
      : "A budget section is required; zero cash budget is allowed.",
  });

  // ── 7. Community validation (Phase II) ────────────────────────────────────
  // Framework: objectives are validated with community stakeholders before
  // they advance. The DB-side trigger sets `community_validated = TRUE` when
  // EITHER path is satisfied:
  //   * ≥ 2 separately recorded human-validation links, including one
  //     Captain-approved same-barangay need, OR
  //   * A validation event with ≥ 1 evidence file and ≥ 3 stakeholders.
  // So this flag is evidence-backed (structural lineage or uploaded artifacts),
  // not a self-attestation.
  checks.push({
    name:    "Community validation",
    passed:  p.community_validated,
    message: p.community_validated
      ? "Evidence-backed community consultation on record."
      : "Phase II requires human-reviewed evidence: either link ≥ 2 qualifying community records including one Captain-approved same-barangay need, or record a consultation event with ≥ 3 stakeholders and ≥ 1 evidence file. Recommendation planning provenance does not count toward this gate.",
  });

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}
