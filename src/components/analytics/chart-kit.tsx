"use client";

import type { ElementType, ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// PARAYA palette (see CLAUDE.md), shared by every Analytics chart.
export const PALETTE = {
  primary: "#6B5B3E", primaryLight: "#8B7A5E", accent: "#C4A96A", accentLight: "#E8D5A8",
  success: "#4A7C59", warning: "#B8860B", danger: "#9B3B3B", info: "#5B7FA5",
  muted: "#9C9488", text: "#6B6356", grid: "#E5DDD0", surfaceAlt: "#F5F0E8",
};

export const SERIES = [PALETTE.primary, PALETTE.accent, PALETTE.success, PALETTE.info, PALETTE.danger, PALETTE.warning, PALETTE.primaryLight, PALETTE.muted];

export const PRIORITY_META = {
  critical: { label: "Critical", color: PALETTE.danger },
  high: { label: "High", color: PALETTE.warning },
  medium: { label: "Medium", color: PALETTE.info },
  low: { label: "Low", color: PALETTE.muted },
} as const;

export const NEED_CATEGORY_COLORS: Record<string, string> = {
  Health: PALETTE.danger, Livelihood: PALETTE.accent, Education: PALETTE.info,
  Infrastructure: PALETTE.primary, Environment: PALETTE.success, Other: PALETTE.muted,
};

export const needCategoryColor = (category: string, index = 0) =>
  NEED_CATEGORY_COLORS[category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()] ?? SERIES[index % SERIES.length];

export const STAGE_META = {
  approved: { label: "Approved", color: PALETTE.success },
  in_review: { label: "In review", color: PALETTE.info },
  revisions: { label: "Revisions requested", color: PALETTE.warning },
  draft: { label: "Draft", color: PALETTE.muted },
  rejected: { label: "Rejected", color: PALETTE.danger },
} as const;

export const tooltipProps = {
  contentStyle: { background: "#FFFFFF", border: `1px solid ${PALETTE.grid}`, borderRadius: "8px", fontSize: "13px", color: "#2C2416" },
  cursor: { fill: PALETTE.surfaceAlt },
};
export const gridProps = { strokeDasharray: "3 3", stroke: PALETTE.grid };
export const axisTick = { fontSize: 12, fill: PALETTE.text };
export const legendFormatter = (value: string) => <span style={{ fontSize: 12, color: PALETTE.text }}>{value}</span>;
// Recharts 3 sorts legend items alphabetically by default; keep the series order instead.
export const legendProps = { iconType: "circle" as const, iconSize: 8, formatter: legendFormatter, itemSorter: null };

export function peso(value: number, compact = false) {
  if (compact && value >= 1000) return `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `₱${Math.round(value).toLocaleString("en-PH")}`;
}

export const shortLabel = (value: string, length = 14) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

export function ChartCard({ title, description, icon: Icon = BarChart3, children, className = "", footer }: {
  title: string; description?: string; icon?: ElementType; children: ReactNode; className?: string; footer?: ReactNode;
}) {
  return (
    <Card className={`border-border shadow-card ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-base flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>
        {children}
        {footer && <div className="mt-3 text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}

export function EmptyChart({ message, height = 240, icon: Icon = BarChart3 }: { message: string; height?: number; icon?: ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground" style={{ height }}>
      <Icon className="w-8 h-8 opacity-25" aria-hidden="true" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** A compact label/value/bar row for small ratios that do not need a full chart. */
export function RatioRow({ label, value, total, color = PALETTE.primary, detail }: { label: string; value: number; total: number; color?: string; detail?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-3">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{detail ?? `${value} of ${total} · ${pct}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
