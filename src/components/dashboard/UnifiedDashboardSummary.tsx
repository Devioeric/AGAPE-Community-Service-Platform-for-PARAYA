"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardSummarySchema, type DashboardSummaryDTO } from "@/lib/dashboard/contracts";
import { DashboardKpiTrend } from "./DashboardKpiTrend";
import { dashboardTrendPresentation } from "@/lib/dashboard/kpi-trend";
import { getDashboardKpiPresentation, getDashboardKpiTone, getVisibleDashboardKpiCards } from "@/components/dashboard/dashboard-kpi-presentation";

const toneClasses = {
  neutral: { border: "border-l-accent", tile: "bg-accent/15", icon: "text-accent" },
  info: { border: "border-l-info", tile: "bg-info/10", icon: "text-info" },
  warning: { border: "border-l-warning", tile: "bg-warning/10", icon: "text-warning" },
  success: { border: "border-l-success", tile: "bg-success/10", icon: "text-success" },
};

function gridClasses(cardCount: number) {
  if (cardCount <= 1) return "grid grid-cols-1 gap-4";
  if (cardCount === 2) return "grid grid-cols-1 gap-4 sm:grid-cols-2";
  if (cardCount === 3) return "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
  return "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4";
}

export function UnifiedDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    fetch("/api/dashboard/summary", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("dashboard summary unavailable");
        const payload = await response.json();
        if (!payload?.data) throw new Error("dashboard summary missing");
        return dashboardSummarySchema.parse(payload.data);
      })
      .then((data) => { if (!controller.signal.aborted) setSummary(data); })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setSummary(null);
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [attempt]);

  if (loading) {
    return (
      <section aria-label="Dashboard key performance indicators" aria-busy="true">
        <h2 className="sr-only">Dashboard key performance indicators</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index} className="border-border border-l-4 border-l-accent shadow-card">
              <CardContent className="px-5 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2 py-0.5">
                    <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                    <div className="h-9 w-16 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-36 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-accent/15" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (failed) {
    return (
      <section aria-label="Dashboard key performance indicators" aria-live="polite">
        <h2 className="sr-only">Dashboard key performance indicators</h2>
        <Card className="border-border border-l-4 border-l-warning shadow-card">
          <CardContent className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="font-heading font-semibold text-foreground">Dashboard metrics could not be loaded</p>
                <p className="text-xs text-muted-foreground">Try the request again without reloading the page.</p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const visibleCards = getVisibleDashboardKpiCards(summary?.cards ?? [], summary?.role);

  if (visibleCards.length === 0) {
    return (
      <section aria-label="Dashboard key performance indicators" aria-live="polite">
        <h2 className="sr-only">Dashboard key performance indicators</h2>
        <Card className="border-border border-l-4 border-l-accent shadow-card">
          <CardContent className="px-5 py-4 text-sm text-muted-foreground">
            No dashboard metrics are available for this account.
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Dashboard key performance indicators">
      <h2 className="sr-only">Dashboard key performance indicators</h2>
      <div className={gridClasses(visibleCards.length)} data-testid="dashboard-kpi-grid">
        {visibleCards.map((card) => {
          const presentation = getDashboardKpiPresentation(card.key);
          const Icon = presentation.icon;
          const tone = toneClasses[getDashboardKpiTone(card.key, card.tone)];
          const formattedValue = card.value.toLocaleString();
          const trendDescription = card.trend ? dashboardTrendPresentation(card.key, card.value, card.trend) : null;

          return (
            <Link
              href={card.href}
              key={card.key}
              data-kpi-key={card.key}
              aria-label={`${card.label}: ${formattedValue}. ${presentation.description}. ${trendDescription ? `${trendDescription.label}. ${trendDescription.detail} ` : ""}Opens ${card.href}`}
              className="block rounded-xl outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Card className={`h-full border-border border-l-4 shadow-card transition-shadow hover:shadow-md ${tone.border}`}>
                <CardContent className="px-5 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">{card.label}</p>
                      <p className="mt-1 font-heading text-3xl font-bold text-foreground">{formattedValue}</p>
                      {card.trend && <DashboardKpiTrend metricKey={card.key} value={card.value} trend={card.trend} />}
                    </div>
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tone.tile}`}>
                      <Icon className={`h-5 w-5 ${tone.icon}`} aria-hidden="true" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
