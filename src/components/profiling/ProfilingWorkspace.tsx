"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deriveMinorStatus } from "@/lib/profiling/contracts";
import { ProfilingAggregatePanel, ResearcherOperationsPanel, SecretaryReviewPanel } from "./ProfilingRolePanels";

type Cycle = { id: string; barangay_id: string; barangay_name?: string; name: string; status: string; sample_method: string; target_households: number; approved_households: number; row_version: number; collection_starts_on?: string | null; collection_ends_on?: string | null; captain_endorsed_at: string | null };
type Sitio = { id: string; name: string };
type Notice = { id: string; version: string; notice_text: string; controller_name: string; privacy_contact: string; retention_summary: string };
type SampleUnit = { id: string; sample_reference: string; sitio_id: string; sitio_name: string; contact_outcome: string; household_code: string | null };
type Submission = { id: string; household_code: string; sitio_name: string; status: string; resident_count: number; row_version: number; return_reason: string | null };
type DetailResident = { resident_id: string; resident_code: string; profile: Record<string, unknown>; relationship_to_head: string | null; is_minor: boolean };
type Detail = Submission & { sample_reference?: string; household: Record<string, unknown>; household_data?: Record<string, unknown>; residents: DetailResident[]; consents?: unknown[] };
type ResidentDraft = {
  resident_id?: string;
  first_name: string; middle_name: string; last_name: string; suffix: string; birth_date: string; estimated_age: number;
  sex: string; civil_status: string; relationship_to_head: string; education_level: string; is_enrolled: boolean | null;
  school_category: string; employment_status: string; occupation_category: string; income_bracket: string;
  skills: string[]; disability_support: string[]; health_support: string[]; planning_needs: string[];
  pregnancy_status: boolean; pregnancy_effective_from: string; pregnancy_effective_to: string;
  is_solo_parent: boolean; is_4ps_member: boolean; consent: boolean; guardian_name: string; guardian_relationship: string;
};
type HouseholdDraft = {
  landmark: string; contact_number: string; income_bracket: string; housing_condition: string; electricity: string;
  water_source: string; sanitation: string; internet_access: string; devices: string[]; hazards: string[]; needs: string[];
  anonymous_nonparticipant_count: number;
};

const emptyResident = (): ResidentDraft => ({
  first_name: "", middle_name: "", last_name: "", suffix: "", birth_date: "", estimated_age: 18,
  sex: "not_stated", civil_status: "not_stated", relationship_to_head: "other", education_level: "not_stated",
  is_enrolled: null, school_category: "not_stated", employment_status: "not_stated", occupation_category: "not_stated",
  income_bracket: "not_stated", skills: [], disability_support: [], health_support: [], planning_needs: [],
  pregnancy_status: false, pregnancy_effective_from: "", pregnancy_effective_to: "", is_solo_parent: false,
  is_4ps_member: false, consent: false, guardian_name: "", guardian_relationship: "",
});
const emptyHousehold: HouseholdDraft = {
  landmark: "", contact_number: "", income_bracket: "not_stated", housing_condition: "not_stated", electricity: "not_stated",
  water_source: "not_stated", sanitation: "not_stated", internet_access: "not_stated", devices: [], hazards: [], needs: [],
  anonymous_nonparticipant_count: 0,
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload.data;
}

function ControlledSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: readonly string[] }) {
  return <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select>;
}

function ToggleGroup({ label, values, selected, onChange }: { label: string; values: readonly string[]; selected: string[]; onChange: (values: string[]) => void }) {
  return <fieldset className="rounded border p-3"><legend className="px-1 text-xs font-medium">{label}</legend><div className="flex flex-wrap gap-3">{values.map((value) => <label className="flex items-center gap-1 text-xs" key={value}><input type="checkbox" checked={selected.includes(value)} onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))} />{value.replaceAll("_", " ")}</label>)}</div></fieldset>;
}

export function ProfilingWorkspace({ audience, role }: { audience: "paraya" | "barangay"; role: string }) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [sitios, setSitios] = useState<Sitio[]>([]);
  const [sitioId, setSitioId] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeId, setNoticeId] = useState("");
  const [samples, setSamples] = useState<SampleUnit[]>([]);
  const [sampleReference, setSampleReference] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [aggregate, setAggregate] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [householdConsentName, setHouseholdConsentName] = useState("");
  const [household, setHousehold] = useState(emptyHousehold);
  const [residents, setResidents] = useState<ResidentDraft[]>([emptyResident()]);
  const [workbook, setWorkbook] = useState<File | null>(null);
  const [householdCsv, setHouseholdCsv] = useState<File | null>(null);
  const [residentCsv, setResidentCsv] = useState<File | null>(null);
  const [batch, setBatch] = useState<{ id: string; status: string; errors: unknown[] } | null>(null);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);

  const selectedCycle = useMemo(() => cycles.find((cycle) => cycle.id === cycleId), [cycles, cycleId]);
  const selectedNotice = notices.find((notice) => notice.id === noticeId) ?? notices[0];
  const canCollect = role === "barangay_mother_leader" || role === "paraya_researcher";
  const canValidate = role === "barangay_secretary";

  const loadCycles = useCallback(async () => {
    setLoading(true);
    try {
      const [cycleRows, noticeRows] = await Promise.all([requestJson("/api/profiling/cycles"), requestJson("/api/profiling/privacy/notice").catch(() => [])]);
      setCycles(cycleRows ?? []); setNotices(noticeRows ?? []);
      setCycleId((current) => current || cycleRows?.[0]?.id || "");
      setNoticeId((current) => current || noticeRows?.[0]?.id || "");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load profiling setup"); }
    finally { setLoading(false); }
  }, []);

  const loadCycle = useCallback(async () => {
    if (!selectedCycle) return;
    setSitioId(""); setSampleReference(""); setBatch(null); setDetail(null); setAggregate(null);
    setHouseholdConsentName(""); setHousehold(emptyHousehold); setResidents([emptyResident()]); setEditingSubmissionId(null);
    setWorkbook(null); setHouseholdCsv(null); setResidentCsv(null);
    const results = await Promise.allSettled([
      requestJson(`/api/profiling/sitios?barangay_id=${selectedCycle.barangay_id}`),
      requestJson(`/api/profiling/submissions?cycle_id=${selectedCycle.id}`),
      requestJson(`/api/profiling/analytics/${selectedCycle.id}`),
    ]);
    const sitioRows = results[0].status === "fulfilled" ? results[0].value ?? [] : [];
    setSitios(sitioRows); setSitioId(sitioRows[0]?.id ?? "");
    if (results[1].status === "fulfilled") setSubmissions(results[1].value ?? []);
    if (results[2].status === "fulfilled") setAggregate(results[2].value ?? null);
  }, [selectedCycle]);

  useEffect(() => { void loadCycles(); }, [loadCycles]);
  useEffect(() => { void loadCycle(); }, [loadCycle]);
  useEffect(() => {
    if (!selectedCycle || !sitioId || !canCollect) { setSamples([]); return; }
    void requestJson(`/api/profiling/sample-register?cycle_id=${selectedCycle.id}&sitio_id=${sitioId}`).then((rows) => setSamples(rows ?? [])).catch((error) => toast.error(error.message));
  }, [selectedCycle, sitioId, canCollect]);

  function updateResident(index: number, patch: Partial<ResidentDraft>) { setResidents((current) => current.map((resident, i) => i === index ? { ...resident, ...patch } : resident)); }

  function residentIsMinor(resident: ResidentDraft) {
    if (!selectedCycle?.collection_starts_on) return false;
    return deriveMinorStatus(resident.birth_date || null, resident.birth_date ? null : resident.estimated_age, selectedCycle.collection_starts_on);
  }

  function buildPackagePayload() {
    if (!selectedCycle || !sitioId || !selectedNotice) return;
    const rowKey = `manual-${crypto.randomUUID()}`;
    return {
      cycle_id: selectedCycle.id, household_row_key: rowKey, sample_reference: sampleReference,
      participation_consent: "granted", household_consent_name: householdConsentName, privacy_notice_version: selectedNotice.version, expected_version: 0,
      household: { ...household, sitio_id: sitioId, landmark: household.landmark || null, contact_number: household.contact_number || null },
      residents: residents.map((resident) => ({
        ...(resident.resident_id ? { resident_id: resident.resident_id } : {}),
        household_row_key: rowKey, first_name: resident.first_name, middle_name: resident.middle_name || null,
        last_name: resident.last_name, suffix: resident.suffix || null, birth_date: resident.birth_date || null,
        estimated_age: resident.birth_date ? null : resident.estimated_age, sex: resident.sex, civil_status: resident.civil_status,
        relationship_to_head: resident.relationship_to_head, education_level: resident.education_level,
        is_enrolled: resident.is_enrolled, school_category: resident.school_category,
        employment_status: resident.employment_status, occupation_category: resident.occupation_category,
        income_bracket: resident.income_bracket, skills: resident.skills, disability_support: resident.disability_support,
        health_support: resident.health_support, planning_needs: resident.planning_needs,
        pregnancy_status: resident.pregnancy_status, pregnancy_effective_from: resident.pregnancy_status ? resident.pregnancy_effective_from || null : null,
        pregnancy_effective_to: resident.pregnancy_status ? resident.pregnancy_effective_to || null : null,
        is_solo_parent: resident.is_solo_parent, is_4ps_member: resident.is_4ps_member,
        consent_status: resident.consent ? "granted" : "refused",
        guardian_name: residentIsMinor(resident) ? resident.guardian_name : null,
        guardian_relationship: residentIsMinor(resident) ? resident.guardian_relationship : null,
      })),
    };
  }

  async function savePackage(submit: boolean) {
    const payload = buildPackagePayload();
    if (!payload) return;
    try {
      const created = editingSubmissionId
        ? await requestJson(`/api/profiling/submissions/${editingSubmissionId}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, expected_version: detail?.row_version ?? 1 }) })
        : await requestJson("/api/profiling/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (submit) await requestJson(`/api/profiling/submissions/${created.id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_version: created.rowVersion }) });
      toast.success(submit ? "Package submitted for Secretary review" : "Draft saved");
      setSampleReference(""); setHouseholdConsentName(""); setHousehold(emptyHousehold); setResidents([emptyResident()]); setEditingSubmissionId(null); setDetail(null); await loadCycle();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Package save failed"); }
  }

  async function submitPackage() { await savePackage(true); }

  async function openReview(id: string) {
    try {
      const value = await requestJson(`/api/profiling/submissions/${id}`) as Detail;
      setDetail({ ...value, household_data: value.household });
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load profile detail"); }
  }

  function loadDetailIntoForm(value: Detail) {
    setDetail(value); setEditingSubmissionId(value.id); setSampleReference(value.sample_reference ?? sampleReference); setSitioId(value.sitio_name ? sitios.find((item) => item.name === value.sitio_name)?.id ?? sitioId : sitioId);
    setHousehold({ ...emptyHousehold, ...(value.household as Partial<HouseholdDraft>) });
    setResidents(value.residents.map((item) => ({ ...emptyResident(), ...(item.profile as Partial<ResidentDraft>), resident_id: item.resident_id, relationship_to_head: item.relationship_to_head ?? "other", estimated_age: Number(item.profile.estimated_age ?? 18), consent: true })));
  }

  async function editReturned(id: string) {
    try { loadDetailIntoForm(await requestJson(`/api/profiling/submissions/${id}`)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load returned package"); }
  }

  async function seedReprofile() {
    if (!selectedCycle || !sampleReference) return;
    try {
      const seed = await requestJson(`/api/profiling/submissions/${selectedCycle.id}/reprofile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample_reference: sampleReference }) });
      setHousehold({ ...emptyHousehold, ...(seed.household as Partial<HouseholdDraft>) });
      setResidents((seed.residents ?? []).map((item: Record<string, unknown>) => ({ ...emptyResident(), ...item, resident_id: String(item.resident_id), estimated_age: Number(item.estimated_age ?? 18), consent: true })));
      toast.success("Latest approved roster loaded as a new draft");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No prior approved roster is available"); }
  }

  async function recordNonParticipation(outcome: "refused" | "unavailable") {
    if (!selectedCycle || !sitioId || !sampleReference) return;
    try {
      await requestJson("/api/profiling/sample-outcomes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle_id: selectedCycle.id, sitio_id: sitioId, sample_reference: sampleReference, contact_outcome: outcome, anonymous_household_size: household.anonymous_nonparticipant_count || null }) });
      toast.success(`Sample recorded as ${outcome}`); setSampleReference(""); await loadCycle();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Outcome could not be recorded"); }
  }

  async function decide(decision: "approve" | "return", suppliedReason?: string) {
    if (!detail) return;
    const reason = decision === "return" ? suppliedReason?.trim() : null;
    if (decision === "return" && !reason) return;
    try {
      await requestJson(`/api/profiling/submissions/${detail.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_version: detail.row_version, decision, reason }) });
      toast.success(`Package ${decision === "approve" ? "approved" : "returned"}`); setDetail(null); await loadCycle();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Decision failed"); }
  }

  async function stageImport() {
    if (!selectedCycle || !sitioId) return;
    const form = new FormData(); form.set("cycle_id", selectedCycle.id); form.set("sitio_id", sitioId);
    if (workbook) form.set("workbook", workbook); else if (householdCsv && residentCsv) { form.set("household_csv", householdCsv); form.set("resident_csv", residentCsv); }
    try { const result = await requestJson("/api/profiling/imports/preview", { method: "POST", body: form }); setBatch({ id: result.batch_id, status: result.status, errors: result.errors ?? [] }); toast[result.status === "ready" ? "success" : "warning"](`Import is ${result.status}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Import failed"); }
  }

  async function commitImport() {
    if (!batch || batch.status !== "ready") return;
    try { const result = await requestJson(`/api/profiling/imports/${batch.id}/commit`, { method: "POST" }); toast.success(`${result.committed_packages} packages committed`); setBatch(null); await loadCycle(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Commit failed"); }
  }

  async function transitionCycle() {
    if (!selectedCycle) return;
    const next: Record<string, string> = { draft: "collecting", collecting: "validating", validating: "completed", completed: "archived" };
    if (!next[selectedCycle.status]) return;
    try { await requestJson(`/api/profiling/cycles/${selectedCycle.id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_version: selectedCycle.row_version, to_status: next[selectedCycle.status] }) }); await loadCycles(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Transition failed"); }
  }

  async function endorseCycle() {
    if (!selectedCycle || selectedCycle.status !== "completed") return;
    try {
      const result = await requestJson(`/api/profiling/cycles/${selectedCycle.id}/endorse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_version: selectedCycle.row_version }) });
      setCycles((current) => current.map((cycle) => cycle.id === selectedCycle.id ? { ...cycle, row_version: result.row_version } : cycle));
      toast.success("Completed cycle endorsed");
      await loadCycles();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Endorsement failed"); }
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-heading text-2xl font-bold">Resident profiling</h1><p className="text-sm text-muted-foreground">Sampled, consented, versioned resident records. Legacy household data is excluded.</p></div><Button variant="outline" size="sm" onClick={() => void loadCycles()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
    <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><label className="text-sm font-medium">Cycle</label><select className="h-10 min-w-72 rounded-md border bg-background px-3" value={cycleId} onChange={(event) => setCycleId(event.target.value)}>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.barangay_name ? `${cycle.barangay_name} — ` : ""}{cycle.name} · {cycle.status}</option>)}</select>{selectedCycle && <><Badge>{selectedCycle.status}</Badge><span className="text-sm text-muted-foreground">{selectedCycle.approved_households}/{selectedCycle.target_households} approved</span>{role === "paraya_researcher" && <Button size="sm" variant="outline" onClick={() => void transitionCycle()}>Advance cycle</Button>}</>}</CardContent></Card>

    {selectedNotice && canCollect && <Card><CardHeader><CardTitle className="text-base">Approved privacy notice · {selectedNotice.version}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="whitespace-pre-wrap">{selectedNotice.notice_text}</p><p className="text-muted-foreground">Controller: {selectedNotice.controller_name} · Contact: {selectedNotice.privacy_contact}</p><p className="text-muted-foreground">Retention: {selectedNotice.retention_summary}</p></CardContent></Card>}

    {aggregate && selectedCycle && <ProfilingAggregatePanel aggregate={aggregate} cycleId={selectedCycle.id} />}

    {audience === "paraya" && role === "paraya_researcher" && <ResearcherOperationsPanel cycle={selectedCycle} sitios={sitios} notices={notices} requestJson={requestJson} onRefresh={loadCycles} />}

    {canCollect && selectedCycle?.status === "collecting" && <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Assigned-sitio sample queue</CardTitle></CardHeader><CardContent className="space-y-3"><ControlledSelect value={sitioId} onChange={setSitioId} options={sitios.map((item) => item.id)} />{sitios.length > 0 && <p className="text-xs text-muted-foreground">Selected: {sitios.find((item) => item.id === sitioId)?.name}</p>}<div className="max-h-52 space-y-2 overflow-auto">{samples.map((sample) => <button type="button" key={sample.id} className={`w-full rounded border p-3 text-left text-sm ${sampleReference === sample.sample_reference ? "border-primary" : ""}`} disabled={!['not_contacted','unavailable'].includes(sample.contact_outcome)} onClick={() => setSampleReference(sample.sample_reference)}><span className="font-mono">{sample.sample_reference}</span><span className="float-right text-muted-foreground">{sample.contact_outcome}</span></button>)}</div>{sampleReference && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void recordNonParticipation("refused")}>Record refusal</Button><Button size="sm" variant="outline" onClick={() => void recordNonParticipation("unavailable")}>Record unavailable</Button><Button size="sm" variant="outline" onClick={() => void seedReprofile()}>Load prior approved roster</Button></div>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Household and resident package</CardTitle></CardHeader><CardContent className="space-y-3"><Input readOnly value={sampleReference} placeholder="Select a registered sample unit" /><Input value={householdConsentName} onChange={(event) => setHouseholdConsentName(event.target.value)} placeholder="Household consent signer" /><div className="grid grid-cols-2 gap-2"><ControlledSelect value={household.income_bracket} onChange={(value) => setHousehold((current) => ({ ...current, income_bracket: value }))} options={["not_stated","below_5000","5000_9999","10000_19999","20000_39999","40000_59999","60000_plus"]} /><ControlledSelect value={household.housing_condition} onChange={(value) => setHousehold((current) => ({ ...current, housing_condition: value }))} options={["not_stated","adequate","needs_minor_repair","needs_major_repair","temporary"]} /></div>{residents.map((resident, index) => { const minor = residentIsMinor(resident); return <div className="space-y-2 rounded border p-3" key={index}><div className="flex justify-between"><strong className="text-sm">Resident {index + 1}</strong>{residents.length > 1 && <Button size="xs" variant="ghost" onClick={() => setResidents((current) => current.filter((_, i) => i !== index))}>Remove</Button>}</div><div className="grid grid-cols-2 gap-2"><Input value={resident.first_name} onChange={(event) => updateResident(index, { first_name: event.target.value })} placeholder="First name" /><Input value={resident.last_name} onChange={(event) => updateResident(index, { last_name: event.target.value })} placeholder="Last name" /></div><div className="grid grid-cols-2 gap-2"><Input type="number" min={0} max={125} disabled={Boolean(resident.birth_date)} value={resident.estimated_age} onChange={(event) => updateResident(index, { estimated_age: Number(event.target.value) })} /><ControlledSelect value={resident.sex} onChange={(value) => updateResident(index, { sex: value })} options={["not_stated","female","male","intersex"]} /></div><div className="grid grid-cols-2 gap-2"><ControlledSelect value={resident.relationship_to_head} onChange={(value) => updateResident(index, { relationship_to_head: value })} options={["household_head","spouse_partner","child","parent","sibling","relative","non_relative","other"]} /><ControlledSelect value={resident.education_level} onChange={(value) => updateResident(index, { education_level: value })} options={["not_stated","none","early_childhood","elementary","junior_high","senior_high","technical_vocational","college","postgraduate"]} /></div>{minor && <div className="grid grid-cols-2 gap-2"><Input value={resident.guardian_name} onChange={(event) => updateResident(index, { guardian_name: event.target.value })} placeholder="Guardian name" /><Input value={resident.guardian_relationship} onChange={(event) => updateResident(index, { guardian_relationship: event.target.value })} placeholder="Guardian relationship" /></div>}<label className="flex gap-2 text-sm"><input type="checkbox" checked={resident.consent} onChange={(event) => updateResident(index, { consent: event.target.checked })} />{minor ? "Guardian authorization recorded" : "Adult consent recorded"}</label></div>; })}<div className="flex gap-2"><Button variant="outline" onClick={() => setResidents((current) => [...current, emptyResident()])}>Add resident</Button><Button onClick={() => void submitPackage()} disabled={!sampleReference || !householdConsentName || residents.some((resident) => !resident.first_name || !resident.last_name || !resident.consent || (residentIsMinor(resident) && (!resident.guardian_name || !resident.guardian_relationship)))}>Submit for review</Button></div></CardContent></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base"><Upload className="mr-2 inline h-4 w-4" />Versioned import</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><a className={buttonVariants({ size: "sm", variant: "outline" })} href="/api/profiling/imports/template?format=xlsx"><Download className="mr-2 h-4 w-4" />XLSX template</a><a className={buttonVariants({ size: "sm", variant: "outline" })} href="/api/profiling/imports/template?format=household_csv">Household CSV</a><a className={buttonVariants({ size: "sm", variant: "outline" })} href="/api/profiling/imports/template?format=resident_csv">Resident CSV</a></div><div className="grid gap-2 md:grid-cols-3"><Input type="file" accept=".xlsx" onChange={(event) => setWorkbook(event.target.files?.[0] ?? null)} /><Input type="file" accept=".csv" onChange={(event) => setHouseholdCsv(event.target.files?.[0] ?? null)} /><Input type="file" accept=".csv" onChange={(event) => setResidentCsv(event.target.files?.[0] ?? null)} /></div><Button variant="outline" onClick={() => void stageImport()} disabled={!workbook && !(householdCsv && residentCsv)}>Validate and stage</Button>{batch && <div className="rounded border p-3 text-sm"><p>Status: <Badge>{batch.status}</Badge> · {batch.errors.length} row errors</p>{batch.errors.length > 0 && <pre className="mt-2 max-h-40 overflow-auto text-xs">{JSON.stringify(batch.errors, null, 2)}</pre>}<Button className="mt-3" disabled={batch.status !== "ready"} onClick={() => void commitImport()}>Commit ready batch</Button></div>}</CardContent></Card>
    </div>}

    {canCollect && selectedCycle?.status === "collecting" && <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">Draft and correction controls</p><p className="text-xs text-muted-foreground">Save without submitting, or resume a returned package from the queue below.</p></div><Button variant="outline" onClick={() => void savePackage(false)} disabled={!sampleReference || !householdConsentName}>Save current draft</Button></CardContent></Card>}

    <Card><CardHeader><CardTitle className="text-base">Profiling packages</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/30"><th className="p-3 text-left">Household</th><th className="p-3 text-left">Sitio</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Residents</th><th className="p-3" /></tr></thead><tbody>{submissions.map((submission) => <tr className="border-b" key={submission.id}><td className="p-3 font-mono text-xs">{submission.household_code}</td><td className="p-3">{submission.sitio_name}</td><td className="p-3"><Badge variant="outline">{submission.status}</Badge>{submission.return_reason && <p className="mt-1 text-xs text-danger">{submission.return_reason}</p>}</td><td className="p-3 text-right">{submission.resident_count}</td><td className="p-3 text-right">{canValidate && submission.status === "pending" && <Button size="sm" variant="outline" onClick={() => void openReview(submission.id)}>Review details</Button>}</td></tr>)}</tbody></table></CardContent></Card>

    {canCollect && submissions.some((submission) => submission.status === "returned") && <Card><CardHeader><CardTitle className="text-base">Returned packages</CardTitle></CardHeader><CardContent className="space-y-2">{submissions.filter((submission) => submission.status === "returned").map((submission) => <div className="flex items-center justify-between rounded border p-3" key={submission.id}><div><p className="font-mono text-xs">{submission.household_code}</p><p className="text-xs text-danger">{submission.return_reason}</p></div><Button size="sm" variant="outline" onClick={() => void editReturned(submission.id)}>Open correction</Button></div>)}</CardContent></Card>}

    {detail && <SecretaryReviewPanel detail={detail} onClose={() => setDetail(null)} onDecision={decide} />}
    {canCollect && selectedCycle?.status === "collecting" && <Card><CardHeader><CardTitle className="text-base">Complete planning field catalog</CardTitle></CardHeader><CardContent className="space-y-5">
      <section className="space-y-3"><h3 className="text-sm font-semibold">Household conditions</h3><div className="grid gap-2 md:grid-cols-2"><Input value={household.landmark} onChange={(event) => setHousehold((current) => ({ ...current, landmark: event.target.value }))} placeholder="Optional landmark" /><Input value={household.contact_number} onChange={(event) => setHousehold((current) => ({ ...current, contact_number: event.target.value }))} placeholder="Optional contact number" /><ControlledSelect value={household.electricity} onChange={(value) => setHousehold((current) => ({ ...current, electricity: value }))} options={["not_stated","connected","shared","none"]} /><ControlledSelect value={household.water_source} onChange={(value) => setHousehold((current) => ({ ...current, water_source: value }))} options={["not_stated","piped","well","delivered","communal","other"]} /><ControlledSelect value={household.sanitation} onChange={(value) => setHousehold((current) => ({ ...current, sanitation: value }))} options={["not_stated","private_flush","shared_flush","latrine","none"]} /><ControlledSelect value={household.internet_access} onChange={(value) => setHousehold((current) => ({ ...current, internet_access: value }))} options={["not_stated","fixed","mobile","shared","none"]} /></div><ToggleGroup label="Devices" values={["smartphone","basic_phone","tablet","laptop","desktop","television","radio"]} selected={household.devices} onChange={(devices) => setHousehold((current) => ({ ...current, devices }))} /><ToggleGroup label="Hazards" values={["flood","fire","landslide","extreme_heat","unsafe_structure","other"]} selected={household.hazards} onChange={(hazards) => setHousehold((current) => ({ ...current, hazards }))} /><ToggleGroup label="Household needs" values={["health","education","livelihood","housing","sanitation","disaster_readiness","digital_access","other"]} selected={household.needs} onChange={(needs) => setHousehold((current) => ({ ...current, needs }))} /></section>
      {residents.map((resident, index) => <section className="space-y-3 rounded border p-3" key={`catalog-${index}`}><h3 className="text-sm font-semibold">Resident {index + 1} · planning indicators</h3><div className="grid gap-2 md:grid-cols-3"><Input value={resident.middle_name} onChange={(event) => updateResident(index, { middle_name: event.target.value })} placeholder="Middle name (optional)" /><Input value={resident.suffix} onChange={(event) => updateResident(index, { suffix: event.target.value })} placeholder="Suffix (optional)" /><Input type="date" value={resident.birth_date} onChange={(event) => updateResident(index, { birth_date: event.target.value })} /><ControlledSelect value={resident.civil_status} onChange={(value) => updateResident(index, { civil_status: value })} options={["not_stated","single","married","cohabiting","separated","widowed"]} /><ControlledSelect value={resident.is_enrolled === null ? "not_stated" : resident.is_enrolled ? "yes" : "no"} onChange={(value) => updateResident(index, { is_enrolled: value === "not_stated" ? null : value === "yes" })} options={["not_stated","yes","no"]} /><ControlledSelect value={resident.school_category} onChange={(value) => updateResident(index, { school_category: value })} options={["not_stated","public","private","alternative_learning"]} /><ControlledSelect value={resident.employment_status} onChange={(value) => updateResident(index, { employment_status: value })} options={["not_stated","employed","self_employed","unemployed_seeking","not_seeking","student","retired"]} /><ControlledSelect value={resident.occupation_category} onChange={(value) => updateResident(index, { occupation_category: value })} options={["not_stated","agriculture","fishing","construction","manufacturing","transport","retail","food_service","education","health_care","public_service","domestic_work","technology","professional","informal_labor","unemployed","student","retired","other"]} /><ControlledSelect value={resident.income_bracket} onChange={(value) => updateResident(index, { income_bracket: value })} options={["not_stated","none","below_5000","5000_9999","10000_19999","20000_plus"]} /></div><ToggleGroup label="Skills" values={["agriculture","food_preparation","sewing","handicraft","carpentry","electrical","plumbing","caregiving","teaching","digital_literacy","computer_technical","entrepreneurship","driving","community_organizing","disaster_response","first_aid","other"]} selected={resident.skills} onChange={(skills) => updateResident(index, { skills })} /><ToggleGroup label="Disability support categories" values={["mobility","vision","hearing","communication","cognitive","psychosocial","self_care","other"]} selected={resident.disability_support} onChange={(disability_support) => updateResident(index, { disability_support })} /><ToggleGroup label="Health support categories" values={["maternal","child_nutrition","maintenance_medicine","mobility_support","mental_wellbeing","other"]} selected={resident.health_support} onChange={(health_support) => updateResident(index, { health_support })} /><ToggleGroup label="Planning needs" values={["health","education","livelihood","accessibility","digital_access","other"]} selected={resident.planning_needs} onChange={(planning_needs) => updateResident(index, { planning_needs })} /><div className="flex flex-wrap gap-4 text-sm"><label className="flex gap-2"><input type="checkbox" checked={resident.is_solo_parent} onChange={(event) => updateResident(index, { is_solo_parent: event.target.checked })} />Solo parent</label><label className="flex gap-2"><input type="checkbox" checked={resident.is_4ps_member} onChange={(event) => updateResident(index, { is_4ps_member: event.target.checked })} />4Ps member</label><label className="flex gap-2"><input type="checkbox" checked={resident.pregnancy_status} onChange={(event) => updateResident(index, { pregnancy_status: event.target.checked })} />Pregnancy support</label></div>{resident.pregnancy_status && <div className="grid gap-2 md:grid-cols-2"><label className="text-xs">Effective from<Input type="date" value={resident.pregnancy_effective_from} onChange={(event) => updateResident(index, { pregnancy_effective_from: event.target.value })} /></label><label className="text-xs">Effective to<Input type="date" value={resident.pregnancy_effective_to} onChange={(event) => updateResident(index, { pregnancy_effective_to: event.target.value })} /></label></div>}</section>)}
    </CardContent></Card>}

    {role === "barangay_captain" && selectedCycle?.status === "completed" && <Card><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="font-medium">Captain endorsement</p><p className="text-xs text-muted-foreground">Endorsement is separate and does not change approved counts.</p></div><Button onClick={() => void endorseCycle()} disabled={Boolean(selectedCycle.captain_endorsed_at)}>{selectedCycle.captain_endorsed_at ? "Endorsed" : "Endorse completed cycle"}</Button></CardContent></Card>}
  </div>;
}
