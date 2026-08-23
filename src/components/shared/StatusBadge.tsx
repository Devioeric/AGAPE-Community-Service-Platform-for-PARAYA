import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/auth/roles";

type Status = "active" | "pending" | "suspended" | string;

const STATUS_STYLES: Record<string, string> = {
  active:    "bg-success/10 text-success border-success/20",
  pending:   "bg-warning/10 text-warning border-warning/20",
  suspended: "bg-danger/10 text-danger border-danger/20",
};

const STATUS_LABELS: Record<string, string> = {
  active:    "Active",
  pending:   "Pending",
  suspended: "Suspended",
};

// Color by group (PARAYA / barangay / volunteer / admin) so the three PARAYA
// roles and three barangay roles each share a consistent visual identity.
const ROLE_STYLES: Record<string, string> = {
  // PARAYA group — primary brown
  paraya_director:        "bg-primary/10 text-primary border-primary/20",
  paraya_associate:       "bg-primary/10 text-primary border-primary/20",
  paraya_researcher:      "bg-primary/10 text-primary border-primary/20",
  paraya_officer:         "bg-primary/10 text-primary border-primary/20",
  // Volunteer — info blue
  volunteer:              "bg-info/10 text-info border-info/20",
  // Barangay group — accent gold
  barangay_captain:       "bg-accent/20 text-primary-dark border-accent/30",
  barangay_secretary:     "bg-accent/20 text-primary-dark border-accent/30",
  barangay_mother_leader: "bg-accent/20 text-primary-dark border-accent/30",
  barangay_official:      "bg-accent/20 text-primary-dark border-accent/30",
  // Admin — neutral
  admin:                  "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
      STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border"
    )}>
      <span className={cn(
        "w-1.5 h-1.5 rounded-full mr-1.5",
        status === "active" ? "bg-success" : status === "pending" ? "bg-warning" : "bg-danger"
      )} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
      ROLE_STYLES[role] ?? "bg-muted text-muted-foreground border-border"
    )}>
      {roleLabel(role)}
    </span>
  );
}
