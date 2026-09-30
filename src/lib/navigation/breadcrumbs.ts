import { ROLE_HOME } from "@/lib/auth/roles";
import type { PermissionOverrides } from "@/lib/auth/capabilities";
import { getPageTitle } from "@/lib/nav-titles";
import {
  getNavigationEntry,
  getNavigationEntryForPath,
  isNavigationEntryVisible,
} from "@/lib/navigation/catalog";

export type HeaderBreadcrumb = {
  id: string;
  label: string;
  href?: string;
  current: boolean;
};

export function getHeaderBreadcrumbs({
  pathname,
  dbRole,
  permissions,
}: {
  pathname: string;
  dbRole: string;
  permissions?: PermissionOverrides;
}): HeaderBreadcrumb[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  const home = ROLE_HOME[dbRole];
  const matched = getNavigationEntryForPath(path);
  const current = matched?.status === "retired_redirect" || matched?.status === "coming_soon"
    ? null
    : matched?.href === home && path !== home
      ? null
      : matched;
  const fallbackLabel = getPageTitle(path);
  const currentLabel = current?.label ?? (fallbackLabel === "Dashboard" && path !== home ? "AGAPE" : fallbackLabel);

  if (path === home) {
    return [{ id: current?.id ?? "dashboard", label: "Dashboard", current: true }];
  }

  const crumbs: HeaderBreadcrumb[] = [];
  if (home) {
    crumbs.push({ id: `${dbRole}.dashboard`, label: "Dashboard", href: home, current: false });
  }

  const parents = [];
  const visited = new Set<string>();
  let parentId = current?.parentId ?? current?.section;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = getNavigationEntry(parentId);
    if (!parent) break;
    parents.unshift(parent);
    parentId = parent.parentId;
  }

  for (const parent of parents) {
    if (
      parent.href && parent.href !== home &&
      parent.status !== "retired_redirect" && parent.status !== "coming_soon" &&
      isNavigationEntryVisible(parent, dbRole, permissions)
    ) {
      crumbs.push({ id: parent.id, label: parent.label, href: parent.href, current: false });
    }
  }

  crumbs.push({ id: current?.id ?? "current-page", label: currentLabel, current: true });
  return crumbs;
}
