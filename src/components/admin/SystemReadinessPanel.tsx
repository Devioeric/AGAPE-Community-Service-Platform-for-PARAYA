"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import type { SystemReadinessDTO } from "@/lib/dashboard/contracts";

function State({ value }: { value: string | boolean }) {
  const safe = value === "off" || value === "v1" || value === false;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${safe ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
    {safe ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}{String(value)}
  </span>;
}

export function SystemReadinessPanel() {
  const [data, setData] = useState<SystemReadinessDTO | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/admin/readiness", { cache: "no-store" }).then(async response => response.ok ? response.json() : null).then(payload => setData(payload?.data ?? null)).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading readiness…</div>;
  if (!data) return <p className="text-sm text-red-700">Readiness state could not be loaded.</p>;
  const dbEntries = [
    ["Profiling", data.databaseModes.profiling], ["Finance integrity", data.databaseModes.financeIntegrity],
    ...Object.entries(data.databaseModes.phase2).map(([key, value]) => [`Phase 2 · ${key}`, value]),
    ...Object.entries(data.databaseModes.phase4).map(([key, value]) => [`Phase 4 · ${key}`, value]),
    ...Object.entries(data.databaseModes.communication).map(([key, value]) => [`Communication · ${key}`, value]),
  ];
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold text-paraya-brown">System readiness</h1><p className="text-sm text-gray-600">Read-only deployment boundary. No secret values or operational records are exposed.</p></div>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Application feature flags</h2><div className="mt-3 grid gap-2 md:grid-cols-2">{Object.entries(data.applicationFlags).map(([key, value]) => <div key={key} className="flex items-center justify-between gap-3 text-xs"><code className="break-all">{key}</code><State value={value} /></div>)}</div></section>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Database runtimes</h2><div className="mt-3 grid gap-2 md:grid-cols-2">{dbEntries.map(([label, value]) => <div key={label} className="flex items-center justify-between text-sm"><span>{label}</span><State value={value} /></div>)}</div></section>
    <section className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-white p-5"><p className="text-xs text-gray-500">Active / pending / suspended</p><p className="mt-2 text-xl font-semibold">{data.accountHealth.active} / {data.accountHealth.pending} / {data.accountHealth.suspended}</p></div><div className="rounded-xl border bg-white p-5"><p className="text-xs text-gray-500">Unmapped legacy accounts</p><p className="mt-2 text-xl font-semibold">{data.accountHealth.unmappedLegacy}</p></div><div className="rounded-xl border bg-white p-5"><p className="text-xs text-gray-500">Governed worker queue</p><p className="mt-2 text-xl font-semibold">{data.queues.notificationDelivery + data.queues.financeIntegrity + data.queues.partnerEmail}</p></div></section>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Mutation authority</h2><div className="mt-3 flex flex-wrap gap-3">{Object.entries(data.mutationAuthority).map(([key, value]) => <div key={key} className="flex items-center gap-2 text-sm"><span className="capitalize">{key}</span><State value={value} /></div>)}</div></section>
  </div>;
}
