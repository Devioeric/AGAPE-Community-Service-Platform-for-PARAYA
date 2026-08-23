import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAnyCapability } from "@/lib/auth/authorize";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await authorizeAnyCapability(["admin.users.manage", "admin.audit.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin    = createAdminClient();

  const [
    { data: users },
    { data: auditLogs },
  ] = await Promise.all([
    admin.from("users").select("role, status"),
    admin.from("audit_logs").select("user_email, action, resource_type, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  // ── User counts ────────────────────────────────────────────────────────────────
  const totalUsers   = (users ?? []).length;
  const pendingCount = (users ?? []).filter((u) => u.status === "pending").length;

  const roleCounts: Record<string, number> = {
    paraya_director:        0,
    paraya_associate:       0,
    paraya_researcher:      0,
    volunteer:              0,
    barangay_captain:       0,
    barangay_secretary:     0,
    barangay_mother_leader: 0,
    admin:                  0,
    // Legacy aliases, still counted separately during the transition
    paraya_officer:         0,
    barangay_official:      0,
  };
  for (const u of users ?? []) {
    if (u.role in roleCounts) roleCounts[u.role]++;
  }

  // ── Security events (last 7 days) ─────────────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const securityKeywords = ["suspend", "delete", "role", "password", "login_fail", "banned"];
  const securityEvents = (auditLogs ?? []).filter((l) => {
    const isRecent = l.created_at >= sevenDaysAgo;
    const isSecurity = securityKeywords.some((k) => l.action?.toLowerCase().includes(k));
    return isRecent && isSecurity;
  }).length;

  // ── Format audit logs ──────────────────────────────────────────────────────────
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + `, ${time}`;
  };

  const levelFromAction = (action: string): "Info" | "Warning" | "Error" => {
    const a = action?.toLowerCase() ?? "";
    if (a.includes("delet") || a.includes("suspend") || a.includes("fail") || a.includes("error")) return "Warning";
    return "Info";
  };

  const formattedLogs = (auditLogs ?? []).map((l) => ({
    user:   l.user_email ?? "system",
    action: l.action,
    time:   formatTime(l.created_at),
    level:  levelFromAction(l.action),
  }));

  return NextResponse.json({
    data: {
      totalUsers,
      pendingCount,
      securityEvents,
      roleCounts,
      auditLogs: formattedLogs,
    },
  });
}
