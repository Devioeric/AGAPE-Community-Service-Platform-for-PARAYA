import type { ReactNode } from "react";
import { SectionTabs } from "@/components/layout/SectionTabs";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <SectionTabs section="officer.proposals" label="Project proposal sections" />
      {children}
    </div>
  );
}
