import type { ReactNode } from "react";
import { SectionTabs } from "@/components/layout/SectionTabs";

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <SectionTabs section="officer.analytics" label="Analytics sections" />
      {children}
    </div>
  );
}
