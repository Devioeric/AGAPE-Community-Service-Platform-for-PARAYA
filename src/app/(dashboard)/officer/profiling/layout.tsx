import type { ReactNode } from "react";

// Each page draws the "officer.profiling" section tabs itself, so the overview
// can place its Filter and Refresh buttons at the right end of the tab row.
export default function ProfilingLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}
