import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { dashboardTrendPresentation, type DashboardTrend } from "@/lib/dashboard/kpi-trend";

export function DashboardKpiTrend({ metricKey, value, trend }: { metricKey: string; value: number; trend: DashboardTrend }) {
  const display = dashboardTrendPresentation(metricKey, value, trend);
  const Icon = display.direction === "up" ? ArrowUpRight : display.direction === "down" ? ArrowDownRight : Minus;
  const color = display.tone === "positive" ? "text-success bg-success/10" : display.tone === "attention" ? "text-warning bg-warning/10" : "text-muted-foreground bg-muted/60";
  return <span data-kpi-trend={metricKey} className="mt-2 flex items-center gap-1.5 text-xs" title={display.detail}>
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${color}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
    <span className={display.tone === "positive" ? "text-success" : display.tone === "attention" ? "text-warning" : "text-muted-foreground"}>{display.label}</span>
    <span className="sr-only">{display.detail}</span>
  </span>;
}
