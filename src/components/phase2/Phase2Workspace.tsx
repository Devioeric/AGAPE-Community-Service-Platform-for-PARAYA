"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Flags = { partners: boolean; history: boolean; proposals: boolean; finance: boolean };
type Partner = { id: string; code: string; name: string; type: string; lifecycle: string; currentTerm: { derivedStatus: string } | null };
type HistoricalProgram = { id: string; code: string; title: string; category: string; status: string; quality: string; startsOn: string | null };
type Readiness = { mode?: string; readyForLive?: boolean; missingAttestations?: string[]; writeAuthority?: string | null };

function Gate({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return enabled ? children : <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Server gate is off. Database mode must also remain off until release evidence passes.</div>;
}
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body.data;
}

export function Phase2Workspace({ flags }: { flags: Flags }) {
  const [tab, setTab] = useState<"partners" | "history" | "proposals" | "finance">("partners");
  const [partners, setPartners] = useState<Partner[]>([]); const [history, setHistory] = useState<HistoricalProgram[]>([]);
  const [readiness, setReadiness] = useState<Record<string, Readiness>>({}); const [detail, setDetail] = useState<unknown>(null);
  const [proposalId, setProposalId] = useState(""); const [programId, setProgramId] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (flags.partners) setPartners(await api("/api/v2/partners"));
      if (flags.history) setHistory(await api("/api/v2/historical-programs"));
      const entries = await Promise.all(["partners", "historical_programs", "proposals", "program_finance"].map(async (component) => {
        try { return [component, await api(`/api/v2/runtime/${component}`)] as const; } catch { return [component, {}] as const; }
      })); setReadiness(Object.fromEntries(entries));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load Phase 2 data"); }
  }, [flags.history, flags.partners]);
  useEffect(() => { void load(); }, [load]);

  const inspect = async (url: string, init?: RequestInit) => {
    setBusy(true); setMessage("");
    try { setDetail(await api(url, init)); } catch (error) { setMessage(error instanceof Error ? error.message : "Operation failed"); } finally { setBusy(false); }
  };
  const previewImport = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void inspect("/api/v2/historical-programs/imports/preview", { method: "POST", body: new FormData(event.currentTarget) }); };
  const workflow = (action: string) => {
    const expectedVersion = Number(prompt("Expected row version")); if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return;
    const remarks = prompt("Remarks (required for returns/rejections)") ?? "";
    void inspect(`/api/v2/proposals/${proposalId}/workflow`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, expectedVersion, remarks, acknowledgedWarningCodes: [] }) });
  };
  const tabs = [["partners", "Partners", flags.partners], ["history", "Historical programs", flags.history], ["proposals", "Structured proposals", flags.proposals], ["finance", "Program finance", flags.finance]] as const;
  const component = tab === "history" ? "historical_programs" : tab === "finance" ? "program_finance" : tab; const status = readiness[component] ?? {};

  return <div className="space-y-5">
    <div className="rounded-xl border bg-white p-5"><h1 className="text-2xl font-semibold">Phase 2 operations</h1><p className="mt-1 text-sm text-slate-600">Dark-launch console. It never enables a component or bypasses database runtime checks.</p><div className="mt-4 flex flex-wrap gap-2">{tabs.map(([key, label, enabled]) => <button key={key} onClick={() => { setTab(key); setDetail(null); }} className={`rounded-md px-3 py-2 text-sm ${tab === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>{label} <span className="ml-1 text-xs">{enabled ? "server on" : "off"}</span></button>)}</div><div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3"><div>DB mode: <b>{status.mode ?? "unavailable"}</b></div><div>Write authority: <b>{status.writeAuthority ?? "n/a"}</b></div><div>Live readiness: <b>{status.readyForLive ? "attested" : "blocked"}</b></div></div>{!!status.missingAttestations?.length && <p className="mt-2 text-xs text-amber-800">Missing: {status.missingAttestations.join(", ")}</p>}</div>
    {message && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>}

    {tab === "partners" && <Gate enabled={flags.partners}><section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Partner/Proponent registry</h2><p className="mb-4 text-sm text-slate-600">Organizations are non-login entities. Open a record for scoped contacts, renewable terms, metrics, and timeline.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Code</th><th>Name</th><th>Type</th><th>Lifecycle</th><th>Agreement</th><th /></tr></thead><tbody>{partners.map((partner) => <tr className="border-b" key={partner.id}><td className="p-2 font-mono">{partner.code}</td><td>{partner.name}</td><td>{partner.type}</td><td>{partner.lifecycle}</td><td>{partner.currentTerm?.derivedStatus ?? "not configured"}</td><td><button className="text-blue-700 underline" onClick={() => void inspect(`/api/v2/partners/${partner.id}`)}>Open</button></td></tr>)}</tbody></table></div></section></Gate>}

    {tab === "history" && <Gate enabled={flags.history}><section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">Historical program intake</h2><p className="text-sm text-slate-600">Unknown-date and unverified records remain outside five-year metrics.</p><div className="flex flex-wrap gap-3"><a className="rounded border px-3 py-2 text-sm" href="/api/v2/historical-programs/imports/template">Download controlled template</a><form onSubmit={previewImport} className="flex gap-2"><input name="workbook" type="file" accept=".xlsx" required className="text-sm" /><button disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Preview workbook</button></form></div><div className="space-y-2">{history.map((program) => <button onClick={() => void inspect(`/api/v2/historical-programs/${program.id}`)} className="block w-full rounded-md border p-3 text-left" key={program.id}><div className="font-medium">{program.title}</div><div className="text-xs text-slate-600">{program.code} · {program.category} · {program.status} · {program.quality} · {program.startsOn ?? "unknown date"}</div></button>)}</div></section></Gate>}

    {tab === "proposals" && <Gate enabled={flags.proposals}><section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">Structured proposal review</h2><p className="text-sm text-slate-600">Graph edits are atomic; all workflow actions remain human initiated and version checked.</p><div className="flex gap-2"><input value={proposalId} onChange={(event) => setProposalId(event.target.value)} placeholder="Proposal UUID" className="min-w-72 rounded border px-3 py-2 text-sm" /><button disabled={!proposalId || busy} onClick={() => void inspect(`/api/v2/proposals/${proposalId}`)} className="rounded border px-3 py-2 text-sm">Inspect</button></div><div className="flex flex-wrap gap-2">{["submit", "pass_pre_screening", "confirm_evidence", "request_revision", "finance_return", "finance_clear", "director_approve", "director_reject"].map((action) => <button key={action} disabled={!proposalId || busy} onClick={() => workflow(action)} className="rounded bg-slate-100 px-3 py-2 text-xs">{action.replaceAll("_", " ")}</button>)}</div></section></Gate>}

    {tab === "finance" && <Gate enabled={flags.finance}><section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">Program financial monitoring</h2><p className="text-sm text-slate-600">Finance reviews or returns without editing figures. Pending and verified actuals remain separate.</p><div className="flex flex-wrap gap-2"><input value={programId} onChange={(event) => setProgramId(event.target.value)} placeholder="Program UUID" className="min-w-72 rounded border px-3 py-2 text-sm" /><button disabled={!programId || busy} onClick={() => void inspect(`/api/v2/programs/${programId}/finance`)} className="rounded border px-3 py-2 text-sm">Load allocation and actuals</button><button disabled={busy} onClick={() => void inspect("/api/v2/finance/proposals")} className="rounded border px-3 py-2 text-sm">Finance queue</button></div></section></Gate>}

    {detail !== null && <section className="rounded-xl border bg-slate-950 p-4 text-xs text-slate-100"><div className="mb-2 flex justify-between"><b>Allowlisted response</b><button onClick={() => setDetail(null)}>Close</button></div><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap">{JSON.stringify(detail, null, 2)}</pre></section>}
  </div>;
}
