"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, MapPin, FileText, ClipboardList,
  UserCheck, Activity, Gift, BarChart3, Bot, TrendingUp,
  MessageSquare, LogOut, ChevronDown, Wrench, Megaphone,
  BookOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { hasCapability, type Capability } from "@/lib/auth/capabilities";

type NavChild = {
  label: string;
  href:  string;
  /** Optional dbRole allowlist — if set, only these roles see this child. */
  roles?: string[];
  /** Optional capabilities that must all remain available after deny overrides. */
  capabilities?: readonly Capability[];
};
type NavItem = {
  label:      string;
  href?:      string;       // undefined for group items
  icon:       React.ElementType;
  moduleKey?: string;
  children?:  NavChild[];
  /** Optional dbRole allowlist — if set, only these roles see this item. */
  roles?:     string[];
};

const NAV_MODULE_CAPABILITIES: Record<string, readonly Capability[]> = {
  partnerships: ["partnership.read"], partnership: ["partnership.read"], barangay: ["partnership.read"],
  proposals: ["proposal.read", "legacy_partner.history.read"], profiling: ["profiling.collect", "profiling.validate", "profiling.endorse", "profiling.detail.read", "profiling.aggregate.read"],
  community_profile: ["survey.read", "community_need.read", "observation.read"], submit_needs: ["community_need.submit", "community_need.validate"],
  volunteers: ["volunteer.directory.read", "volunteer.manage"], skills_assets: ["skill_asset.read"],
  programs: ["program.read", "legacy_partner.history.read"], donations: ["donation.read"], analytics: ["analytics.aggregate.read"],
  impact: ["impact.read"], reports: ["report.read"], forum: ["communication.read"], surveys: ["survey.read"],
};

// Scope-aligned nav for PARAYA staff (Director / Associate / Researcher).
// Top-level items match the modules declared in the Scope & Delimitation
// document; related pages live as sub-nav under their owning module.
const officerNav: NavItem[] = [
  { label: "Dashboard", href: "/officer", icon: LayoutDashboard },

  // Partnership Management Module
  { label: "Partnership Management", href: "/officer/partnerships", icon: MapPin, moduleKey: "partnerships" },

  // Project Proposal and Approval Workflow Module
  {
    label: "Project Proposals",
    icon: FileText,
    moduleKey: "proposals",
    children: [
      { label: "All Proposals",     href: "/officer/proposals" },
      { label: "Finance Clearance", href: "/officer/finance", roles: ["finance_officer", "paraya_director"] },
      { label: "Structured Proposals & Finance", href: "/officer/phase-2", capabilities: ["proposal.read"] },
    ],
  },

  { label: "Resident Profiling", href: "/officer/profiling", icon: Users, moduleKey: "profiling" },

  // Community Needs Assessment Module
  {
    label: "Community Needs Assessment",
    icon: ClipboardList,
    moduleKey: "community_profile",
    children: [
      { label: "Legacy Household Data", href: "/officer/community-profile" },
      { label: "Survey Builder",      href: "/officer/surveys" },
      { label: "Survey Analysis",     href: "/officer/surveys/analysis" },
      { label: "Pre/Post Compare",    href: "/officer/surveys/compare" },
      { label: "Field Observations",  href: "/officer/observations" },
    ],
  },

  // Volunteer Management Module
  {
    label: "Volunteer Management",
    icon: UserCheck,
    moduleKey: "volunteers",
    children: [
      { label: "Volunteer Directory", href: "/officer/volunteers" },
      { label: "Attendance",          href: "/officer/attendance" },
    ],
  },

  // Skill and Asset Documentation Module
  { label: "Skill & Asset Documentation", href: "/officer/skills-assets", icon: Wrench, moduleKey: "skills_assets" },

  // Program Tracking and Monitoring Module
  { label: "Program Tracking", href: "/officer/programs", icon: Activity, moduleKey: "programs" },

  // Donation and Resource Management Module
  { label: "Donation Management", href: "/officer/donations", icon: Gift, moduleKey: "donations" },

  // Analytics Module
  {
    label: "Analytics",
    icon: BarChart3,
    moduleKey: "analytics",
    children: [
      { label: "Overview",          href: "/officer/analytics" },
      { label: "SDG Impact Tracker",href: "/officer/analytics/sdg" },
      { label: "Volunteers",        href: "/officer/analytics/volunteers" },
      { label: "Community Needs",   href: "/officer/analytics/community-needs" },
      { label: "Recommendations",   href: "/officer/analytics/recommendations", capabilities: ["analytics.aggregate.read", "ai.assist"] },
      { label: "Proposal Pipeline", href: "/officer/analytics/proposals" },
      { label: "Snapshots",         href: "/officer/analytics/snapshots" },
    ],
  },

  // Impact Measurement Module
  { label: "Impact Measurement", href: "/officer/impact", icon: TrendingUp, moduleKey: "impact" },

  // Reporting Module (includes AI Narrative Report feature)
  { label: "Reporting", href: "/officer/reports", icon: BookOpen, moduleKey: "reports" },

  // Communication Module (Forum lives here; in-app Notifications and the
  // AI Chatbot stay pinned at the bottom of the sidebar for global access)
  {
    label: "Communication",
    icon: Megaphone,
    moduleKey: "forum",
    children: [
      { label: "Discussion Forum", href: "/officer/forum" },
    ],
  },
];

// Volunteer nav — scope-aligned to the modules a DYCI student volunteer
// participates in (Partnership view, Volunteer Management, Community Needs
// data collection, Communication).
const volunteerNav: NavItem[] = [
  { label: "Dashboard", href: "/volunteer", icon: LayoutDashboard },

  // Partnership Management Module (view-only for volunteers)
  { label: "Partnership Management", href: "/volunteer/barangay", icon: MapPin, moduleKey: "barangay" },

  // Volunteer Management Module
  {
    label: "Volunteer Management",
    icon: UserCheck,
    moduleKey: "programs",
    children: [
      { label: "Available Programs", href: "/volunteer/programs" },
      { label: "My Schedule",        href: "/volunteer/schedule" },
      { label: "Check In",           href: "/volunteer/check-in" },
      { label: "Log Activity",       href: "/volunteer/log-activity" },
      { label: "My Hours",           href: "/volunteer/hours" },
    ],
  },

  // Community Needs Assessment Module
  {
    label: "Community Needs Assessment",
    icon: ClipboardList,
    moduleKey: "surveys",
    children: [
      { label: "Beneficiary Surveys", href: "/volunteer/surveys" },
    ],
  },

  // Communication Module
  {
    label: "Communication",
    icon: Megaphone,
    moduleKey: "forum",
    children: [
      { label: "Discussion Forum", href: "/volunteer/forum" },
    ],
  },
];

// Barangay nav — Captain / Secretary / Mother Leader. Captain-only items
// (Approvals) are gated via the `roles` allowlist on the child.
const barangayNav: NavItem[] = [
  { label: "Dashboard", href: "/barangay", icon: LayoutDashboard },

  // Partnership Management Module (own-barangay view)
  { label: "Partnership Management", href: "/barangay/partnership", icon: MapPin, moduleKey: "partnership" },

  { label: "Resident Profiling", href: "/barangay/profiling", icon: Users, moduleKey: "profiling" },

  // Community Needs Assessment Module
  {
    label: "Community Needs Assessment",
    icon: ClipboardList,
    moduleKey: "submit_needs",
    children: [
      { label: "Submit Community Needs", href: "/barangay/submit-needs" },
      { label: "Approval Queue",         href: "/barangay/approvals", roles: ["barangay_captain"] },
      { label: "Survey Responses",       href: "/barangay/surveys" },
    ],
  },

  // Reporting Module
  { label: "Reporting", href: "/barangay/reports", icon: BookOpen, moduleKey: "reports" },

  // Communication Module
  {
    label: "Communication",
    icon: Megaphone,
    moduleKey: "forum",
    children: [
      { label: "Discussion Forum", href: "/barangay/forum" },
    ],
  },
];

// Admin nav — the User Management Module groups every admin-only surface
// (accounts, audit trail, backups) under the scope-aligned heading.
const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    label: "User Management",
    icon: Users,
    children: [
      { label: "Users",              href: "/admin/users" },
      { label: "Audit Logs",         href: "/admin/audit-logs" },
      { label: "Backup & Recovery",  href: "/admin/backup" },
      { label: "Financial Integrity", href: "/admin/integrity", capabilities: ["integrity.provider.manage"] },
      { label: "Communication Delivery", href: "/admin/communications", capabilities: ["communication.provider.manage"] },
      { label: "System Readiness", href: "/admin/readiness", capabilities: ["admin.audit.read"] },
    ],
  },
];

// Finance Officer — focused on the Project Proposal and Approval Workflow
// Module. They get a stripped-down sidebar so they aren't distracted by
// program/volunteer ops they don't act on. They can browse all proposals
// read-only for context (the proposals POST is already gated to staff).
const financeNav: NavItem[] = [
  { label: "Dashboard", href: "/officer", icon: LayoutDashboard },
  {
    label: "Project Proposals",
    icon: FileText,
    children: [
      { label: "Finance Clearance", href: "/officer/finance" },
      { label: "All Proposals",     href: "/officer/proposals" },
      { label: "Structured Finance", href: "/officer/phase-2", capabilities: ["budget.read"] },
    ],
  },
];

// Former institutional identities are retained temporarily for historical
// attribution only. They cannot mutate records or view volunteer PII.
const partnerNav: NavItem[] = [
  { label: "Dashboard", href: "/partner", icon: LayoutDashboard },
  { label: "Project Proposals", href: "/partner/proposals", icon: FileText, moduleKey: "proposals" },
  { label: "Program Tracking", href: "/partner/programs", icon: Activity, moduleKey: "programs" },
];

// Segment-based fallback nav. The real role from the DB ("dbRole") can be one
// of 11 values; segments are 5 high-level groupings (officer / volunteer /
// barangay / partner / admin). Per-role nav differentiation can be layered on later.
const NAV_MAP: Record<string, NavItem[]> = {
  officer: officerNav, volunteer: volunteerNav, barangay: barangayNav, partner: partnerNav, admin: adminNav,
};

interface SidebarProps {
  /** Route segment: "officer" | "volunteer" | "barangay" | "admin" */
  role:        string;
  /** Actual DB role (e.g. "paraya_director", "barangay_captain"). Optional, defaults to the segment when not provided. */
  dbRole?:     string;
  userName:    string;
  userEmail:   string;
  permissions?: Record<string, boolean>;
}

export function Sidebar({ role, dbRole, userName, userEmail, permissions = {} }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();

  // NAV_MAP is keyed by segment (officer/volunteer/barangay/partner/admin).
  // Per-role override: Finance Officers get a focused sidebar even though they
  // share the /officer segment with PARAYA staff. Per-item `roles?` allowlist
  // applies on top of that.
  const allNav = dbRole === "finance_officer" ? financeNav : (NAV_MAP[role] ?? volunteerNav);

  // Filter top-level items by permissions + role allowlist, AND filter
  // sub-nav children by their own role allowlist (e.g. Finance Clearance
  // is only visible to finance_officer / paraya_director / admin, even
  // though the parent "Project Proposals" group is visible to everyone).
  const navItems = allNav
    .filter((item) => {
      if (item.moduleKey) {
        const capabilities = NAV_MODULE_CAPABILITIES[item.moduleKey] ?? [];
        if (capabilities.length > 0 && !capabilities.some((capability) => hasCapability(dbRole, permissions, capability))) return false;
      }
      if (item.roles && dbRole && !item.roles.includes(dbRole))    return false;
      return true;
    })
    .map((item) => {
      if (!item.children) return item;
      const filteredChildren = item.children.filter(
        (c) => (!c.roles || (dbRole && c.roles.includes(dbRole)))
          && (!c.capabilities || c.capabilities.every((capability) => hasCapability(dbRole, permissions, capability))),
      );
      return { ...item, children: filteredChildren };
    })
    .filter((item) => !item.children || item.children.length > 0);

  // Track manually-toggled groups (groups with active children auto-expand always)
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());

  function isChildActive(children: NavChild[]) {
    return children.some((c) =>
      c.href === pathname || pathname.startsWith(c.href + "/")
    );
  }

  function isGroupExpanded(item: NavItem) {
    if (!item.children) return false;
    return isChildActive(item.children) || manualExpanded.has(item.label);
  }

  function toggleGroup(label: string, children: NavChild[]) {
    if (isChildActive(children)) return; // auto-expanded, can't collapse
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-[280px] bg-surface-alt border-r border-border flex flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <Image src="/paraya-logo.png" alt="PARAYA Logo" width={44} height={44} className="rounded-full flex-shrink-0" priority />
        <div>
          <p className="font-heading font-bold text-primary-dark leading-tight">AGAPE</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">PARAYA · DYCI</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-3">
        {/* Admin section switcher — only visible when dbRole is admin */}
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            // ── Group item (has children) ──────────────────────────────────────
            if (item.children) {
              const expanded   = isGroupExpanded(item);
              const groupActive = isChildActive(item.children);
              return (
                <li key={item.label}>
                  {/* Group toggle button */}
                  <button
                    onClick={() => toggleGroup(item.label, item.children!)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border-l-4 pl-2",
                      groupActive
                        ? "bg-primary/10 text-primary border-primary"
                        : "text-foreground/70 hover:bg-primary/5 hover:text-primary border-transparent",
                    )}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200",
                        expanded ? "rotate-180" : "",
                      )}
                    />
                  </button>

                  {/* Sub-items */}
                  {expanded && (
                    <ul className="mt-0.5 ml-4 pl-3 border-l border-border space-y-0.5">
                      {item.children.map((child) => {
                        const exactMatch  = child.href === pathname;
                        const prefixMatch = pathname.startsWith(child.href + "/");
                        // A child is active on prefix only if no longer-href sibling also matches
                        const hasMoreSpecificSibling = prefixMatch && item.children!.some(
                          (c) => c.href !== child.href
                            && c.href.length > child.href.length
                            && (c.href === pathname || pathname.startsWith(c.href + "/"))
                        );
                        const childActive = exactMatch || (prefixMatch && !hasMoreSpecificSibling);
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150",
                                childActive
                                  ? "bg-primary/10 text-primary"
                                  : "text-foreground/60 hover:bg-primary/5 hover:text-primary",
                              )}
                            >
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors",
                                childActive ? "bg-primary" : "bg-muted-foreground/40",
                              )} />
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }

            // ── Regular nav item ───────────────────────────────────────────────
            // Yield to any sub-nav child (in any group) whose href is a more
            // specific match for the current pathname.
            const overriddenBySubnav = navItems.some((other) =>
              other.children?.some((c) =>
                c.href.length > item.href!.length
                  && (c.href === pathname || pathname.startsWith(c.href + "/"))
              )
            );
            const isActive = item.href === `/${role}`
              ? pathname === item.href
              : pathname.startsWith(item.href!) && !overriddenBySubnav;
            return (
              <li key={item.href}>
                <Link
                  href={item.href!}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-primary/10 text-primary border-l-4 border-primary pl-2"
                      : "text-foreground/70 hover:bg-primary/5 hover:text-primary border-l-4 border-transparent pl-2"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Operational assistant/notifications are not exposed to infrastructure Admin or retired partner identities. */}
        {(hasCapability(dbRole, permissions, "ai.assist") || hasCapability(dbRole, permissions, "communication.read")) && <div className="mt-4 pt-4 border-t border-border">
          {hasCapability(dbRole, permissions, "ai.assist") && <Link
            href={`/${role}/chatbot`}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
              pathname.startsWith(`/${role}/chatbot`)
                ? "bg-accent/20 text-primary border-l-4 border-accent pl-2"
                : "text-foreground/70 hover:bg-accent/10 hover:text-primary border-l-4 border-transparent pl-2"
            )}
          >
            <Bot className="w-4 h-4 flex-shrink-0" />
            AI Assistant
          </Link>}
          {hasCapability(dbRole, permissions, "communication.read") && <Link
            href={`/${role}/notifications`}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mt-0.5",
              pathname.startsWith(`/${role}/notifications`)
                ? "bg-primary/10 text-primary border-l-4 border-primary pl-2"
                : "text-foreground/70 hover:bg-primary/5 hover:text-primary border-l-4 border-transparent pl-2"
            )}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            Notifications
          </Link>}
        </div>}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">{userName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
        </div>
        <Button
          variant="ghost" size="sm"
          className="w-full justify-start text-muted-foreground hover:text-danger hover:bg-danger/5 gap-2"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
