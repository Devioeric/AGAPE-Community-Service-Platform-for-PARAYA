import type { ReactNode } from "react";
import { SectionTabs } from "@/components/layout/SectionTabs";

export default function VolunteersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <SectionTabs section="officer.volunteers" label="Volunteer management sections" />
      {children}
    </div>
  );
}
