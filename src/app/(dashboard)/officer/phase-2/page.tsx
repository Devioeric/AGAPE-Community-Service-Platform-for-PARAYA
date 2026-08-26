import { Phase2Workspace } from "@/components/phase2/Phase2Workspace";
import { isPhase2ComponentEnabled } from "@/lib/phase2/feature";
import { headers } from "next/headers";

export default async function Phase2Page() {
  const role = (await headers()).get("x-user-role") ?? "";
  return <Phase2Workspace flags={{
    partners: isPhase2ComponentEnabled("partners"),
    history: isPhase2ComponentEnabled("historical_programs"),
    proposals: isPhase2ComponentEnabled("proposals"),
    finance: isPhase2ComponentEnabled("program_finance"),
  }} role={role} />;
}
