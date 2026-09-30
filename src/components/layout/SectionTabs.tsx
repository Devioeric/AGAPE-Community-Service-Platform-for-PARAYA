"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { getSectionTabs } from "@/lib/navigation/catalog";
import { cn } from "@/lib/utils";

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SectionTabs({ section, label, onlyOnTabPages = false, actions }: {
  section: string;
  label: string;
  /** Hide the strip on detail routes below a tab, such as the proposal print form. */
  onlyOnTabPages?: boolean;
  /** Controls at the right end of the tab row, such as a filter button. */
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const actor = useDashboardActor();
  const tabs = getSectionTabs(section, actor.role, actor.permissions);
  if (tabs.length < 2) return actions ? <div className="flex justify-end">{actions}</div> : null;
  if (onlyOnTabPages && !tabs.some((tab) => tab.href === pathname)) return null;
  const active = tabs
    .filter((tab) => matches(pathname, tab.href!))
    .sort((a, b) => b.href!.length - a.href!.length)[0];

  const nav = (
    <nav aria-label={label} data-testid={`section-tabs-${section}`} className="print-hidden overflow-x-auto scrollbar-thin border-b border-border">
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const current = tab.id === active?.id;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href!}
                prefetch={false}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  current ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.tabLabel ?? tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
  if (!actions) return nav;
  // The actions cell continues the strip's bottom border so both read as one row.
  return (
    <div className="flex items-end">
      <div className="min-w-0 flex-1">{nav}</div>
      <div className="print-hidden shrink-0 border-b border-border pb-1.5 pl-3">{actions}</div>
    </div>
  );
}
