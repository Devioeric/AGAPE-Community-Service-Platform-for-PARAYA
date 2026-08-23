// Unified notification dispatcher.
//
// Always writes to `notifications` (in-app). Then, based on the user's
// `notification_prefs`, optionally sends email and/or SMS. Best-effort: never
// throws and never blocks the calling request.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./email";
import { sendSms } from "./sms";

export type NotificationType =
  | "info" | "warning" | "success" | "danger"
  | "approval" | "reminder" | "announcement" | "recognition";

export interface NotificationInput {
  user_id:    string;
  title:      string;
  message:    string;
  type?:      NotificationType;
  action_url?: string;
  /** When true, override user prefs and force email + SMS dispatch (use sparingly — e.g. password resets). */
  force?: { email?: boolean; sms?: boolean };
}

export interface DispatchResult {
  in_app: boolean;
  email:  boolean;
  sms:    boolean;
  errors: string[];
}

interface UserPrefs {
  in_app?: boolean;
  email?:  boolean;
  sms?:    boolean;
}

const SUBJECT_PREFIX = "[AGAPE]";

export async function notify(input: NotificationInput): Promise<DispatchResult> {
  const result: DispatchResult = {
    in_app: false, email: false, sms: false, errors: [],
  };

  const admin = createAdminClient();

  // Load the recipient's email, phone, and preferences
  const { data: user, error: userErr } = await admin
    .from("users")
    .select("email, phone, notification_prefs")
    .eq("id", input.user_id)
    .single();

  if (userErr || !user) {
    result.errors.push("Recipient not found");
    return result;
  }

  const prefs: UserPrefs = (user.notification_prefs as UserPrefs | null) ?? {
    in_app: true, email: true, sms: false,
  };

  // ── In-app (always recorded unless explicitly disabled) ───────────────────
  if (prefs.in_app !== false) {
    try {
      const { error } = await admin.from("notifications").insert({
        user_id:    input.user_id,
        type:       input.type ?? "info",
        title:      input.title,
        message:    input.message,
        action_url: input.action_url ?? null,
        is_read:    false,
      });
      if (error) result.errors.push(`in_app: ${error.message}`);
      else       result.in_app = true;
    } catch (err) {
      result.errors.push(`in_app: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const wantEmail = input.force?.email || (prefs.email !== false);
  if (wantEmail && user.email) {
    const r = await sendEmail({
      to:      user.email,
      subject: `${SUBJECT_PREFIX} ${input.title}`,
      text:    [
        input.message,
        input.action_url ? `\nView: ${input.action_url}` : null,
        `\n—\nYou received this from AGAPE. Update notification preferences in your profile.`,
      ].filter(Boolean).join("\n"),
    });
    result.email = r.sent;
    if (!r.sent && r.error) result.errors.push(`email: ${r.error}`);
  }

  // ── SMS ───────────────────────────────────────────────────────────────────
  const wantSms = input.force?.sms || prefs.sms === true;
  if (wantSms && user.phone) {
    // SMS bodies should be short — strip to title + truncated message.
    const body = `${SUBJECT_PREFIX} ${input.title}: ${input.message}`.slice(0, 320);
    const r = await sendSms({ to: user.phone, message: body });
    result.sms = r.sent;
    if (!r.sent && r.error) result.errors.push(`sms: ${r.error}`);
  }

  return result;
}

/**
 * Convenience: notify multiple recipients with the same payload.
 * Returns the per-user result map.
 */
export async function notifyMany(
  userIds: string[],
  payload: Omit<NotificationInput, "user_id">,
): Promise<Record<string, DispatchResult>> {
  const results: Record<string, DispatchResult> = {};
  await Promise.all(userIds.map(async (id) => {
    results[id] = await notify({ ...payload, user_id: id });
  }));
  return results;
}
