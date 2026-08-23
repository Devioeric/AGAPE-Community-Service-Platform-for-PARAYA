// Audit log helper — records sensitive actions to the audit_logs table.
// Always writes via the admin client (service role) so it bypasses RLS.

import { createAdminClient } from "@/lib/supabase/admin";

export type AuditLevel = "info" | "warning" | "error";

export interface AuditEntry {
  user_id?:       string | null;
  user_email?:    string | null;
  action:         string;
  resource_type?: string;
  resource_id?:   string;
  level?:         AuditLevel;
  ip_address?:    string | null;
  metadata?:      Record<string, unknown>;
}

/**
 * Record an audit log entry. Best-effort — never throws and never blocks the
 * calling request. Failures are logged to the server console.
 */
// Sensitive mutation routes must check this return value for a pre-mutation
// intent entry and fail closed if the immutable audit store is unavailable.
export async function recordAudit(entry: AuditEntry): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      user_id:       entry.user_id       ?? null,
      user_email:    entry.user_email    ?? null,
      action:        entry.action,
      resource_type: entry.resource_type ?? null,
      resource_id:   entry.resource_id   ?? null,
      level:         entry.level         ?? "info",
      ip_address:    entry.ip_address    ?? null,
      metadata:      entry.metadata      ?? null,
    });
    if (error) {
      console.error("[audit] failed to record entry", {
        action: entry.action,
        resourceType: entry.resource_type ?? null,
        code: error.code,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[audit] failed to record entry:", err);
    return false;
  }
}

/**
 * Convenience: extract an IP from a Request's standard headers.
 */
export function getRequestIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}
