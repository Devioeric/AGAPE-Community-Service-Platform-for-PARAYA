export type ReadStatus = "idle" | "loading" | "success" | "error" | "denied";

export class ReadFailure extends Error {
  readonly status: number;
  constructor(status: number) { super("Requested data is unavailable"); this.status = status; }
}

export async function readJsonData<T>(response: Response, parse: (data: unknown) => T): Promise<T> {
  if (!response.ok) throw new ReadFailure(response.status);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("data" in payload)) throw new ReadFailure(503);
  return parse((payload as { data: unknown }).data);
}
