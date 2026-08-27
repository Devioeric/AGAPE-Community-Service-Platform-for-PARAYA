"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Bot, CheckCircle2, ClipboardCheck, Loader2, RefreshCw, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdvisoryRecommendationResponse } from "@/lib/ai/advisory-recommendations";

const PRIORITY_STYLE = {
  critical: "border-danger/30 bg-danger/10 text-danger",
  high: "border-warning/30 bg-warning/10 text-warning",
  medium: "border-info/30 bg-info/10 text-info",
  low: "border-border bg-muted/30 text-muted-foreground",
} as const;

const CATEGORY_LABEL = {
  health: "Health",
  livelihood: "Livelihood",
  education: "Education",
  infrastructure: "Infrastructure",
  environment: "Environment",
} as const;

const DISMISSAL_REASON_LABEL = {
  insufficient_evidence: "Evidence is not sufficient",
  duplicate_or_covered: "Duplicate or already covered",
  outside_current_scope: "Outside the current program scope",
  data_quality_concern: "Data-quality concern",
  defer_until_next_cycle: "Defer until the next profiling cycle",
} as const;

export default function AdvisoryRecommendationsPage() {
  const [data, setData] = useState<AdvisoryRecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [barangay, setBarangay] = useState("all");
  const [reviewReasons, setReviewReasons] = useState<Record<string, keyof typeof DISMISSAL_REASON_LABEL>>({});
  const [reviewingNeedId, setReviewingNeedId] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/recommendations", { cache: "no-store" });
      const body = await response.json().catch(() => null) as { data?: AdvisoryRecommendationResponse; error?: string } | null;
      if (!response.ok || !body?.data) throw new Error(body?.error ?? "Unable to load advisory recommendations");
      setData(body.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load advisory recommendations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recordReview = async (
    recommendation: AdvisoryRecommendationResponse["recommendations"][number],
    action: "endorsed" | "dismissed",
  ) => {
    const reasonCode = action === "dismissed" ? reviewReasons[recommendation.needId] : null;
    if (action === "dismissed" && !reasonCode) {
      setError("Choose a dismissal reason before dismissing this recommendation.");
      return;
    }
    setReviewingNeedId(recommendation.needId);
    setReviewMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/ai/recommendations/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          needId: recommendation.needId,
          recommendationFingerprint: recommendation.recommendationFingerprint,
          action,
          reasonCode,
        }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Unable to record recommendation review");
      setReviewMessage(action === "endorsed" ? "Recommendation endorsed." : "Recommendation dismissed with its reason recorded.");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Unable to record recommendation review");
    } finally {
      setReviewingNeedId(null);
    }
  };

  const barangays = Array.from(new Map(
    (data?.recommendations ?? []).map((item) => [item.barangay.id, item.barangay.name]),
  ).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const visibleRecommendations = (data?.recommendations ?? []).filter((item) =>
    (category === "all" || item.category === category)
    && (priority === "all" || item.priority.label === priority)
    && (coverage === "all" || item.coverage.state === coverage)
    && (barangay === "all" || item.barangay.id === barangay)
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-32 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Evaluating approved needs and project coverage…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="advisory-recommendations-page">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-foreground">
            <Bot className="h-6 w-6 text-primary" />
            Advisory Recommendations
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Rules-based planning suggestions generated from approved community needs and linked proposal/program coverage.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Advisory only</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            These suggestions do not create or change proposals. Authorized personnel must validate the need, evidence, scope, budget, and SDG alignment before taking action.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 p-4 text-sm text-danger" role="alert">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {reviewMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-4 text-sm text-success" role="status">
          <CheckCircle2 className="h-4 w-4" />
          {reviewMessage}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ["Approved open needs", data.summary.approvedOpenNeeds],
              ["Without a response", data.summary.unaddressedNeeds],
              ["Plans to review", data.summary.needsWithPlannedResponses],
              ["Active coverage", data.summary.needsWithActivePrograms],
              ["Recent completed context", data.summary.needsWithRecentCompletedPrograms],
            ].map(([label, value]) => (
              <Card key={String(label)} className="border-border shadow-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-heading text-2xl font-bold text-foreground">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border shadow-card">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  <option value="all">All categories</option>
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Priority
                <select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  <option value="all">All priorities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Coverage
                <select value={coverage} onChange={(event) => setCoverage(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  <option value="all">All response states</option>
                  <option value="unaddressed">No plan</option>
                  <option value="planned">Plan exists</option>
                  <option value="partial_active">Partial active coverage</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Barangay
                <select value={barangay} onChange={(event) => setBarangay(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  <option value="all">All barangays</option>
                  {barangays.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">
                Showing {visibleRecommendations.length} of {data.recommendations.length} recommendations
              </p>
            </CardContent>
          </Card>

          {data.recommendations.length === 0 ? (
            <Card className="border-border shadow-card">
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                <CheckCircle2 className="h-9 w-9 text-success" />
                <p className="font-medium text-foreground">No uncovered approved needs found</p>
                <p className="max-w-lg text-sm text-muted-foreground">
                  Every approved open need currently has a fully covering active linked program, or no approved open needs are available.
                </p>
              </CardContent>
            </Card>
          ) : visibleRecommendations.length === 0 ? (
            <Card className="border-border shadow-card">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium text-foreground">No recommendations match these filters</p>
                <Button type="button" variant="outline" size="sm" onClick={() => { setCategory("all"); setPriority("all"); setCoverage("all"); setBarangay("all"); }}>
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {visibleRecommendations.map((recommendation) => (
                <Card key={recommendation.needId} className="border-border shadow-card" data-testid="recommendation-card">
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={PRIORITY_STYLE[recommendation.priority.label]}>
                        {recommendation.priority.label.toUpperCase()} · {recommendation.priority.score}/5
                      </Badge>
                      <Badge variant="secondary">{CATEGORY_LABEL[recommendation.category]}</Badge>
                      <Badge variant="outline">
                        {recommendation.coverage.state === "partial_active"
                          ? "Partial active coverage"
                          : recommendation.coverage.state === "planned" ? "Plan exists" : "No plan"}
                      </Badge>
                      <Badge variant="outline" className={recommendation.review.status === "endorsed"
                        ? "border-success/30 bg-success/10 text-success"
                        : recommendation.review.status === "dismissed"
                          ? "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
                          : recommendation.review.status === "stale"
                            ? "border-warning/30 bg-warning/10 text-warning"
                            : "border-info/30 bg-info/10 text-info"}>
                        {recommendation.review.status === "open" ? "Awaiting review"
                          : recommendation.review.status === "stale" ? "Prior review is stale"
                            : recommendation.review.status === "endorsed" ? "Researcher-endorsed" : "Dismissed"}
                      </Badge>
                    </div>
                    <div>
                      <CardTitle className="font-heading text-lg">{recommendation.intervention.title}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{recommendation.barangay.name}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed text-foreground/80">{recommendation.intervention.description}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ranked alternatives</p>
                        <ol className="mt-2 space-y-2 text-sm">
                          {recommendation.alternatives.map((alternative, index) => (
                            <li key={alternative.code}>
                              <span className="font-medium text-foreground">{index + 1}. {alternative.title}</span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">SDG {alternative.suggestedSdgs.join(", ")}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Indicative resources</p>
                        <ul className="mt-2 space-y-2 text-sm">
                          {recommendation.indicativeResources.map((resource) => (
                            <li key={`${resource.category}:${resource.item}`}>
                              <span className="font-medium text-foreground">{resource.item}</span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">{resource.indicativeQuantity} · {resource.limitation}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-muted/10 p-3 text-xs text-foreground/80">
                      <p className="font-medium text-foreground">Verified five-year history benchmark</p>
                      {recommendation.planningBenchmarks.matchedRecords > 0 ? (
                        <div className="mt-1 space-y-1">
                          <p>{recommendation.planningBenchmarks.matchedRecords} category-matched accepted/verified record{recommendation.planningBenchmarks.matchedRecords === 1 ? "" : "s"}.</p>
                          <p>
                            Budget range: {recommendation.planningBenchmarks.budgetRange
                              ? `PHP ${Number(recommendation.planningBenchmarks.budgetRange.low).toLocaleString("en-PH", { minimumFractionDigits: 2 })}–${Number(recommendation.planningBenchmarks.budgetRange.high).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                              : "insufficient comparable values"}
                            {" · "}Volunteer range: {recommendation.planningBenchmarks.volunteerRange
                              ? `${recommendation.planningBenchmarks.volunteerRange.low}–${recommendation.planningBenchmarks.volunteerRange.high}`
                              : "insufficient comparable values"}
                          </p>
                        </div>
                      ) : <p className="mt-1">No category-matched accepted and verified records are available.</p>}
                      <p className="mt-1 text-muted-foreground">{recommendation.planningBenchmarks.limitation}</p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why it appears</p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/80">{recommendation.rationale}</p>
                    </div>
                    {recommendation.evidence.profiling ? (
                      <div className="rounded-md border border-info/20 bg-info/5 p-3 text-xs text-foreground/80">
                        <p className="font-medium text-foreground">Approved profiling context</p>
                        <p className="mt-1">
                          {recommendation.evidence.profiling.cycleName} · as of {recommendation.evidence.profiling.reportingDate}
                        </p>
                        <p className="mt-1">
                          {recommendation.evidence.profiling.approvedHouseholds.toLocaleString("en-PH")} approved households · {recommendation.evidence.profiling.approvedResidents.toLocaleString("en-PH")} approved residents · {recommendation.evidence.profiling.coveragePercent ?? "not stated"}% coverage
                        </p>
                        <p className="mt-1">
                          Category cell: {recommendation.evidence.profiling.needCount?.label ?? "not available in this aggregate"}. Small cells remain suppressed and have no drill-through.
                        </p>
                      </div>
                    ) : (
                      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                        No compatible completed profiling snapshot is available for this barangay. Validate the need through its approved source before acting.
                      </p>
                    )}
                    <div className="rounded-md border border-border bg-muted/10 p-3 text-xs text-foreground/80" data-testid="recommendation-coverage-estimate">
                      <p className="font-medium text-foreground">Conservative planning coverage</p>
                      {recommendation.coverage.estimate.status === "available" ? (
                        <p className="mt-1">
                          Approved affected count: {recommendation.coverage.estimate.affectedCount?.label}
                          {" · "}Largest linked plan: {recommendation.coverage.estimate.plannedCount?.toLocaleString("en-PH")}
                          {" · "}Estimated coverage: {recommendation.coverage.estimate.estimatedPercent}%
                          {" · "}{recommendation.coverage.estimate.confidence} confidence
                        </p>
                      ) : recommendation.coverage.estimate.status === "suppressed" ? (
                        <p className="mt-1">Affected count: {recommendation.coverage.estimate.affectedCount?.label}. Percentage suppressed for privacy.</p>
                      ) : (
                        <p className="mt-1">Coverage estimate unavailable.</p>
                      )}
                      <p className="mt-1 text-muted-foreground">{recommendation.coverage.estimate.limitation}</p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/10 p-3 text-xs text-foreground/80">
                      <p className="font-medium text-foreground">Beneficiary planning guidance</p>
                      <p className="mt-1">{recommendation.beneficiaryGuidance.segmentLabel}</p>
                      <p className="mt-1">
                        Suggested starting count: {recommendation.beneficiaryGuidance.suggestedCount?.toLocaleString("en-PH") ?? "unavailable"}
                        {" · "}{recommendation.beneficiaryGuidance.confidence} confidence
                      </p>
                      <p className="mt-1 text-muted-foreground">{recommendation.beneficiaryGuidance.limitation}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />
                        {recommendation.coverage.plannedProposals} planned · {recommendation.coverage.activePartialPrograms} partial active · {recommendation.coverage.recentCompletedPrograms} completed in prior 24 months · {recommendation.coverage.olderOrUndatedCompletedPrograms} older/undated · {recommendation.confidence} confidence
                      </div>
                      <div className="flex flex-wrap gap-1.5" aria-label="Suggested Sustainable Development Goals">
                        {recommendation.suggestedSdgs.map((sdg) => <Badge key={sdg} variant="outline">SDG {sdg}</Badge>)}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Approved need evidence · identified {new Date(`${recommendation.evidence.identifiedDate}T00:00:00`).toLocaleDateString("en-PH")}
                    </p>
                    {recommendation.review.reviewedAt && (
                      <div className="rounded-md border border-border bg-muted/10 p-3 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">
                          {recommendation.review.status === "stale" ? "Previous human review" : "Human review"}
                        </p>
                        <p className="mt-1">
                          {recommendation.review.lastAction === "endorsed" ? "Endorsed" : "Dismissed"}
                          {recommendation.review.reviewedBy ? ` by ${recommendation.review.reviewedBy.name}` : ""}
                          {` on ${new Date(recommendation.review.reviewedAt).toLocaleString("en-PH")}`}.
                          {recommendation.review.reasonCode ? ` Reason: ${DISMISSAL_REASON_LABEL[recommendation.review.reasonCode]}.` : ""}
                        </p>
                        {recommendation.review.status === "stale" && (
                          <p className="mt-1 text-warning">The recommendation inputs changed after that review. Review the current version again.</p>
                        )}
                      </div>
                    )}
                    {data.scope.canReview && (
                      <div className="space-y-2 rounded-md border border-border p-3" data-testid="recommendation-review-controls">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Researcher or Director review</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select
                            aria-label={`Dismissal reason for ${recommendation.intervention.title}`}
                            value={reviewReasons[recommendation.needId] ?? ""}
                            onChange={(event) => setReviewReasons((current) => ({
                              ...current,
                              [recommendation.needId]: event.target.value as keyof typeof DISMISSAL_REASON_LABEL,
                            }))}
                            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                          >
                            <option value="">Select a reason only when dismissing</option>
                            {Object.entries(DISMISSAL_REASON_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={reviewingNeedId === recommendation.needId}
                            onClick={() => void recordReview(recommendation, "dismissed")}
                          >
                            {reviewingNeedId === recommendation.needId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />}
                            Dismiss
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={reviewingNeedId === recommendation.needId}
                            onClick={() => void recordReview(recommendation, "endorsed")}
                          >
                            {reviewingNeedId === recommendation.needId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />}
                            Endorse
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Endorsement and dismissal are advisory review records only. They do not create or advance a proposal.</p>
                      </div>
                    )}
                    <div className="flex justify-end border-t border-border pt-3">
                      {recommendation.action === "develop_response" ? (
                        <Link
                          className={buttonVariants({ size: "sm" })}
                          href={`/officer/proposals?from_need=${encodeURIComponent(recommendation.needId)}`}
                        >
                          Prepare a proposal draft
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      ) : recommendation.action === "review_active_gap" ? (
                        <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/officer/programs">
                          Review active coverage
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      ) : (
                        <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/officer/proposals">
                          Review proposal pipeline
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <p className="text-right text-xs text-muted-foreground">
            Source: approved community needs · As of {data.scope.asOfDate} · {data.schema}
          </p>
        </>
      )}
    </div>
  );
}
