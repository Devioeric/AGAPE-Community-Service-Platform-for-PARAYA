import {
  Activity,
  BadgeCheck,
  BadgeDollarSign,
  ChartNoAxesColumn,
  Bell,
  CalendarCheck,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileCheck2,
  FileText,
  Handshake,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Users,
  WalletCards,
  Wrench,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";
import type { DashboardSummaryCard } from "@/lib/dashboard/contracts";

// Cards a role's dashboard leaves out although the summary still reports them.
const HIDDEN_KPI_KEYS_BY_ROLE: Readonly<Record<string, readonly string[]>> = {
  paraya_officer: ["profiling_reviews"],
  barangay_secretary: ["partnership", "skills_assets", "approved_profiles", "profiling_acknowledgments"],
};

// Keep v1/v2 payloads compatible; notifications belong in the header inbox,
// not the operational KPI grid. Filter before calculating its layout.
export function getVisibleDashboardKpiCards(cards: readonly DashboardSummaryCard[], role?: string | null): DashboardSummaryCard[] {
  const hidden = (role && HIDDEN_KPI_KEYS_BY_ROLE[role]) || [];
  return cards.filter((card) => card.key !== "unread_notifications" && !hidden.includes(card.key));
}

// The installed Lucide version predates the packaged UserRoundClock export.
// Keep the requested semantic icon locally until the dependency is upgraded.
const UserRoundClock = createLucideIcon("UserRoundClock", [
  ["circle", { cx: "10", cy: "8", r: "4", key: "person" }],
  ["path", { d: "M3 21a7 7 0 0 1 11-5.74", key: "shoulders" }],
  ["circle", { cx: "17", cy: "17", r: "4", key: "clock" }],
  ["path", { d: "M17 15v2l1.25 1.25", key: "hands" }],
]);

export type DashboardKpiPresentation = {
  icon: LucideIcon;
  description: string;
};

export type DashboardKpiTone = "neutral" | "info" | "warning" | "success";

export const DASHBOARD_KPI_PRESENTATION: Record<string, DashboardKpiPresentation> = {
  active_users: { icon: Users, description: "Active approved-role accounts" },
  pending_users: { icon: UserRoundClock, description: "Awaiting account activation" },
  security_events: { icon: ShieldCheck, description: "Recorded in the last 30 days" },
  unread_notifications: { icon: Bell, description: "Open your notification inbox" },
  finance_queue: { icon: BadgeDollarSign, description: "Awaiting Finance Officer review" },
  budget_queue: { icon: WalletCards, description: "Submitted budgets awaiting review" },
  liquidation_queue: { icon: ReceiptText, description: "Submitted liquidations awaiting review" },
  integrity_queue: { icon: ShieldCheck, description: "Queued or failed integrity proofs" },
  programs: { icon: Activity, description: "All programs except cancelled" },
  proposal_queue: { icon: FileText, description: "Not yet approved or rejected" },
  report_queue: { icon: FileCheck2, description: "Draft or reviewed reports" },
  active_partnerships: { icon: Handshake, description: "Active and not expired" },
  partnership: { icon: Handshake, description: "Active and not expired" },
  profiling_reviews: { icon: ClipboardCheck, description: "Submitted packages requiring review" },
  needs_reviews: { icon: ClipboardList, description: "Secretary submissions requiring review" },
  needs_review: { icon: ClipboardList, description: "Submitted to the PARAYA Officer" },
  needs_revision: { icon: RotateCcw, description: "Returned for Secretary updates" },
  approved_profiles: { icon: BadgeCheck, description: "Validated profiling packages" },
  profiling_acknowledgments: { icon: CheckCheck, description: "Optional receipt; does not block reporting" },
  skills_assets: { icon: Wrench, description: "Recorded for this barangay" },
  joined_programs: { icon: CalendarCheck, description: "Approved, non-withdrawn sign-ups" },
  active_assignments: { icon: CalendarCheck, description: "Assigned or ongoing programs" },
  approved_hours: { icon: Clock, description: "Approved activity logs" },
  needs: { icon: ClipboardList, description: "Recorded for this barangay" },
};

const FALLBACK_PRESENTATION: DashboardKpiPresentation = {
  icon: ChartNoAxesColumn,
  description: "Open the related dashboard details",
};

export function getDashboardKpiPresentation(key: string): DashboardKpiPresentation {
  return DASHBOARD_KPI_PRESENTATION[key] ?? FALLBACK_PRESENTATION;
}

export function getDashboardKpiTone(key: string, tone: DashboardKpiTone): DashboardKpiTone {
  return Object.prototype.hasOwnProperty.call(DASHBOARD_KPI_PRESENTATION, key) ? tone : "neutral";
}
