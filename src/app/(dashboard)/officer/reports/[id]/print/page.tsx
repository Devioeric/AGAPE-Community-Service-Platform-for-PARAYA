import { createClient } from "@/lib/supabase/server";
import { hasCapability } from "@/lib/auth/capabilities";
import { notFound } from "next/navigation";
import PrintReportClient from "./PrintReportClient";

type Ctx = { params: Promise<{ id: string }> };

export default async function PrintReportPage({ params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await supabase.from("users").select("role, permissions, status, is_active").eq("id", user.id).single();
  if (!profile || profile.status !== "active" || profile.is_active !== true || !hasCapability(profile.role, profile.permissions ?? {}, "report.read")) notFound();
  const { data, error } = await supabase.rpc("phase6_get_report_document", { p_report_id: id });
  if (error || !data || typeof data !== "object" || !("report" in data)) notFound();
  const payload = data as { report: Record<string, unknown> };
  const report = payload.report;
  return <PrintReportClient report={report as never} generatedBy={typeof report.generatedByName === "string" ? report.generatedByName : null} />;
}
