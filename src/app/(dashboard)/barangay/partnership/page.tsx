import { headers } from "next/headers";
import { Phase2Workspace } from "@/components/phase2/Phase2Workspace";
import { MyBarangayView } from "@/components/shared/MyBarangayView";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";

export default async function BarangayPartnershipPage() {
  const requestHeaders = await headers();
  const role = requestHeaders.get("x-user-role") ?? "";
  let permissions: Record<string, boolean> = {};
  try { permissions = JSON.parse(requestHeaders.get("x-user-permissions") ?? "{}"); } catch { /* API independently authorizes */ }
  const partnerRegistryEnabled = isPhase2ComponentEnabled("partners");
  const historicalProgramsEnabled = isPhase2ComponentEnabled("historical_programs");
  return (
    <div className="space-y-4">
      <MyBarangayView
        emptyMessage="Your account isn't linked to a barangay yet. Contact a PARAYA officer or system administrator."
      />
      {(partnerRegistryEnabled || historicalProgramsEnabled) && <Phase2Workspace role={role} permissions={permissions} flags={{
        partners: partnerRegistryEnabled,
        history: historicalProgramsEnabled,
        proposals: false,
        finance: false,
        integrity: false,
      }} />}
    </div>
  );
}
