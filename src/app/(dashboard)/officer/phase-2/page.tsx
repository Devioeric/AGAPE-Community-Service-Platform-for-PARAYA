import { Phase2Workspace } from "@/components/phase2/Phase2Workspace";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";
import { isFinanceIntegrityEnabled } from "@/lib/integrity/feature";
import { headers } from "next/headers";

export default async function Phase2Page() {
  const requestHeaders = await headers();
  const role = requestHeaders.get("x-user-role") ?? "";
  let permissions: Record<string, boolean> = {};
  try { permissions = JSON.parse(requestHeaders.get("x-user-permissions") ?? "{}"); } catch { /* middleware supplies the effective overrides */ }
  return <Phase2Workspace flags={{
    partners: isPhase2ComponentEnabled("partners"),
    history: isPhase2ComponentEnabled("historical_programs"),
    proposals: isPhase2ComponentEnabled("proposals"),
    finance: isPhase2ComponentEnabled("program_finance"),
    integrity: isFinanceIntegrityEnabled(),
  }} role={role} permissions={permissions} />;
}
