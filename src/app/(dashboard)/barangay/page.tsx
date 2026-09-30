"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedDashboardSummary } from "@/components/dashboard/UnifiedDashboardSummary";
import { BarangayDashboardCharts } from "@/components/dashboard/BarangayDashboardCharts";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";

interface RecentProgram {
  id:         string;
  title:      string;
  status:     string;
  start_date: string | null;
  end_date:   string | null;
  volunteers: number;
}
interface ActionItem {
  id:       string;
  task:     string;
  due:      string;
  priority: string;
  /** Where the Secretary completes the item; absent on older responses. */
  href?:    string;
}
interface DashboardData {
  recentPrograms: RecentProgram[];
  actionItems:    ActionItem[];
}

const statusColors: Record<string, string> = {
  active:    "bg-success/10 text-success",
  upcoming:  "bg-info/10 text-info",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-danger/10 text-danger",
  draft:     "bg-muted text-muted-foreground",
};
const priorityColors: Record<string, string> = {
  high:     "bg-danger/10 text-danger",
  medium:   "bg-warning/10 text-warning",
  low:      "bg-muted text-muted-foreground",
  critical: "bg-danger/10 text-danger",
};

const fmtRange = (start: string | null, end: string | null) => {
  const f = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  if (start && end) return `${f(start)} – ${f(end)}`;
  if (start) return f(start);
  if (end)   return f(end);
  return "TBD";
};

const fmtDue = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function BarangayDashboard() {
  const actor = useDashboardActor();
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/barangay/dashboard");
      if (res.ok) {
        const j = await res.json();
        setData(j.data);
      }
      setLoading(false);
    })();
  }, []);

  const dashboardSummary = <UnifiedDashboardSummary />;
  // Charts load on their own, scoped to this Secretary's barangay by /api/barangay/charts.
  const charts = <BarangayDashboardCharts actor={actor} />;

  if (loading) {
    return (
      <div className="space-y-6">
        {dashboardSummary}
        {charts}
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading dashboard details…</span>
        </div>
      </div>
    );
  }

  const recentPrograms = data?.recentPrograms ?? [];
  const actionItems    = data?.actionItems    ?? [];

  return (
    <div className="space-y-6">
      {dashboardSummary}
      {charts}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Programs */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Recent Programs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentPrograms.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No programs in your barangay yet.</p>
            ) : (
              recentPrograms.map((prog) => (
                <div key={prog.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-alt border border-border">
                  <div>
                    <p className="font-medium text-sm text-foreground">{prog.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtRange(prog.start_date, prog.end_date)} · {prog.volunteers} volunteers
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[prog.status] ?? "bg-muted text-muted-foreground"}`}>
                    {prog.status}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Action Items */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Action Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No pending action items.</p>
            ) : (
              actionItems.map((item) => {
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm text-foreground">{item.task}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize ${priorityColors[item.priority] ?? "bg-muted text-muted-foreground"}`}>
                        {item.priority}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
                      <span>Submitted {fmtDue(item.due)}</span>
                      {item.href && <span className="inline-flex items-center text-primary font-medium">Open <ChevronRight className="w-3 h-3" /></span>}
                    </p>
                  </>
                );
                return item.href
                  ? <Link key={item.id} href={item.href} className="block p-3 rounded-lg bg-surface-alt border border-border hover:border-primary/40 transition-colors">{body}</Link>
                  : <div key={item.id} className="p-3 rounded-lg bg-surface-alt border border-border">{body}</div>;
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
