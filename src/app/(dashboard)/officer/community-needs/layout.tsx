import type { ReactNode } from "react";

// Each page draws the "officer.community-needs" section tabs itself, so the Needs
// page can place its "Submit a need" button at the right end of the tab row.
export default function CommunityNeedsLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}
