export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured limit");
    this.name = "RequestBodyTooLargeError";
  }
}

/** Read multipart bytes through a hard counter before invoking formData(). */
export async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new Error("Multipart form data is required");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyTooLargeError();
  if (!request.body) throw new Error("Multipart request body is required");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const bounded = new Request(request.url, { method: "POST", headers: { "content-type": contentType, "content-length": String(total) }, body: bytes });
  return bounded.formData();
}
