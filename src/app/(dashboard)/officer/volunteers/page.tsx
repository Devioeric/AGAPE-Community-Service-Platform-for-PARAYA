"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Loader2, CheckCircle, XCircle, MoreHorizontal, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

interface Volunteer {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
}

interface ActivityLog {
  id: string;
  date: string;
  hours: number;
  description: string;
  status: "pending" | "approved" | "rejected";
  programs: { title: string } | null;
  users: { full_name: string } | null;
}

const LOG_BADGE: Record<string, string> = {
  pending:  "bg-warning/10 text-warning border-warning/20 border",
  approved: "bg-success/10 text-success border-success/20 border",
  rejected: "bg-danger/10 text-danger border-danger/20 border",
};

export default function OfficerVolunteersPage() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [logs, setLogs]             = useState<ActivityLog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [actId, setActId]           = useState<string | null>(null);
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [selectedVol, setSelectedVol] = useState<Volunteer | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [volRes, logRes] = await Promise.all([
      fetch("/api/volunteers"),
      fetch("/api/activity-logs"),
    ]);
    if (volRes.ok) {
      const j = await volRes.json();
      setVolunteers(j.data ?? []);
    }
    if (logRes.ok) {
      const j = await logRes.json();
      setLogs(j.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Per-volunteer stats
  useMemo(() => {
    const map: Record<string, { approved: number; pending: number }> = {};
    for (const log of logs) {
      if (!map[log.users?.full_name ?? ""]) map[log.users?.full_name ?? ""] = { approved: 0, pending: 0 };
      // We need volunteer_id; use the joined user name as proxy — ideally we'd have volunteer_id
    }
    // Better: compute from logs by matching volunteer names
    const byId: Record<string, { approved: number; pending: number }> = {};
    for (const v of volunteers) {
      byId[v.id] = { approved: 0, pending: 0 };
    }
    return byId;
  }, [logs, volunteers]);

  // Logs for selected volunteer
  const selectedLogs = useMemo(() =>
    selectedVol ? logs.filter((l) => l.users?.full_name === selectedVol.full_name) : [],
    [logs, selectedVol]
  );

  const filteredVols = volunteers.filter((v) => {
    const q = search.toLowerCase();
    const matchQ    = v.full_name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q);
    const matchS    = statusFilter === "all" || v.status === statusFilter;
    const joined    = v.created_at.slice(0, 10);
    const matchFrom = !dateFrom || joined >= dateFrom;
    const matchTo   = !dateTo   || joined <= dateTo;
    return matchQ && matchS && matchFrom && matchTo;
  });

  const pendingLogs = logs.filter((l) => l.status === "pending");

  async function reviewLog(id: string, status: "approved" | "rejected") {
    setActId(id);
    const res = await fetch(`/api/activity-logs/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
    if (res.ok) {
      setLogs((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
      toast.success(`Activity log ${status}.`);
    } else {
      toast.error("Action failed.");
    }
    setActId(null);
  }

  function openVolunteer(v: Volunteer) {
    setSelectedVol(v);
    setSheetOpen(true);
  }

  const counts = {
    total:   volunteers.length,
    active:  volunteers.filter((v) => v.status === "active").length,
    pending: pendingLogs.length,
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Volunteers",  value: counts.total,   accent: "border-l-primary" },
          { label: "Active Volunteers", value: counts.active,  accent: "border-l-success" },
          { label: "Pending Log Reviews", value: counts.pending, accent: "border-l-warning" },
        ].map((c) => (
          <Card key={c.label} className={`border-border shadow-card border-l-4 ${c.accent}`}>
            <CardContent className="px-4 py-2.5">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold font-heading text-foreground mt-0.5">{loading ? "—" : c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending activity log reviews */}
      {pendingLogs.length > 0 && (
        <Card className="border-warning/30 border shadow-card bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base text-warning flex items-center gap-2">
              <Clock className="w-4 h-4" /> Pending Activity Log Reviews ({pendingLogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-surface border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{log.users?.full_name ?? "Unknown"}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{log.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(log.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {log.hours}h
                    {log.programs && ` · ${log.programs.title}`}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button
                    size="sm"
                    disabled={actId === log.id}
                    onClick={() => reviewLog(log.id, "approved")}
                    className="h-7 px-2.5 text-xs bg-success hover:bg-success/90 text-white"
                  >
                    {actId === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                  </Button>
                  <Button
                    size="sm"
                    disabled={actId === log.id}
                    onClick={() => reviewLog(log.id, "rejected")}
                    className="h-7 px-2.5 text-xs bg-danger hover:bg-danger/90 text-white"
                  >
                    <XCircle className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
            {pendingLogs.length > 5 && (
              <p className="text-xs text-center text-muted-foreground pt-1">+{pendingLogs.length - 5} more pending logs</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Volunteer list */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-lg">Volunteer Roster</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Search volunteers…" className="pl-9 h-9 w-52 focus-visible:ring-primary/30" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="Joined from" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="Joined to" />
              {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Volunteer</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Account Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Joined</th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
                  </td></tr>
                ) : filteredVols.length === 0 ? (
                  <tr><td colSpan={4} className="py-16 text-center text-muted-foreground">
                    {volunteers.length === 0 ? "No volunteers registered yet." : "No volunteers match your filters."}
                  </td></tr>
                ) : filteredVols.map((v, i) => (
                  <tr key={v.id} className={`border-b border-border/60 hover:bg-surface-alt/40 transition-colors cursor-pointer ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}
                    onClick={() => openVolunteer(v)}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarFallback className="text-xs bg-primary/15 text-primary font-bold">
                            {v.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-foreground">{v.full_name}</p>
                          <p className="text-xs text-muted-foreground">{v.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={v.status === "active"
                        ? "bg-success/10 text-success border-success/20 border"
                        : "bg-warning/10 text-warning border-warning/20 border"
                      + " capitalize text-xs"}>
                        {v.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                      {new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuGroup>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openVolunteer(v)}>
                              View Details
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
            {filteredVols.length} of {volunteers.length} volunteers
          </div>
        </CardContent>
      </Card>

      {/* Volunteer detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
            {selectedVol && (
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-primary/20 text-primary font-bold">
                    {selectedVol.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <SheetTitle className="font-heading text-lg">{selectedVol.full_name}</SheetTitle>
                  <p className="text-sm text-muted-foreground">{selectedVol.email}</p>
                </div>
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Activity Logs</h4>
            {selectedLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity logs for this volunteer.</p>
            ) : selectedLogs.map((log) => (
              <div key={log.id} className="p-3 rounded-xl border border-border bg-transparent-alt/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{log.description}</p>
                    {log.programs && <p className="text-xs text-muted-foreground mt-0.5">{log.programs.title}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(log.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {log.hours}h
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <Badge className={`${LOG_BADGE[log.status]} capitalize text-xs`}>{log.status}</Badge>
                    {log.status === "pending" && (
                      <div className="flex gap-1">
                        <button
                          disabled={actId === log.id}
                          onClick={() => reviewLog(log.id, "approved")}
                          className="w-6 h-6 rounded flex items-center justify-center bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                        >
                          {actId === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        </button>
                        <button
                          disabled={actId === log.id}
                          onClick={() => reviewLog(log.id, "rejected")}
                          className="w-6 h-6 rounded flex items-center justify-center bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
