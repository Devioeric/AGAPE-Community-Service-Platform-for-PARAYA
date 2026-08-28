"use client";

import { useEffect, useState } from "react";
import { Handshake, ClipboardCheck, Users, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedDashboardSummary } from "@/components/dashboard/UnifiedDashboardSummary";

interface Stats {
  activePartnerships: number;
  pendingSubmissions: number;
  totalBeneficiaries: number;
}
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
}
interface DashboardData {
  stats:          Stats;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats          = data?.stats          ?? { activePartnerships: 0, pendingSubmissions: 0, totalBeneficiaries: 0 };
  const recentPrograms = data?.recentPrograms ?? [];
  const actionItems    = data?.actionItems    ?? [];

  const statCards = [
    { label: "Active Partnerships", value: stats.activePartnerships, icon: Handshake,      sub: "Programs in your barangay" },
    { label: "Pending Submissions", value: stats.pendingSubmissions, icon: ClipboardCheck, sub: "Awaiting captain approval" },
    { label: "Total Beneficiaries", value: stats.totalBeneficiaries.toLocaleString(), icon: Users, sub: "Across all programs" },
  ];

  return (
    <div className="space-y-6">
      <UnifiedDashboardSummary />
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-border shadow-card border-l-4 border-l-accent">
            <CardContent className="px-5 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1 font-heading">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
              actionItems.map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-surface-alt border border-border">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-foreground">{item.task}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize ${priorityColors[item.priority] ?? "bg-muted text-muted-foreground"}`}>
                      {item.priority}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Submitted {fmtDue(item.due)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
