"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Clock, CheckCircle, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ActivityLog {
  id: string;
  date: string;
  hours: number;
  description: string;
  status: "pending" | "approved" | "rejected";
  programs: { title: string } | null;
}

const LOG_BADGE: Record<string, string> = {
  pending:  "bg-warning/10 text-warning border-warning/20 border",
  approved: "bg-success/10 text-success border-success/20 border",
  rejected: "bg-danger/10 text-danger border-danger/20 border",
};

export default function VolunteerHoursPage() {
  const [logs, setLogs]       = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/activity-logs");
    if (res.ok) { const j = await res.json(); setLogs(j.data ?? []); }
    else toast.error("Failed to load hours.");
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const stats = useMemo(() => {
    const approved = logs.filter((l) => l.status === "approved");
    const pending  = logs.filter((l) => l.status === "pending");
    const thisMonth = approved.filter((l) => {
      const d = new Date(l.date);
      const n = new Date();
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    });
    return {
      total:     approved.reduce((s, l) => s + l.hours, 0),
      pending:   pending.reduce((s, l) => s + l.hours, 0),
      thisMonth: thisMonth.reduce((s, l) => s + l.hours, 0),
      entries:   logs.length,
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Approved Hours", value: `${stats.total}h`,     icon: CheckCircle, accent: "border-l-success", color: "text-success" },
          { label: "This Month",           value: `${stats.thisMonth}h`, icon: TrendingUp,  accent: "border-l-primary", color: "text-primary" },
          { label: "Pending Review",       value: `${stats.pending}h`,   icon: Clock,       accent: "border-l-warning", color: "text-warning" },
          { label: "Total Entries",        value: stats.entries,          icon: Clock,       accent: "border-l-accent",  color: "text-accent"  },
        ].map((s) => (
          <Card key={s.label} className={`border-border shadow-card border-l-4 ${s.accent}`}>
            <CardContent className="px-4 py-2.5">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold font-heading mt-0.5 ${loading ? "text-muted-foreground" : s.color}`}>
                {loading ? "—" : s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Log history */}
      <div className="space-y-3">
        <h3 className="font-heading font-semibold text-foreground text-base">Activity History</h3>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
            <p className="font-medium">No activity logs yet.</p>
            <p className="text-sm">Log your first activity to start tracking hours.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Date</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Description</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden sm:table-cell">Program</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Hours</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} className={`border-b border-border/60 hover:bg-surface-alt/40 transition-colors ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                      {new Date(log.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="py-3 px-4 text-foreground max-w-xs">
                      <p className="line-clamp-2">{log.description}</p>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">
                      {log.programs?.title ?? <span className="italic">General</span>}
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">{log.hours}h</td>
                    <td className="py-3 px-4">
                      <Badge className={`${LOG_BADGE[log.status]} capitalize text-xs`}>{log.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
