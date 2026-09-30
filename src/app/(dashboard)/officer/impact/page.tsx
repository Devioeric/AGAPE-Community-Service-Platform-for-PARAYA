"use client";

import { ImpactOverview } from "@/components/analytics/ImpactOverview";
import { NeedsAttention } from "@/components/impact/NeedsAttention";
import { ImpactContribution } from "@/components/impact/ImpactContribution";
import { IMPACT_GLOSSARY } from "@/components/impact/ImpactUi";

/** Overview tab: totals, what needs attention, the four charts, and how each number is defined. */
export default function OfficerImpactPage() {
  return (
    <div className="space-y-6">
      <ImpactOverview afterTotals={<><NeedsAttention /><ImpactContribution /></>} />
      <details className="group rounded-xl border border-border bg-card shadow-card">
        <summary className="cursor-pointer list-none px-5 py-4 font-heading text-base font-semibold text-foreground">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">›</span>How impact is measured
        </summary>
        <dl className="grid gap-4 border-t border-border px-5 py-4 md:grid-cols-2">
          {IMPACT_GLOSSARY.map((item) => (
            <div key={item.term}>
              <dt className="text-sm font-semibold text-foreground">{item.term}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{item.definition}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
