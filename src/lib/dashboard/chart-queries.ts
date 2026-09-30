import type { RemoteChartView } from "./chart-views";

// Reviewed current schema enums. Only exact, RLS-scoped HEAD counts are read.
export const DASHBOARD_CHART_QUERIES = {
  programs: { table: "programs", field: "status", buckets: [["draft", "Draft"], ["planning", "Planning"], ["upcoming", "Upcoming"], ["active", "Active"], ["completed", "Completed"], ["cancelled", "Cancelled"]] },
  proposals: { table: "project_proposals", field: "status", buckets: [["draft", "Draft"], ["submitted", "Submitted"], ["pre_screening", "Pre-screening"], ["sdg_review", "SDG review"], ["finance_review", "Finance review"], ["revisions_requested", "Revision requested"], ["approved", "Approved"], ["rejected", "Rejected"]] },
  needs: { table: "community_needs", field: "status", buckets: [["identified", "Identified"], ["in_progress", "In progress"], ["addressed", "Addressed"]] },
} satisfies Record<Exclude<RemoteChartView, "hours" | "sdg" | "budgets" | "allocations">, { table: string; field: string; buckets: string[][] }>;
