import type { ReactNode } from "react";
import { SectionTabs } from "@/components/layout/SectionTabs";

// onlyOnTabPages keeps the strip off /officer/proposals/[id]/ppf, the printable form.
export default function ProposalsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <SectionTabs section="officer.proposals" label="Project proposal sections" onlyOnTabPages />
      {children}
    </div>
  );
}
