// SMS sender — Semaphore-compatible (Philippine SMS gateway). If
// SEMAPHORE_API_KEY is not set, the function logs the message and returns
// false so the dispatcher can record an in-app notification anyway.
//
// Docs: https://semaphore.co/docs

export interface SmsMessage {
  to:      string;      // PH mobile number — Semaphore accepts +63XXXX or 09XXXX
  message: string;      // Body, ≤ 160 chars per SMS segment
}

export interface SmsResult {
  sent:  boolean;
  error?: string;
}

export async function sendSms(msg: SmsMessage): Promise<SmsResult> {
  const apiKey   = process.env.SEMAPHORE_API_KEY;
  const sender   = process.env.SEMAPHORE_SENDER_NAME ?? "AGAPE";

  if (!apiKey) {
    console.log("[sms] SEMAPHORE_API_KEY not set — skipping SMS to", msg.to);
    return { sent: false, error: "SEMAPHORE_API_KEY not configured" };
  }

  // Normalize to international format (Semaphore is permissive but consistent
  // formatting helps debugging).
  const number = normalizePh(msg.to);
  if (!number) {
    return { sent: false, error: "Invalid PH mobile number" };
  }

  try {
    const params = new URLSearchParams({
      apikey:     apiKey,
      number,
      message:    msg.message.slice(0, 320),  // ~2 SMS segments
      sendername: sender,
    });

    const res = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[sms] Semaphore rejected:", res.status, errText);
      return { sent: false, error: `Semaphore ${res.status}: ${errText}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[sms] fetch failed:", err);
    return { sent: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

function normalizePh(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12)  return digits;            // 639xxxxxxxxx
  if (digits.startsWith("09") && digits.length === 11)  return "63" + digits.slice(1);
  if (digits.startsWith("9")  && digits.length === 10)  return "63" + digits;
  return null;
}
