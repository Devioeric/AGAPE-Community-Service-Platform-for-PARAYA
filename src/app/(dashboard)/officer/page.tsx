"use client";

import { PaginatedTable } from "@/components/shared/PaginatedTable";

import {
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardRecommendations } from "@/components/dashboard/DashboardRecommendations";
import Link from "next/link";
import { UnifiedDashboardSummary } from "@/components/dashboard/UnifiedDashboardSummary";
import { DashboardActivityChart } from "@/components/dashboard/DashboardActivityChart";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import { useReadResource } from "@/components/shared/useReadResource";
import { ReadResourceState } from "@/components/shared/ReadResourceState";
import { parseDashboardAnalytics, parseDashboardRecommendations, parseRecentPrograms } from "@/lib/dashboard/lower-panel-contracts";

const STATUS_COLORS: Record<string, string> = {
  active:       "bg-success/10 text-success",
  completed:    "bg-info/10 text-info",
  planning:     "bg-warning/10 text-warning",
  on_hold:      "bg-muted/30 text-muted-foreground",
  cancelled:    "bg-danger/10 text-danger",
};

export default function OfficerDashboard() {
  const actor = useDashboardActor();
  const canAnalyze = hasCapability(actor.role, actor.permissions, "analytics.aggregate.read");
  const canReadPrograms = hasCapability(actor.role, actor.permissions, "program.read");
  const analyticsResource = useReadResource(canAnalyze ? "/api/analytics?type=dashboard" : null, parseDashboardAnalytics);
  const programsResource = useReadResource(canReadPrograms ? "/api/programs" : null, parseRecentPrograms);
  const recommendationsResource = useReadResource(canAnalyze ? "/api/ai/recommendations" : null, parseDashboardRecommendations);
  const programs = programsResource.data ?? [];
  const showRecommendations = canAnalyze && recommendationsResource.status !== "denied";
  const dashboardSummary = <UnifiedDashboardSummary />;
  const a = analyticsResource.data;

  const barangayChart = a?.topBarangays ?? [];

  return (
    <div className="space-y-6">
      {dashboardSummary}
      <ReadResourceState status={analyticsResource.status} label="Dashboard analytics" retry={analyticsResource.reload} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <DashboardActivityChart actor={actor} analytics={analyticsResource} className={showRecommendations ? "xl:col-span-2" : "xl:col-span-3"} />
        {showRecommendations && <DashboardRecommendations resource={recommendationsResource} />}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Top Barangays */}
        {a && <Card className="border-border shadow-card">
          <CardHeader className="px-6 pt-4 pb-2">
            <CardTitle className="font-heading text-lg text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" />
              Top Barangays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barangayChart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No barangay data yet</p>
            ) : (
              <div className="space-y-3">
                {barangayChart.map((b, i) => (
                  <div key={b.name} className="flex items-center gap-3">
                    <span className="w-5 text-xs text-muted-foreground font-medium shrink-0">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate text-foreground/80">{b.name}</span>
                        <span className="font-semibold text-foreground shrink-0 ml-2">{b.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((b.count / Math.max(barangayChart[0].count, 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>}

        {/* Recent Programs */}
        {programsResource.status !== "denied" && <Card className="xl:col-span-2 border-border shadow-card">
          <CardHeader className="px-6 pt-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-lg text-foreground">Recent Programs</CardTitle>
            <Link href="/officer/programs" className="text-xs text-primary hover:text-primary-dark font-medium">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            <ReadResourceState status={programsResource.status} label="Recent programs" retry={programsResource.reload} />
            {programsResource.status === "success" && (programs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No programs yet.{" "}
                <Link href="/officer/programs" className="text-primary hover:underline">Create one →</Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <PaginatedTable rows={programs} label="Recent programs">
                  {(pageRows) => (
                    <table aria-label="Recent programs" className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Program</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Barangay</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Start</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((p, i) => (
                          <tr key={p.id} className={i % 2 === 0 ? "bg-surface-alt/40" : ""}>
                            <td className="py-2.5 px-3 font-medium text-foreground truncate max-w-[180px]">
                              {p.title}
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground">
                              {(p.barangays as { name: string } | null)?.name ?? "—"}
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground">
                              {p.start_date
                                ? new Date(p.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
                                : "—"}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[p.status] ?? "bg-muted/30 text-muted-foreground"}`}>
                                {p.status.replace("_", " ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </PaginatedTable>
              </div>
            ))}
          </CardContent>
        </Card>}
      </div>
    </div>
  );
}
