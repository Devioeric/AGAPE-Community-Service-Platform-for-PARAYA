"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { DashboardSummaryDTO } from "@/lib/dashboard/contracts";

const toneClasses = {
  neutral: "border-gray-200 bg-white", info: "border-blue-200 bg-blue-50/40", warning: "border-amber-200 bg-amber-50/40", success: "border-emerald-200 bg-emerald-50/40",
};

export function UnifiedDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/dashboard/summary", { cache: "no-store" }).then(async response => response.ok ? response.json() : null)
      .then(payload => setSummary(payload?.data ?? null)).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading role summary…</div>;
  if (!summary) return null;
  return <section aria-label="Role summary">
    <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Your current summary</h2><span className="text-xs text-gray-500">Role-scoped · {new Date(summary.asOf).toLocaleString()}</span></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {summary.cards.map(card => <Link href={card.href} key={card.key} className={`rounded-xl border p-4 transition hover:shadow-sm ${toneClasses[card.tone]}`}>
        <p className="text-xs font-medium text-gray-600">{card.label}</p><p className="mt-1 text-2xl font-semibold">{card.value.toLocaleString()}</p>
        <span className="mt-2 flex items-center gap-1 text-xs text-gray-500">Open <ArrowRight className="h-3 w-3" /></span>
      </Link>)}
    </div>
  </section>;
}
