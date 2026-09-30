"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ChatbotNavigationLink } from "@/lib/ai/chatbot-stream";

export function ChatbotNavigationLinks({ links }: { links: ChatbotNavigationLink[] }) {
  if (!links.length) return null;
  return (
    <nav aria-label="Assistant navigation suggestions" className="mt-2 space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Open a page</p>
      {links.map((link) => (
        <Link
          key={link.id}
          href={link.href}
          prefetch={false}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Open ${link.label}`}
        >
          <span className="min-w-0">
            <span className="block font-medium">{link.label}</span>
            <span className="block truncate text-muted-foreground">{link.description}</span>
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
