"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { financeIntegrityRuntimeOutputSchema } from "@/lib/integrity/contracts";
import type { FinanceIntegrityRuntimeDTO } from "@/lib/integrity/types";
import { Field, Phase2Notice, StatusPill, inputClass, primaryButton, secondaryButton } from "@/components/phase2/Phase2Ui";
import { IntegrityReadError, IntegrityRequestGate, type IntegrityRuntimeForm, canRetryIntegrityRead, executionLabel, integrityErrorMessage, integrityRequest, runtimeFormFrom, runtimeSaveBody } from "./integrity-client";

export function FinanceIntegrityRuntimeManager() {
  const [runtime, setRuntime] = useState<FinanceIntegrityRuntimeDTO | null>(null);
  const [form, setForm] = useState<IntegrityRuntimeForm | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const requests = useRef(new IntegrityRequestGate());
  const mutationBusy = useRef(false);
  const canCorrectInput = error instanceof IntegrityReadError && error.status === 400;

  const load = useCallback(async () => {
    if (mutationBusy.current) return;
    const request = requests.current.begin();
    setLoading(true); setError(null);
    try {
      const result = await integrityRequest("/api/v2/finance-integrity/runtime", financeIntegrityRuntimeOutputSchema, { signal: request.signal });
      if (request.current()) { setRuntime(result); setForm(runtimeFormFrom(result)); }
    } catch (cause) { if (request.current()) setError(cause); }
    finally { if (request.current()) setLoading(false); }
  }, []);

  useEffect(() => {
    const gate = requests.current;
    void load();
    return () => gate.cancel();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runtime || !form || busy || loading || mutationBusy.current || (error != null && !canCorrectInput)) return;
    mutationBusy.current = true;
    const request = requests.current.begin();
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await integrityRequest("/api/v2/finance-integrity/runtime", financeIntegrityRuntimeOutputSchema, {
        method: "PUT", signal: request.signal,
        body: JSON.stringify(runtimeSaveBody(form, runtime.rowVersion)),
      });
      if (!request.current()) return;
      setRuntime(result); setForm(runtimeFormFrom(result));
      setMessage("Runtime updated. Existing proofs retain their pinned targets. Secrets remain outside AGAPE's configuration form.");
    } catch (cause) { if (request.current()) setError(cause); }
    finally { if (request.current()) { setBusy(false); mutationBusy.current = false; } }
  }

  const update = (key: keyof IntegrityRuntimeForm, value: string) => setForm((current) => current ? { ...current, [key]: value } : current);
  const lockedTarget = runtime?.target?.execution === "sepolia";
  return <section data-testid="finance-integrity-runtime" className="min-w-0 space-y-5" aria-busy={loading || busy}>
    
    <Phase2Notice message="Sepolia activation is locked for this local implementation. Institutional custody, credentials, and separate deployment authorization are required. Live data cannot use the new blockchain transports." />
    {loading && <p role="status" className="text-sm text-slate-600">Loading runtime configuration…</p>}
    {message && <Phase2Notice message={message} tone="success" />}
    {error != null && <div className="space-y-2"><Phase2Notice message={integrityErrorMessage(error)} tone="error" />{canRetryIntegrityRead(error) && <button className={secondaryButton} disabled={busy || loading} onClick={() => void load()}>Reload runtime configuration</button>}</div>}
    {runtime && <div className="min-w-0 space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="grid gap-3 text-sm sm:grid-cols-3"><div>Server gate <StatusPill value={runtime.serverEnabled ? "enabled" : "off"} /></div><div>Database mode <StatusPill value={runtime.mode} /></div><div>Provider <StatusPill value={runtime.providerKey} /></div></div>
      <h2 className="font-medium">Saved immutable target</h2>
      {runtime.target ? <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <Field label="Execution" value={executionLabel(runtime.target.execution)} />
        <Field label="Network / chain" value={`${runtime.target.networkKey} / ${runtime.target.chainId ?? "not applicable"}`} />
        <Field label="Confirmation policy" value={runtime.target.confirmationPolicy.replaceAll("_", " ")} />
        <Field label="Target ID" value={<span className="break-all font-mono text-xs">{runtime.target.id}</span>} />
        <div className="min-w-0 sm:col-span-2"><Field label="Contract" value={<span className="break-all font-mono text-xs">{runtime.target.contractAddress ?? "Not applicable"}</span>} /></div>
        <div className="min-w-0 sm:col-span-2"><Field label="Runtime bytecode SHA-256" value={<span className="break-all font-mono text-xs">{runtime.target.bytecodeHash ?? "Not applicable"}</span>} /></div>
        <div className="min-w-0 sm:col-span-2"><Field label="Fingerprint" value={<span className="break-all font-mono text-xs">{runtime.target.fingerprint}</span>} /></div>
      </dl> : <p className="text-sm text-slate-600">No approved target is selected. Legacy unbound proofs are not automatically dispatched.</p>}
      {!!runtime.readinessErrors?.length && <div role="alert" className="space-y-1 text-sm text-amber-800"><h3 className="font-medium">Readiness checks require attention</h3><ul className="list-inside list-disc">{runtime.readinessErrors.map((code) => <li className="break-words" key={code}>{code.replaceAll("_", " ")}</li>)}</ul></div>}
    </div>}
    {form && runtime && <form onSubmit={save} className="rounded-xl border bg-white p-5 shadow-sm">
      <fieldset disabled={loading || busy || (error != null && !canCorrectInput)} className="grid min-w-0 gap-4 md:grid-cols-2">
        <legend className="mb-4 font-medium">Runtime settings</legend>
        <label className="min-w-0 text-sm">Data mode<select className={`${inputClass} mt-1`} name="mode" value={form.mode} onChange={(event) => update("mode", event.target.value)}><option value="off">Off</option><option value="synthetic" disabled={lockedTarget}>Synthetic</option><option value="live" disabled>Live (not enabled in this implementation)</option></select></label>
        <label className="min-w-0 text-sm">Approved target ID<input className={`${inputClass} mt-1`} name="targetId" value={form.targetId} onChange={(event) => update("targetId", event.target.value)} placeholder="UUID of an approved immutable target" /></label>
        <label className="min-w-0 text-sm">Provider key (saved target)<input className={`${inputClass} mt-1`} name="providerKey" value={form.providerKey} readOnly /></label>
        <label className="min-w-0 text-sm">Network key (saved target)<input className={`${inputClass} mt-1`} name="networkKey" value={form.networkKey} readOnly /></label>
        <label className="min-w-0 text-sm md:col-span-2">Contract reference (saved target)<input className={`${inputClass} mt-1`} name="contractReference" value={form.contractReference} readOnly /></label>
        <label className="min-w-0 text-sm md:col-span-2">Synthetic actor UUIDs<textarea className="mt-1 min-h-20 w-full rounded-md border p-2 font-mono text-xs" name="syntheticUserIds" value={form.syntheticUserIds} onChange={(event) => update("syntheticUserIds", event.target.value)} /></label>
        <label className="min-w-0 text-sm md:col-span-2">Synthetic proposal/program UUIDs<textarea className="mt-1 min-h-20 w-full rounded-md border p-2 font-mono text-xs" name="syntheticSourceIds" value={form.syntheticSourceIds} onChange={(event) => update("syntheticSourceIds", event.target.value)} /></label>
        <p className="text-xs text-slate-600 md:col-span-2">Provider, network, and contract are determined by the approved target and update after saving a different target ID. Editing these settings never rewrites an existing target or redirects a pending proof. Saving uses runtime version {runtime.rowVersion}; stale updates require a reload. Only canonical hashes and minimal proof metadata leave AGAPE.</p>
        <button className={`${primaryButton} md:col-span-2`} disabled={lockedTarget && form.mode !== "off"}>{busy ? "Saving…" : "Save runtime configuration"}</button>
      </fieldset>
    </form>}
  </section>;
}
