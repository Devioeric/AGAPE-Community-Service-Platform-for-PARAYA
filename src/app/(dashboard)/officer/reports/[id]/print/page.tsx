import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintReportClient from "./PrintReportClient";

// Print-ready view for one AI report. Loaded as a server component so we can
// authenticate + fetch without an extra endpoint. The actual printing logic
// (auto-trigger window.print) lives in the client child below.

type Ctx = { params: Promise<{ id: string }> };

const STAFF_ROLES = ["paraya_director", "paraya_associate", "paraya_researcher", "paraya_officer", "admin"];

export default async function PrintReportPage({ params }: Ctx) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: self } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!STAFF_ROLES.includes(self?.role ?? "")) notFound();

  const { data: report } = await supabase
    .from("ai_reports")
    .select("*, generated:users!generated_by(full_name)")
    .eq("id", id)
    .single();

  if (!report) notFound();

  const generatedBy = (report.generated as { full_name: string | null } | null)?.full_name ?? null;

  return <PrintReportClient report={report} generatedBy={generatedBy} />;
}
