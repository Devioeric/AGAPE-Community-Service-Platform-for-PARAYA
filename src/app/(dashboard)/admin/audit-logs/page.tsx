"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Filter, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportMenu } from "@/components/shared/ExportMenu";

// ─── Types ──────────────────────────────────────────────────────────────────

type LogLevel = "info" | "warning" | "error";

interface AuditEntry {
  id:            string;
  user_email:    string | null;
  action:        string;
  resource_type: string | null;
  resource_id:   string | null;
  level:         LogLevel;
  ip_address:    string | null;
  created_at:    string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<LogLevel, string> = {
  info:    "bg-info/10 text-info border-info/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error:   "bg-danger/10 text-danger border-danger/20",
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  info:    "Info",
  warning: "Warning",
  error:   "Error",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtTimestamp(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-CA"); // YYYY-MM-DD
  const time = d.toLocaleTimeString("en-US", { hour12: false }); // HH:MM:SS
  return `${date} ${time}`;
}

function toExportRow(r: AuditEntry) {
  return {
    Timestamp:      fmtTimestamp(r.created_at),
    User:           r.user_email ?? "system",
    Action:         r.action,
    "Resource Type": r.resource_type ?? "",
    "Resource ID":   r.resource_id ?? "",
    Level:          LEVEL_LABEL[r.level],
    IP:             r.ip_address ?? "",
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [logs, setLogs]       = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [level, setLevel]     = useState<"all" | LogLevel>("all");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (level !== "all") params.set("level", level);
    if (search.trim())   params.set("search", search.trim());
    const res = await fetch(`/api/admin/audit-logs?${params}`);
    if (res.ok) {
      const j = await res.json();
      setLogs(j.data ?? []);
    } else {
      toast.error("Failed to load audit logs.");
    }
    setLoading(false);
  }, [level, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const counts = useMemo(() => ({
    total:   logs.length,
    info:    logs.filter((l) => l.level === "info").length,
    warning: logs.filter((l) => l.level === "warning").length,
    error:   logs.filter((l) => l.level === "error").length,
  }), [logs]);

  return (
    <div className="space-y-6">

      {/* Level summary pills */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Total Events", count: counts.total,   style: "bg-surface border border-border text-foreground" },
          { label: "Info",         count: counts.info,    style: "bg-info/10 text-info border border-info/20"        },
          { label: "Warnings",     count: counts.warning, style: "bg-warning/10 text-warning border border-warning/20" },
          { label: "Errors",       count: counts.error,   style: "bg-danger/10 text-danger border border-danger/20"   },
        ].map((s) => (
          <div key={s.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shadow-card ${s.style}`}>
            <span className="font-bold text-lg font-heading">{loading ? "—" : s.count}</span>
            <span className="opacity-80">{s.label}</span>
          </div>
        ))}
      </div>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="font-heading text-lg">Audit Log</CardTitle>
            <div className="flex gap-2 self-start sm:self-auto">
              <Button
                variant="outline" size="sm"
                onClick={fetchLogs}
                disabled={loading}
                className="gap-2 border-border print-hidden"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <ExportMenu
                rows={logs.map(toExportRow)}
                filename="audit-log"
                sheetName="Audit Log"
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by user, action, or resource…"
                className="pl-9 focus-visible:ring-primary/30"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as "all" | LogLevel)}
                className="h-9 pl-8 pr-8 text-sm cursor-pointer"
              >
                <option value="all">All Levels</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium whitespace-nowrap">Timestamp</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">User</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Action</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Resource</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">IP</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Level</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading audit logs…
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground">
                      No audit entries{search || level !== "all" ? " match your filters" : " recorded yet"}.
                    </td>
                  </tr>
                ) : logs.map((log, i) => (
                  <tr key={log.id} className={`border-b border-border/60 hover:bg-surface-alt/40 transition-colors ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap font-mono text-xs">{fmtTimestamp(log.created_at)}</td>
                    <td className="py-3 px-4 text-foreground max-w-[180px] truncate">{log.user_email ?? "system"}</td>
                    <td className="py-3 px-4 font-medium text-foreground whitespace-nowrap">{log.action}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell max-w-[220px] truncate font-mono text-xs">
                      {log.resource_type
                        ? <>{log.resource_type}{log.resource_id ? ` / ${log.resource_id.slice(0, 8)}` : ""}</>
                        : "—"}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell font-mono text-xs">{log.ip_address ?? "—"}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${LEVEL_STYLES[log.level]}`}>
                        {LEVEL_LABEL[log.level]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
            {loading ? "Loading…" : `Showing ${logs.length} entr${logs.length === 1 ? "y" : "ies"}`}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
