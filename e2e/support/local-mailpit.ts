const EXPECTED_MAILPIT_ORIGIN = "http://127.0.0.1:54324";
const EXPECTED_AUTH_ORIGIN = "http://127.0.0.1:54321";

type MailpitAddress = { Address?: unknown };
type MailpitSummary = { ID?: unknown; To?: unknown };
type MailpitMessage = { HTML?: unknown; Text?: unknown };

function localMailpitOrigin(): string {
  const configured = process.env.AGAPE_LOCAL_MAILPIT_URL;
  if (configured !== EXPECTED_MAILPIT_ORIGIN) {
    throw new Error("The authenticated Auth gate requires the fixed disposable Mailpit origin");
  }
  return configured;
}

function hasRecipient(value: unknown, recipient: string): boolean {
  return Array.isArray(value) && value.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const address = (entry as MailpitAddress).Address;
    return typeof address === "string" && address.toLowerCase() === recipient;
  });
}

async function readMessageFor(recipient: string): Promise<MailpitMessage | null> {
  const response = await fetch(`${localMailpitOrigin()}/api/v1/messages?start=0&limit=50`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Disposable Mailpit message listing failed");
  const body = await response.json() as { messages?: unknown };
  if (!Array.isArray(body.messages)) throw new Error("Disposable Mailpit returned an invalid message list");

  const summary = body.messages.find((entry): entry is MailpitSummary =>
    Boolean(entry && typeof entry === "object" && !Array.isArray(entry) && hasRecipient((entry as MailpitSummary).To, recipient))
  );
  if (!summary || typeof summary.ID !== "string" || !summary.ID) return null;

  const messageResponse = await fetch(`${localMailpitOrigin()}/api/v1/message/${encodeURIComponent(summary.ID)}`, {
    cache: "no-store",
  });
  if (!messageResponse.ok) throw new Error("Disposable Mailpit message retrieval failed");
  const message = await messageResponse.json() as MailpitMessage;
  return message && typeof message === "object" && !Array.isArray(message) ? message : null;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#x3d;/gi, "=")
    .replace(/&#61;/g, "=")
    .trim();
}

function extractDisposableAuthLink(message: MailpitMessage): string {
  const html = typeof message.HTML === "string" ? message.HTML : "";
  const text = typeof message.Text === "string" ? message.Text : "";
  const candidates = [
    ...Array.from(html.matchAll(/href=["']([^"']+)["']/gi), (match) => match[1]),
    ...(text.match(/https?:\/\/[^\s<>"']+/gi) ?? []),
  ];

  for (const candidate of candidates) {
    let parsed: URL;
    try { parsed = new URL(decodeHtmlAttribute(candidate)); }
    catch { continue; }
    if (parsed.origin === EXPECTED_AUTH_ORIGIN && parsed.pathname === "/auth/v1/verify") {
      return parsed.toString();
    }
  }
  throw new Error("Disposable Auth email did not contain a local verification link");
}

export async function waitForDisposableAuthLink(recipientEmail: string): Promise<string> {
  const recipient = recipientEmail.trim().toLowerCase();
  if (!recipient.endsWith("@release-gate.invalid")) {
    throw new Error("Auth browser gates may inspect only reserved synthetic recipients");
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const message = await readMessageFor(recipient);
    if (message) return extractDisposableAuthLink(message);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable Auth email was not captured before the bounded timeout");
}
