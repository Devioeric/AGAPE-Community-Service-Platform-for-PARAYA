"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadResourceState } from "@/components/shared/ReadResourceState";
import type { DashboardRecommendations as RecommendationData } from "@/lib/dashboard/lower-panel-contracts";
import type { ReadStatus } from "@/lib/read-resource";

const priorityStyle = {
  critical: "bg-danger/10 text-danger",
  high: "bg-warning/10 text-warning",
  medium: "bg-info/10 text-info",
  low: "bg-muted text-muted-foreground",
};

export function DashboardRecommendations({ resource }: { resource: {
  status: ReadStatus; data: RecommendationData | null; reload: () => unknown;
} }) {
  if (resource.status === "denied") return null;
  const items = resource.status === "success" ? resource.data?.recommendations.slice(0, 3) ?? [] : [];
  return <Card className="min-w-0 self-start gap-0 border-border py-0 shadow-card" data-testid="dashboard-recommendations">
    <CardHeader className="border-b border-border/60 px-5 py-3">
      <CardTitle className="flex items-center gap-2 font-heading text-lg">
        Recommendations
      </CardTitle>
    </CardHeader>
    <CardContent className="px-5 pb-3 pt-0">
      <ReadResourceState status={resource.status} label="Recommendations" retry={resource.reload} />
      {resource.status === "success" && (items.length ? <ul className="divide-y divide-border/60">
        {items.map(item => <li key={item.needId}>
          <Link href="/officer/analytics/recommendations" className="group flex items-start gap-3 rounded-sm py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <span className={`mt-0.5 rounded p-1 ${priorityStyle[item.priority.label]}`}><CircleAlert aria-hidden="true" className="h-3.5 w-3.5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground group-hover:text-primary">{item.intervention.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.barangay.name}</span>
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium capitalize ${priorityStyle[item.priority.label]}`}>{item.priority.label}</span>
          </Link>
        </li>)}
      </ul> : <p className="py-6 text-sm text-muted-foreground">No recommendations currently need planning attention.</p>)}
      <div className="space-y-1.5 border-t border-border/60 pt-3">
        <p className="text-[12px] text-muted-foreground">Advisory suggestions; review before taking action.</p>
        <Link href="/officer/analytics/recommendations" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">View all recommendations <ArrowRight aria-hidden="true" className="h-3 w-3" /></Link>
      </div>
    </CardContent>
  </Card>;
}
