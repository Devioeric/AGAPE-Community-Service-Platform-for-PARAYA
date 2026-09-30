import type { ReactNode } from "react";
import { SectionTabs } from "@/components/layout/SectionTabs";

export default function SurveysLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-5"><SectionTabs section="officer.surveys" label="Survey sections" />{children}</div>;
}
