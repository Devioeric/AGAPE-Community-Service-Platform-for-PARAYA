import { headers } from "next/headers";
import { Phase2Workspace } from "@/components/phase2/Phase2Workspace";
import { MyBarangayView } from "@/components/shared/MyBarangayView";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";

export default async function BarangayPartnershipPage() {
  const role = (await headers()).get("x-user-role") ?? "";
  const partnerRegistryEnabled = isPhase2ComponentEnabled("partners");
  const historicalProgramsEnabled = isPhase2ComponentEnabled("historical_programs");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">Our Partnership</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your barangay&apos;s registered profile, contact information, and partnership history with PARAYA. Edits are managed by PARAYA officers.
        </p>
      </div>
      <MyBarangayView
        emptyMessage="Your account isn't linked to a barangay yet. Contact a PARAYA officer or system administrator."
      />
      {(partnerRegistryEnabled || historicalProgramsEnabled) && <Phase2Workspace role={role} flags={{
        partners: partnerRegistryEnabled,
        history: historicalProgramsEnabled,
        proposals: false,
        finance: false,
      }} />}
    </div>
  );
}
