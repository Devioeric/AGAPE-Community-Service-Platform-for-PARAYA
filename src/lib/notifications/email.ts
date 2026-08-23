// Email sender — Resend-compatible. If RESEND_API_KEY is not set, the function
// logs the message and returns false so the dispatcher can record an in-app
// notification anyway.
//
// Drop-in alternatives (same fetch shape): SendGrid, Mailgun, Postmark.

export interface EmailMessage {
  to:      string;
  subject: string;
  /** Plain-text body. Used as `text` and as a fallback HTML <pre>. */
  text:    string;
  /** Optional HTML body. Falls back to `text` wrapped in <pre> if omitted. */
  html?:   string;
}

export interface EmailResult {
  sent:  boolean;
  error?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM ?? "AGAPE <noreply@example.com>";

  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:  `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to:      [msg.to],
        subject: msg.subject,
        text:    msg.text,
        html:    msg.html ?? `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(msg.text)}</pre>`,
      }),
    });

    if (!res.ok) {
      // Do not log provider bodies; they may echo recipient or message data.
      console.error("[email] Provider rejected a delivery", { status: res.status });
      return { sent: false, error: `Email provider returned HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] fetch failed:", err);
    return { sent: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}
