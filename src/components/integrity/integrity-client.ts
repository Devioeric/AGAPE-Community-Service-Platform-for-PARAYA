import type { FinanceIntegrityRuntimeDTO } from "@/lib/integrity/types";

type ResponseParser<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

export class IntegrityReadError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status === 401 ? "Your session has expired. Sign in again to continue."
      : status === 403 ? "You do not have permission to access this financial-integrity action."
        : status === 404 ? "This proof or configuration could not be found."
          : status === 409 ? "This record has changed. Refresh before trying again."
            : status === 400 ? "Check the configuration and selected record before trying again."
              : "Financial integrity is unavailable. Try the read again; do not repeat a proof request unless its outcome is known.");
    this.name = "IntegrityReadError";
    this.status = status;
  }
}

export async function integrityRequest<T>(url: string, parser: ResponseParser<T>, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init, cache: "no-store", redirect: "error",
    headers: { "content-type": "application/json", ...init.headers },
  });
  // Never display a provider/SQL error or trust an unchecked HTTP response.
  if (!response.ok) throw new IntegrityReadError(response.status);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("data" in payload)) throw new IntegrityReadError(503);
  const parsed = parser.safeParse(payload.data);
  if (!parsed.success) throw new IntegrityReadError(503);
  return parsed.data;
}

export function integrityErrorMessage(error: unknown): string {
  return error instanceof IntegrityReadError ? error.message : "Financial integrity is unavailable. Please try again.";
}

export function canRetryIntegrityRead(error: unknown): boolean {
  return !(error instanceof IntegrityReadError && [400, 401, 403, 404].includes(error.status));
}

/** Abort stale reads AND reject completions from transports which ignore abort. */
export class IntegrityRequestGate {
  private generation = 0;
  private controller: AbortController | null = null;

  begin() {
    this.cancel();
    const controller = new AbortController();
    const generation = this.generation;
    this.controller = controller;
    return { signal: controller.signal, current: () => generation === this.generation && !controller.signal.aborted };
  }

  cancel() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
}

export const executionLabel = (execution?: string | null) => execution === "simulated"
  ? "Simulation—no blockchain transaction"
  : execution === "local_evm" ? "Local test chain"
    : execution === "sepolia" ? "Sepolia testnet—not production"
      : "Legacy proof—not independently verified";

export const verificationLabel = (verification?: string | null) => {
  switch (verification) {
    case "verified": return "Independently verified";
    case "simulated": return "Simulated receipt only";
    case "pending": return "Confirmation pending";
    case "mismatch": return "Verification mismatch—review required";
    case "unavailable": return "Verification unavailable";
    default: return "Not independently verified";
  }
};

export function safeExplorerLink(network: string | null, transactionHash: string | null): string | null {
  return network === "eip155:11155111" && transactionHash && /^0x[0-9a-fA-F]{64}$/.test(transactionHash)
    ? `https://sepolia.etherscan.io/tx/${transactionHash}` : null;
}

export function runtimeFormFrom(runtime: FinanceIntegrityRuntimeDTO) {
  return {
    mode: runtime.mode, providerKey: runtime.providerKey,
    networkKey: runtime.networkKey ?? "", contractReference: runtime.contractReference ?? "",
    targetId: runtime.targetId ?? "",
    syntheticUserIds: runtime.syntheticUserIds.join("\n"),
    syntheticSourceIds: runtime.syntheticSourceIds.join("\n"),
  };
}

export type IntegrityRuntimeForm = ReturnType<typeof runtimeFormFrom>;

export function runtimeSaveBody(form: IntegrityRuntimeForm, expectedVersion: number) {
  const ids = (value: string) => value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
  return {
    mode: form.mode, targetId: form.targetId || null,
    syntheticUserIds: ids(form.syntheticUserIds), syntheticSourceIds: ids(form.syntheticSourceIds), expectedVersion,
  };
}

const resumableProofErrors = new Set(["retry_exhausted", "pending_needs_review", "verification_unavailable"]);
export function canResumeProof(status: string, errorCode: string | null) {
  return status === "paused" && errorCode !== null && resumableProofErrors.has(errorCode);
}
