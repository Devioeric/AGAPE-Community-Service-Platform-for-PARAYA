"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Bot, Building2, CheckCircle2, CircleAlert, Clock, FileText, History, MessageSquareQuote, Plus, RotateCcw, Sparkles } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import { PALETTE, tooltipProps } from "@/components/analytics/chart-kit";
import { contributorProposalStats, workflowEventLabel } from "@/lib/contributor/proposal-status";
import { SdgChips, StatusBadge, fmtDate, peso, useContributorOverview } from "./ContributorUi";

type Notification = { id: string; title: string; message: string; is_read: boolean; created_at: string; action_url: string | null };

const STATUS_SLICES = [
  { key: "draft", label: "Draft", color: PALETTE.muted },
  { key: "inReview", label: "In review", color: PALETTE.info },
  { key: "revisionsRequested", label: "Needs revision", color: PALETTE.warning },
  { key: "approved", label: "Approved", color: PALETTE.success },
  { key: "rejected", label: "Not approved", color: PALETTE.danger },
] as const;

/** Contributor home: the account's own proposals at a glance, what needs attention, and review activity. */
export function ContributorDashboard() {
  const { role, permissions } = useDashboardActor();
  const canCreate = hasCapability(role, permissions, "contributor.proposal.create") && hasCapability(role, permissions, "contributor.budget.prepare");
  const canUseAI = hasCapability(role, permissions, "ai.assist");
  const { data, loading, error, reload } = useContributorOverview();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    fetch("/api/notifications?page_size=5", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: Notification[] } | null) => setNotifications(body?.data ?? []))
      .catch(() => setNotifications([]));
  }, []);

  const proposals = useMemo(() => data?.proposals ?? [], [data]);
  const stats = useMemo(() => contributorProposalStats(proposals), [proposals]);
  const slices = STATUS_SLICES.map((slice) => ({ ...slice, value: stats[slice.key] })).filter((slice) => slice.value > 0);
  const revisions = proposals.filter((row) => row.status === "revisions_requested");
  const drafts = proposals.filter((row) => row.status === "draft");
  const recent = [...proposals].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 5);

  const kpis = [
    { label: "My Proposals", value: stats.total, sub: `${stats.draft} draft${stats.draft === 1 ? "" : "s"} not yet submitted`, icon: FileText, accent: "border-l-primary" },
    { label: "In Review", value: stats.inReview, sub: "With a PARAYA or Finance reviewer", icon: Clock, accent: "border-l-info" },
    { label: "Needs Your Revision", value: stats.revisionsRequested, sub: stats.revisionsRequested ? "Returned with Officer remarks" : "Nothing returned", icon: RotateCcw, accent: "border-l-warning" },
    { label: "Approved", value: stats.approved, sub: `${peso(stats.cashApproved)} approved budget`, icon: CheckCircle2, accent: "border-l-success" },
  ];

  return (
    <div className="space-y-6" data-testid="contributor-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {data && data.organizations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.organizations.map((org) => <span key={org.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs"><Building2 className="w-3 h-3 text-primary" /> {org.name}</span>)}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {canUseAI && <Link href="/contributor/chatbot"><Button variant="outline" className="gap-2"><Bot className="w-4 h-4" /> Ask AI</Button></Link>}
          {canCreate && <Link href="/contributor/proposals?new=1"><Button className="bg-primary hover:bg-primary-dark text-white gap-2"><Plus className="w-4 h-4" /> New Proposal</Button></Link>}
        </div>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm"><CircleAlert className="w-4 h-4 text-danger" /> {error} <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => void reload()}>Retry</Button></div>}
      {data && data.organizations.length === 0 && (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">Your account is not linked to an organization yet, so you cannot create proposals. Ask the System Administrator to link your office, student organization, or department.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className={`border-border shadow-card border-l-4 ${kpi.accent}`}>
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="text-3xl font-bold font-heading mt-1">{loading && !data ? "—" : kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
              </div>
              <kpi.icon className="w-5 h-5 text-primary/60" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="font-heading text-base flex items-center gap-2"><CircleAlert className="w-4 h-4 text-primary" /> Action Needed</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {revisions.length === 0 && drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">You are all caught up. {stats.total === 0 && canCreate ? "Start your first proposal to see it here." : "Nothing is waiting on you."}</p>
            ) : (
              <>
                {revisions.map((row) => (
                  <Link key={row.id} href={`/contributor/proposals?open=${row.id}`} className="block rounded-xl border border-accent/40 bg-accent/10 p-3 hover:border-accent" data-testid="action-revision">
                    <div className="flex items-center justify-between gap-2"><p className="font-medium text-sm">{row.title}</p><StatusBadge status={row.status} /></div>
                    {row.latestRemark && <p className="mt-1.5 text-sm text-foreground/80 flex gap-1.5"><MessageSquareQuote className="w-4 h-4 shrink-0 text-primary mt-0.5" /> <span className="line-clamp-2">{row.latestRemark.text}</span></p>}
                    <p className="mt-1 text-xs text-muted-foreground">Revise and resubmit · returned {fmtDate(row.latestRemark?.occurredAt ?? row.updatedAt)}</p>
                  </Link>
                ))}
                {drafts.map((row) => (
                  <Link key={row.id} href={`/contributor/proposals?open=${row.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 hover:border-primary/30 hover:bg-primary/5">
                    <div><p className="font-medium text-sm">{row.title}</p><p className="text-xs text-muted-foreground">Draft · last saved {fmtDate(row.updatedAt)} · submit when ready</p></div>
                    <StatusBadge status={row.status} />
                  </Link>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="pb-2"><CardTitle className="font-heading text-base">Proposal Status</CardTitle></CardHeader>
          <CardContent>
            {slices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">No proposals yet.</p>
            ) : (
              <>
                <div aria-label="Proposals by status">
                  <ResponsiveContainer width="100%" height={176}>
                    <PieChart>
                      <Pie data={slices} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2}>
                        {slices.map((slice) => <Cell key={slice.key} fill={slice.color} />)}
                      </Pie>
                      <Tooltip {...tooltipProps} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1 text-sm">
                  {slices.map((slice) => <li key={slice.key} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: slice.color }} />{slice.label}</span><span className="font-medium tabular-nums">{slice.value}</span></li>)}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">{peso(stats.cashRequested)} requested across active proposals</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border shadow-card lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="font-heading text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Recent Proposals</CardTitle><Link href="/contributor/proposals" className="text-xs text-primary hover:underline">View all</Link></CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">{loading && !data ? "Loading…" : "No proposals yet."}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {recent.map((row) => (
                  <li key={row.id}>
                    <Link href={`/contributor/proposals?open=${row.id}`} className="flex items-start justify-between gap-3 px-6 py-3 hover:bg-surface-alt/40">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{row.title}</p>
                        <p className="text-xs text-muted-foreground">{row.barangayName ?? "No barangay"} · {fmtDate(row.startsOn)} – {fmtDate(row.endsOn)} · {peso(row.cashTotal)}</p>
                        <SdgChips sdgs={row.sdgs} />
                      </div>
                      <StatusBadge status={row.status} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border shadow-card">
            <CardHeader className="pb-2"><CardTitle className="font-heading text-base flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Review Activity</CardTitle></CardHeader>
            <CardContent>
              {!data || data.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No review activity yet.</p>
              ) : (
                <ol className="space-y-3">
                  {data.activity.slice(0, 5).map((event, index) => (
                    <li key={`${event.proposalId}-${index}`} className="text-sm">
                      <p className="font-medium">{workflowEventLabel(event.action, event.toStatus)}</p>
                      <p className="text-xs text-muted-foreground truncate">{event.title} · {fmtDate(event.occurredAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
          <Card className="border-border shadow-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="font-heading text-base flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Notifications</CardTitle><Link href="/contributor/notifications" className="text-xs text-primary hover:underline">Open inbox</Link></CardHeader>
            <CardContent>
              {notifications === null ? <p className="text-sm text-muted-foreground">Loading…</p> : notifications.length === 0 ? <p className="text-sm text-muted-foreground">No notifications.</p> : (
                <ul className="space-y-2.5">
                  {notifications.map((item) => (
                    <li key={item.id} className="text-sm">
                      <p className={`${item.is_read ? "" : "font-medium"} line-clamp-1`}>{item.title}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(item.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {canUseAI && (
        <Card className="border-primary/20 bg-primary/5 shadow-card">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="font-heading font-semibold">AI help for your proposals</p>
                <p className="text-sm text-muted-foreground max-w-2xl">The AI Assistant answers questions about your proposals and the review process. In the proposal form, it can draft or improve your description, suggest titles, and check your draft before you submit. It only advises; PARAYA Officers make every decision.</p>
              </div>
            </div>
            <Link href="/contributor/chatbot"><Button variant="outline" className="gap-2 border-primary/30 text-primary"><Bot className="w-4 h-4" /> Open AI Assistant</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
