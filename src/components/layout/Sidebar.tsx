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
  BookOpen, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { canAccessPage, hasCapability, type Capability } from "@/lib/auth/capabilities";
import { getNavigationEntryForPath, getSectionTabs, isNavigationEntryVisible, type NavigationFeatureFlags } from "@/lib/navigation/catalog";

type NavChild = {
  label: string;
  href:  string;
  /** Optional dbRole allowlist — if set, only these roles see this child. */
  roles?: string[];
  /** Catalog section id; the link lands on the first tab this user can open. */
  section?: string;
  /** Optional capabilities that must all remain available after deny overrides. */
  capabilities?: readonly Capability[];
};
type NavItem = {
  label:      string;
  href?:      string;       // undefined for group items
  icon:       React.ElementType;
  moduleKey?: string;
  /** Catalog section id; the link lands on the first tab this user can open and stays active on every tab. */
  section?:   string;
  children?:  NavChild[];
  /** Optional dbRole allowlist — if set, only these roles see this item. */
  roles?:     string[];
};

const NAV_MODULE_CAPABILITIES: Record<string, readonly Capability[]> = {
  partnerships: ["partnership.read"], partnership: ["partnership.read"], barangay: ["partnership.read"],
  proposals: ["proposal.read", "legacy_partner.history.read"], profiling: ["profiling.collect", "profiling.validate", "profiling.acknowledge", "profiling.detail.read", "profiling.aggregate.read"],
  community_profile: ["profiling.aggregate.read", "profiling.detail.read", "survey.read", "community_need.read", "observation.read"], submit_needs: ["community_need.submit", "community_need.validate"],
  volunteers: ["volunteer.directory.read", "volunteer.manage"], skills_assets: ["skill_asset.read"],
  programs: ["program.read", "legacy_partner.history.read"], donations: ["donation.read"], analytics: ["analytics.aggregate.read"],
  impact: ["impact.read"], reports: ["report.read"], forum: ["communication.read"], surveys: ["survey.read"],
  contributor_proposals: ["contributor.proposal.read"],
};

// Scope-aligned nav for PARAYA staff (PARAYA Officer).
// Top-level items match the modules declared in the Scope & Delimitation
// document; related pages live as sub-nav under their owning module.
const officerNav: NavItem[] = [
  { label: "Dashboard", href: "/officer", icon: LayoutDashboard },

  // Partnership Management Module
  { label: "Partnership Management", href: "/officer/partnerships", icon: MapPin, moduleKey: "partnerships" },

  // Project Proposal and Approval Workflow Module: one link; its pages are tabs
  // of the officer.proposals catalog section. moduleKey keeps it hidden when the
  // proposals module is switched off, as the group was.
  { label: "Project Proposals", href: "/officer/proposals", icon: FileText, moduleKey: "proposals", section: "officer.proposals" },

  // Community Needs Assessment Module (including Community Profile)
  {
    label: "Community Needs Assessment",
    icon: ClipboardList,
    moduleKey: "community_profile",
    children: [
      // Section children land on the first tab the user can open, so an Officer
      // without the community_needs module still reaches Field Observations.
      { label: "Community Profile", href: "/officer/profiling", section: "officer.profiling" },
      { label: "Community Needs", href: "/officer/community-needs", section: "officer.community-needs" },
      { label: "Surveys",             href: "/officer/surveys", section: "officer.surveys" },
    ],
  },

  // Volunteer Management Module: one link; Directory and Attendance are tabs of
  // the officer.volunteers section. No moduleKey: Attendance is a separate
  // permission module, so an Officer without the volunteers module lands there.
  { label: "Volunteer Management", href: "/officer/volunteers", icon: UserCheck, section: "officer.volunteers" },

  // Skill and Asset Documentation Module
  { label: "Skill & Asset Documentation", href: "/officer/skills-assets", icon: Wrench, moduleKey: "skills_assets" },

  // Program Tracking and Monitoring Module
  { label: "Program Tracking", href: "/officer/programs", icon: Activity, moduleKey: "programs" },

  // Donation and Resource Management Module
  { label: "Donation Management", href: "/officer/donations", icon: Gift, moduleKey: "donations" },

  // Analytics Module: one link; its pages are tabs of the officer.analytics
  // catalog section (see src/app/(dashboard)/officer/analytics/layout.tsx).
  { label: "Analytics", href: "/officer/analytics", icon: BarChart3, moduleKey: "analytics" },

  // Impact Measurement Module
  { label: "Impact Measurement", href: "/officer/impact", icon: TrendingUp, moduleKey: "impact" },

  // Reporting Module (includes AI Narrative Report feature)
  { label: "Reporting", href: "/officer/reports", icon: BookOpen, moduleKey: "reports" },

  // Communication Module: one link to the Discussion Forum, its only page.
  // In-app Notifications and the AI Chatbot stay pinned at the bottom of the
  // sidebar for global access.
  { label: "Communication", href: "/officer/forum", icon: Megaphone, moduleKey: "forum" },
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

// Barangay nav — Barangay Secretary is the only active barangay login role.
const barangayNav: NavItem[] = [
  { label: "Dashboard", href: "/barangay", icon: LayoutDashboard },

  // Partnership Management Module (own-barangay view)
  { label: "Partnership Management", href: "/barangay/partnership", icon: MapPin, moduleKey: "partnership" },

  // Community Needs Assessment Module: one link to the barangay.needs-assessment
  // catalog section (Community Profile, Community Needs, Surveys tabs). No
  // moduleKey: each tab is capability-checked, and the link disappears only
  // when the Secretary can open none of them.
  { label: "Community Needs Assessment", href: "/barangay/submit-needs", icon: ClipboardList, section: "barangay.needs-assessment" },

  { label: "Skill & Asset Documentation", href: "/barangay/skills-assets", icon: Wrench, moduleKey: "skills_assets" },

  // Reporting Module
  { label: "Reporting", href: "/barangay/reports", icon: BookOpen, moduleKey: "reports" },

  // Communication Module: one link to the forum, as on the Officer sidebar.
  { label: "Communication", href: "/barangay/forum", icon: Megaphone, moduleKey: "forum" },
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
  // One link: Finance clearance (the first tab for this role, so the link lands
  // there), All proposals, and Structured proposals & finance are officer.proposals tabs.
  { label: "Project Proposals", href: "/officer/finance", icon: FileText, section: "officer.proposals" },
];

// Former institutional identities are retained temporarily for historical
// attribution only. They cannot mutate records or view volunteer PII.
const partnerNav: NavItem[] = [
  { label: "Dashboard", href: "/partner", icon: LayoutDashboard },
  { label: "Project Proposals", href: "/partner/proposals", icon: FileText, moduleKey: "proposals" },
  { label: "Program Tracking", href: "/partner/programs", icon: Activity, moduleKey: "programs" },
];

// Contributor navigation is intentionally small. Proponents create and submit
// proposals for Officer review; they do not receive Officer operations,
// resident profiling, finance clearance, or administrative controls.
const contributorNav: NavItem[] = [
  { label: "Dashboard", href: "/contributor", icon: LayoutDashboard },
  { label: "My Proposals", href: "/contributor/proposals", icon: FileText, moduleKey: "contributor_proposals" },
];

// Segment-based fallback nav. The real role from the DB ("dbRole") can be one
// of 11 values; segments are 5 high-level groupings (officer / volunteer /
// barangay / partner / admin). Per-role nav differentiation can be layered on later.
const NAV_MAP: Record<string, NavItem[]> = {
  officer: officerNav, volunteer: volunteerNav, barangay: barangayNav, partner: partnerNav, contributor: contributorNav, admin: adminNav,
};

interface SidebarProps {
  /** Route segment: "officer" | "volunteer" | "barangay" | "contributor" | "admin" */
  role:        string;
  /** Actual DB role (e.g. "paraya_officer", "barangay_secretary"). Optional, defaults to the segment when not provided. */
  dbRole?:     string;
  userName:    string;
  userEmail:   string;
  permissions?: Record<string, boolean>;
  featureFlags?: NavigationFeatureFlags;
  embedded?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({ role, dbRole, userName, userEmail, permissions = {}, featureFlags, embedded = false, collapsed = false, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();
  const isCollapsed = collapsed && !embedded;

  // NAV_MAP is keyed by segment (officer/volunteer/barangay/partner/admin).
  // Per-role override: Finance Officers get a focused sidebar even though they
  // share the /officer segment with PARAYA staff. Per-item `roles?` allowlist
  // applies on top of that.
  const allNav = dbRole === "finance_officer" ? financeNav : (NAV_MAP[role] ?? volunteerNav);

  function catalogVisible(path: string) {
    if (!dbRole) return true;
    const metadata = getNavigationEntryForPath(path);
    return Boolean(metadata && isNavigationEntryVisible(metadata, dbRole, permissions, featureFlags));
  }

  // Notifications are self-scoped and intentionally do not require the
  // broader `communication.read` capability.  In particular, Contributors
  // receive proposal-status notifications but must not receive forum or
  // communication-management permissions.  Resolve the destination through
  // the catalog so the rollout flag and role-specific route checks still
  // apply to this pinned link.
  const notificationsEntry = dbRole
    ? getNavigationEntryForPath(`/${role}/notifications`)
    : null;
  const canSeeNotifications = Boolean(
    dbRole
      && notificationsEntry
      && isNavigationEntryVisible(notificationsEntry, dbRole, permissions, featureFlags)
      && canAccessPage(dbRole, permissions, `/${role}/notifications`),
  );

  // Filter top-level items by permissions + role allowlist, AND filter
  // sub-nav children by their own role allowlist and capabilities.
  const navItems = allNav
    // A section link lands on the first tab this user can open, and
    // disappears when there is none (the same rule as section children).
    .flatMap((item) => {
      if (!item.section || !dbRole) return [item];
      const first = getSectionTabs(item.section, dbRole, permissions)[0];
      return first?.href ? [{ ...item, href: first.href }] : [];
    })
    .filter((item) => {
      if (item.moduleKey) {
        const capabilities = NAV_MODULE_CAPABILITIES[item.moduleKey] ?? [];
        if (capabilities.length > 0 && !capabilities.some((capability) => hasCapability(dbRole, permissions, capability))) return false;
      }
      if (item.roles && dbRole && !item.roles.includes(dbRole))    return false;
      if (item.href && !catalogVisible(item.href)) return false;
      return true;
    })
    .map((item) => {
      if (!item.children) return item;
      const filteredChildren = item.children
        .flatMap((c) => {
          if (!c.section || !dbRole) return [c];
          const first = getSectionTabs(c.section, dbRole, permissions)[0];
          return first?.href ? [{ ...c, href: first.href }] : [];
        })
        .filter(
        (c) => (!c.roles || (dbRole && c.roles.includes(dbRole)))
          && (!c.capabilities || c.capabilities.every((capability) => hasCapability(dbRole, permissions, capability))),
        )
        .filter((c) => catalogVisible(c.href));
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

  function toggleCollapsed() {
    onCollapsedChange?.(!isCollapsed);
  }

  function childIsActive(child: NavChild) {
    return child.href === pathname || pathname.startsWith(child.href + "/");
  }

  function CollapsedTooltip({ label, children }: { label: string; children: React.ReactElement }) {
    if (!isCollapsed) return children;
    return (
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent
          side="right"
          align="center"
          sideOffset={8}
          data-sidebar-tooltip="true"
          className="sidebar-nav-tooltip"
        >
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  function CollapsedGroup({ item }: { item: NavItem }) {
    const children = item.children ?? [];
    const groupActive = isChildActive(children);
    const [open, setOpen] = useState(false);
    const trigger = (
      <PopoverTrigger
        aria-label={item.label}
        className={cn(
          "flex h-10 w-full items-center justify-center rounded-lg border-l-4 px-2 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary",
          groupActive
            ? "border-primary bg-primary/10 text-primary"
            : "border-transparent text-foreground/70 hover:bg-primary/5 hover:text-primary",
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      </PopoverTrigger>
    );
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip open={open ? false : undefined}>
          <TooltipTrigger render={trigger} />
          <TooltipContent
            side="right"
            align="center"
            sideOffset={8}
            data-sidebar-tooltip="true"
            className="sidebar-nav-tooltip"
          >
            {item.label}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" sideOffset={8} className="w-64 p-2">
          <PopoverHeader className="px-2 py-1">
            <PopoverTitle>{item.label}</PopoverTitle>
          </PopoverHeader>
          <div className="mt-1 space-y-0.5">
            {children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  "flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary",
                  childIsActive(child)
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70 hover:bg-primary/5 hover:text-primary",
                )}
              >
                {child.label}
              </Link>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <TooltipProvider delay={150}>
    <aside
      data-testid="desktop-sidebar"
      data-sidebar-collapsed={isCollapsed ? "true" : "false"}
      className={cn(
        "agape-sidebar max-w-full overflow-hidden bg-surface-alt border-r border-border flex flex-col",
        isCollapsed ? "w-[72px]" : "w-[280px]",
        embedded ? "relative h-full min-h-0" : "fixed inset-y-0 left-0 z-50",
      )}
    >
      {/* Brand */}
      <div className={cn("border-b border-border", isCollapsed ? "px-2" : "px-5")}>
        {embedded ? (
          <div className="flex items-center gap-3 py-4">
            <Image src="/paraya-logo.png" alt="PARAYA Logo" width={44} height={44} className="shrink-0 rounded-full" priority />
            <span className="min-w-0 whitespace-nowrap">
              <span className="block font-heading font-bold leading-tight text-primary-dark">AGAPE</span>
              <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">PARAYA · DYCI</span>
            </span>
          </div>
        ) : <Tooltip>
          <TooltipTrigger
            render={<button type="button" />}
            aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!isCollapsed}
            data-testid="sidebar-collapse-toggle"
            onClick={toggleCollapsed}
            className={cn(
              "flex w-full items-center gap-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isCollapsed ? "justify-center" : "justify-start",
            )}
          >
            <span className="relative flex shrink-0">
              <Image src="/paraya-logo.png" alt="PARAYA Logo" width={44} height={44} className="shrink-0 rounded-full" priority />
              {isCollapsed && (
                <span
                  data-testid="sidebar-collapse-indicator"
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-surface"
                >
                  <PanelLeftOpen className="size-3" />
                </span>
              )}
            </span>
            <span className={cn("min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200", isCollapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[180px] opacity-100")}>
              <span className="block font-heading font-bold leading-tight text-primary-dark">AGAPE</span>
              <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">PARAYA · DYCI</span>
            </span>
            {!isCollapsed && <PanelLeftClose aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />}
          </TooltipTrigger>
          <TooltipContent
            side="right"
            align="center"
            sideOffset={8}
            data-sidebar-tooltip="true"
            className="sidebar-nav-tooltip"
          >
            {isCollapsed ? "Expand navigation" : "Collapse navigation"}
          </TooltipContent>
        </Tooltip>}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 overflow-y-auto scrollbar-thin py-4", isCollapsed ? "px-2" : "px-3")}>
        {/* Admin section switcher — only visible when dbRole is admin */}
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            // ── Group item (has children) ──────────────────────────────────────
            if (item.children) {
              const expanded   = isGroupExpanded(item);
              const groupActive = isChildActive(item.children);
              if (isCollapsed) {
                return <li key={item.label}><CollapsedGroup item={item} /></li>;
              }
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
                    <ul className="mt-0.5 ml-4 pl-3 border-l border-border space-y-0.5 animate-nav-submenu-in origin-top">
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
            // A section link stays active on every tab, even when the tab URLs
            // share no prefix (/officer/proposals and /officer/phase-2).
            const sectionHrefs = item.section && dbRole
              ? getSectionTabs(item.section, dbRole, permissions).map((tab) => tab.href!)
              : [];
            const isActive = item.href === `/${role}`
              ? pathname === item.href
              : sectionHrefs.length > 0
                ? sectionHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`))
                : pathname.startsWith(item.href!) && !overriddenBySubnav;
            return (
              <li key={item.href}>
                <CollapsedTooltip label={item.label}>
                  <Link
                    href={item.href!}
                    aria-label={item.label}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary",
                      isCollapsed ? "h-10 justify-center px-2" : "gap-3 px-3 py-2.5",
                      isActive
                        ? "bg-primary/10 text-primary border-l-4 border-primary pl-2"
                        : "text-foreground/70 hover:bg-primary/5 hover:text-primary border-l-4 border-transparent pl-2"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {/* Long labels wrap like group headers; they stay on one line while collapsing. */}
                    <span className={cn("min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-200", isCollapsed ? "max-w-0 -translate-x-2 opacity-0 whitespace-nowrap" : "max-w-[220px] opacity-100 leading-snug")}>{item.label}</span>
                  </Link>
                </CollapsedTooltip>
              </li>
            );
          })}
        </ul>

        {/* Operational assistant/notifications are not exposed to infrastructure Admin or retired partner identities. */}
        {(hasCapability(dbRole, permissions, "ai.assist") || canSeeNotifications) && <div className="mt-4 pt-4 border-t border-border">
          {hasCapability(dbRole, permissions, "ai.assist") && <CollapsedTooltip label="AI Assistant"><Link
            href={`/${role}/chatbot`}
            aria-label="AI Assistant"
            className={cn(
              "flex items-center rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary",
              isCollapsed ? "h-10 justify-center px-2" : "gap-3 px-3 py-2.5",
              pathname.startsWith(`/${role}/chatbot`)
                ? "bg-accent/20 text-primary border-l-4 border-accent pl-2"
                : "text-foreground/70 hover:bg-accent/10 hover:text-primary border-l-4 border-transparent pl-2"
            )}
          ><Bot className="h-4 w-4 shrink-0" aria-hidden="true" /><span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200", isCollapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[220px] opacity-100")}>AI Assistant</span></Link></CollapsedTooltip>}
          {canSeeNotifications && <CollapsedTooltip label="Notifications"><Link
            href={`/${role}/notifications`}
            aria-label="Notifications"
            className={cn(
              "mt-0.5 flex items-center rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary",
              isCollapsed ? "h-10 justify-center px-2" : "gap-3 px-3 py-2.5",
              pathname.startsWith(`/${role}/notifications`)
                ? "bg-primary/10 text-primary border-l-4 border-primary pl-2"
                : "text-foreground/70 hover:bg-primary/5 hover:text-primary border-l-4 border-transparent pl-2"
            )}
          ><MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" /><span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200", isCollapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[220px] opacity-100")}>Notifications</span></Link></CollapsedTooltip>}
        </div>}
      </nav>

      {/* User info + logout */}
      <div className={cn("border-t border-border", isCollapsed ? "p-2" : "p-4")}>
        <div className={cn("mb-3 flex items-center gap-3", isCollapsed ? "justify-center" : "")}>
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">{userName.charAt(0).toUpperCase()}</span>
          </div>
          <div className={cn("min-w-0 flex-1 overflow-hidden transition-[max-width,opacity,transform] duration-200", isCollapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[180px] opacity-100")}>
            <p className="text-sm font-medium text-foreground truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
        </div>
        <CollapsedTooltip label="Sign out"><Button
          variant="ghost" size="sm"
          aria-label="Sign out"
          className={cn("text-muted-foreground hover:bg-danger/5 hover:text-danger", isCollapsed ? "h-10 w-full justify-center px-2" : "w-full justify-start gap-2")}
          onClick={handleLogout}
        ><LogOut className="h-4 w-4 shrink-0" aria-hidden="true" /><span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200", isCollapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[120px] opacity-100")}>Sign out</span></Button></CollapsedTooltip>
      </div>
    </aside>
    </TooltipProvider>
  );
}
