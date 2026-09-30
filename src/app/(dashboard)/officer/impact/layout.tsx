import type { ReactNode } from "react";
import { SectionTabs } from "@/components/layout/SectionTabs";

export default function ImpactLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-5"><SectionTabs section="officer.impact" label="Impact sections" />{children}</div>;
}
