import { createHash, randomUUID } from "crypto";
import type { NotificationDeliveryClaim, NotificationProviderResult } from "./contracts";

function providerConfig(channel: "email" | "sms", providerKey: string) {
  const prefix = channel === "email" ? "AGAPE_EMAIL_PROVIDER" : "AGAPE_SMS_PROVIDER";
  return {
    enabledKey: process.env[`${prefix}_KEY`],
    endpoint: process.env[`${prefix}_ENDPOINT`],
    apiKey: process.env[`${prefix}_API_KEY`],
    providerKey,
  };
}

export async function deliverNotification(claim: NotificationDeliveryClaim): Promise<NotificationProviderResult> {
  if (claim.providerKey === "synthetic") {
    const digest = createHash("sha256").update(`${claim.id}:${claim.claimToken}`).digest("hex").slice(0, 24);
    return { ok: true, providerMessageId: `synthetic-${digest}` };
  }

  const config = providerConfig(claim.channel, claim.providerKey);
  if (!config.endpoint || !config.apiKey || config.enabledKey !== claim.providerKey) {
    return { ok: false, errorCode: "provider_not_configured" };
  }

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "idempotency-key": claim.id,
      },
      body: JSON.stringify({
        requestId: randomUUID(),
        channel: claim.channel,
        destination: claim.destination,
        title: claim.title,
        message: claim.message,
        actionUrl: claim.actionUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { ok: false, errorCode: `provider_http_${response.status}` };
    const body = (await response.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, providerMessageId: typeof body.id === "string" ? body.id : claim.id };
  } catch {
    return { ok: false, errorCode: "provider_unavailable" };
  }
}
