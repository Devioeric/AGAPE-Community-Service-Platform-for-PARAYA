"use client";

import { useEffect, useMemo, useState } from "react";

type ImpactAggregate = {
  schema: "agape.impact.aggregate.v1";
  asOf: string;
  indicators: Record<string, number>;
  qualitativeCounts: Record<string, number>;
  followUps: Record<string, number>;
};

export function ImpactAggregateSummary() {
  const [data, setData] = useState<ImpactAggregate | null>(null);
  useEffect(() => { fetch("/api/impact/analytics", { cache: "no-store" }).then(async response => response.ok ? response.json() : null).then(setData); }, []);
  const totals = useMemo(() => data ? {
    indicatorTypes: Object.keys(data.indicators).length,
    qualitative: Object.values(data.qualitativeCounts).reduce((sum, value) => sum + Number(value), 0),
    followUps: Object.values(data.followUps).reduce((sum, value) => sum + Number(value), 0),
  } : null, [data]);
  if (!data || !totals) return null;
  return <section className="grid gap-3 md:grid-cols-3" aria-label="Impact aggregate summary">
    <div className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">Indicator types measured</p><p className="mt-1 text-2xl font-semibold">{totals.indicatorTypes}</p></div>
    <div className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">Active qualitative records</p><p className="mt-1 text-2xl font-semibold">{totals.qualitative}</p></div>
    <div className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">Active follow-ups</p><p className="mt-1 text-2xl font-semibold">{totals.followUps}</p></div>
  </section>;
}
