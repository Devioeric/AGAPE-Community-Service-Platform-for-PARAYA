import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { systemReadinessSchema } from "@/lib/dashboard/contracts";

const featureFlags = [
  "AGAPE_PROFILING_V2_ENABLED", "AGAPE_PARTNER_REGISTRY_V2_ENABLED", "AGAPE_HISTORICAL_PROGRAMS_V2_ENABLED",
  "AGAPE_PROPOSALS_V2_ENABLED", "AGAPE_PROGRAM_FINANCE_V2_ENABLED", "AGAPE_EXTERNAL_CONTACT_EMAIL_ENABLED",
  "AGAPE_VOLUNTEER_MATCHING_V2_ENABLED", "AGAPE_PROGRAM_INVITATIONS_V2_ENABLED", "AGAPE_FINANCE_INTEGRITY_V1_ENABLED",
  "AGAPE_NOTIFICATION_DELIVERY_V1_ENABLED",
] as const;

export async function GET() {
  const auth = await authorizeCapability("admin.audit.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.supabase.rpc("phase7_get_system_readiness");
  if (error) return NextResponse.json({ error: "Unable to load readiness state" }, { status: 500 });
  const parsed = systemReadinessSchema.safeParse(data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid readiness response" }, { status: 500 });
  return NextResponse.json({ data: { ...parsed.data, applicationFlags: Object.fromEntries(featureFlags.map(key => [key, process.env[key] === "true"])) } });
}
