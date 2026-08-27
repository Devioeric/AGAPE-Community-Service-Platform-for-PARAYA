"use client";

import { useEffect } from "react";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

// The actual printable form. Server component fetches; this just lays out and
// auto-fires window.print(). Layout is intentionally form-y — labeled fields,
// signature blocks, a budget line — to look like an official document.

interface Proposal {
  id:                          string;
  title:                       string;
  rationale:                   string | null;
  objectives:                  string | null;
  target_beneficiaries:        string | null;
  expected_output:             string | null;
  timeline_start:              string | null;
  timeline_end:                string | null;
  budget:                      number | null;
  status:                      string;
  created_at:                  string;
  community_validated_at:     string | null;
  barangays:                   { name: string } | null;
  proposal_sdg_alignment:      { sdg_number: number; indicator: string | null }[];
  users:                       { full_name: string | null } | null;
}

interface ValidationLink {
  id:          string;
  source_type: string;
  provenance_kind: "validation" | "advisory_planning";
  rationale:   string;
  details:     Record<string, unknown> | null;
}

interface ValidationEvent {
  id:             string;
  method:         string;
  date_conducted: string;
  summary:        string;
  stakeholders:   { role: string | null; present: boolean }[];
  evidence_count: number;
}

const METHOD_LABELS: Record<string, string> = {
  fgd:           "Focus Group Discussion",
  key_informant: "Key Informant Interview",
  town_hall:     "Town Hall / Barangay Assembly",
  consultation:  "Community Consultation",
  door_to_door:  "Door-to-door Visits",
  other:         "Other",
};

const SOURCE_LABELS: Record<string, string> = {
  community_need:     "Community Need",
  survey:             "Survey",
  survey_response:    "Survey Response",
  field_observation:  "Field Observation",
  household_profile:  "Household Profile",
  profiling_evidence_snapshot: "Approved Profiling Evidence Snapshot",
};

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const currency = (n: number | null) => {
  if (n == null) return "—";
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
};

function summarizeLink(link: ValidationLink): { title: string; meta: string } {
  const d = link.details ?? {};
  const brgy = (d.barangays as { name?: string } | null)?.name ?? "";
  if (link.source_type === "community_need") {
    const sitio = (d.sitio as string) ?? "";
    const cat   = (d.category as string) ?? "";
    const appr  = (d.approval_status as string) === "approved" ? " · Captain-approved" : "";
    return {
      title: (d.title as string) ?? "Untitled need",
      meta:  [cat, brgy, sitio].filter(Boolean).join(" · ") + appr,
    };
  }
  if (link.source_type === "survey") {
    return {
      title: (d.title as string) ?? "Survey",
      meta:  [(d.status as string) ?? "", brgy].filter(Boolean).join(" · "),
    };
  }
  if (link.source_type === "survey_response") {
    const surveyValue = d.surveys as { title?: string } | { title?: string }[] | null;
    const survey = Array.isArray(surveyValue) ? surveyValue[0] : surveyValue;
    return { title: survey?.title ? `Legacy response for ${survey.title}` : "Legacy survey response", meta: "Historical lineage" };
  }
  if (link.source_type === "field_observation") {
    const obs = (d.observation as string) ?? "";
    return {
      title: obs.length > 100 ? obs.slice(0, 100) + "…" : obs,
      meta:  [(d.observation_date as string) ?? "", (d.category as string) ?? "", (d.sitio as string) ?? ""]
              .filter(Boolean).join(" · "),
    };
  }
  if (link.source_type === "household_profile") {
    const hh   = (d.household_number as string) ?? "";
    return {
      title: hh ? `Legacy household ${hh}` : "Legacy household evidence",
      meta:  [brgy, (d.sitio as string) ?? ""].filter(Boolean).join(" · "),
    };
  }
  if (link.source_type === "profiling_evidence_snapshot") {
    const cycle = d.profiling_cycles as { name?: string; barangays?: { name?: string } | null } | null;
    return { title: cycle?.name ?? "Completed profiling cycle", meta: [cycle?.barangays?.name, d.aggregate_schema_version as string].filter(Boolean).join(" · ") };
  }
  return { title: "Linked record", meta: "" };
}

export default function PpfClient({
  proposal, validationLinks = [], validationEvents = [],
}: {
  proposal:          Proposal;
  validationLinks?:  ValidationLink[];
  validationEvents?: ValidationEvent[];
}) {
  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
  }, []);

  const sdgList = proposal.proposal_sdg_alignment ?? [];

  return (
    <div className="max-w-3xl mx-auto bg-card text-foreground">
      {/* Toolbar — hidden when printing */}
      <div className="print-hidden flex items-center justify-between gap-3 py-4 border-b border-border mb-6">
        <Link
          href="/officer/proposals"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Proposals
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-primary/30 text-primary text-sm hover:bg-primary/5"
        >
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      {/* Masthead */}
      <header className="text-center mb-8">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Dr. Yanga&apos;s Colleges, Inc. · PARAYA Office
        </p>
        <h1 className="font-heading text-2xl font-bold mt-1">Project Participation Form</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Generated {fmtDate(new Date().toISOString())} · Reference {proposal.id.slice(0, 8).toUpperCase()}
        </p>
      </header>

      {/* Section: project info */}
      <section className="space-y-3 text-sm">
        <div className="border-b border-foreground/20 pb-2">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground/80">
            1. Project Information
          </h2>
        </div>

        <Field label="Project title" value={proposal.title} />
        <Field label="Partner barangay" value={proposal.barangays?.name ?? "—"} />
        <Field
          label="Implementation period"
          value={`${fmtDate(proposal.timeline_start)} – ${fmtDate(proposal.timeline_end)}`}
        />
        <Field label="Estimated budget" value={currency(proposal.budget)} />
        <Field label="Target beneficiaries" value={proposal.target_beneficiaries ?? "—"} />
        <Field
          label="SDG alignment"
          value={sdgList.length > 0
            ? sdgList.map((a) => `SDG ${a.sdg_number}${a.indicator ? ` (${a.indicator})` : ""}`).join("; ")
            : "—"}
        />
      </section>

      {/* Section: rationale */}
      <section className="space-y-2 text-sm mt-6">
        <div className="border-b border-foreground/20 pb-2">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground/80">
            2. Rationale
          </h2>
        </div>
        <p className="whitespace-pre-line">{proposal.rationale ?? "—"}</p>
      </section>

      {/* Section: objectives */}
      <section className="space-y-2 text-sm mt-6">
        <div className="border-b border-foreground/20 pb-2">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground/80">
            3. Objectives
          </h2>
        </div>
        <p className="whitespace-pre-line">{proposal.objectives ?? "—"}</p>
      </section>

      {/* Section: expected output */}
      <section className="space-y-2 text-sm mt-6">
        <div className="border-b border-foreground/20 pb-2">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground/80">
            4. Expected Output
          </h2>
        </div>
        <p className="whitespace-pre-line">{proposal.expected_output ?? "—"}</p>
      </section>

      {/* Section: community validation lineage (Phase II) ─────────────────
          Lists the structural evidence backing this proposal: linked
          community-engagement records + any supplementary consultation
          events the team uploaded. Designed to print cleanly. */}
      <section className="space-y-3 text-sm mt-6">
        <div className="border-b border-foreground/20 pb-2">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground/80">
            5. Community Validation Lineage (Phase II)
          </h2>
        </div>

        {/* Sub: Linked records, grouped by source type */}
        {validationLinks.length === 0 && validationEvents.length === 0 ? (
          <p className="text-muted-foreground">
            No community validation records on file.
            {proposal.community_validated_at && (
              <span className="block mt-1 italic">
                Legacy attestation recorded {fmtDate(proposal.community_validated_at)}.
                Supporting notes remain in the governed proposal record.
              </span>
            )}
          </p>
        ) : (
          <>
            {validationLinks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground/80">
                  5.1 Linked Records ({validationLinks.length})
                </p>
                <p className="text-xs text-muted-foreground">
                  Existing community-engagement records that informed this proposal&apos;s objectives.
                </p>
                {/* Group by source_type for readability */}
                {Array.from(
                  validationLinks.reduce((m, l) => {
                    const arr = m.get(l.source_type) ?? [];
                    arr.push(l);
                    m.set(l.source_type, arr);
                    return m;
                  }, new Map<string, ValidationLink[]>()).entries(),
                ).map(([type, items]) => (
                  <div key={type} className="mt-2">
                    <p className="text-xs font-medium text-foreground/70">
                      {SOURCE_LABELS[type] ?? type} ({items.length})
                    </p>
                    <ul className="ml-4 mt-1 space-y-1.5">
                      {items.map((l) => {
                        const s = summarizeLink(l);
                        return (
                          <li key={l.id} className="text-xs">
                            <span className="font-medium text-foreground">{s.title}</span>
                            {s.meta && <span className="text-muted-foreground"> — {s.meta}</span>}
                            {l.provenance_kind === "advisory_planning" && (
                              <span className="text-info"> — planning provenance only</span>
                            )}
                            <p className="text-foreground/70 italic mt-0.5 pl-3">→ {l.rationale}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {validationEvents.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-xs font-semibold text-foreground/80">
                  5.2 Consultation Events ({validationEvents.length})
                </p>
                <p className="text-xs text-muted-foreground">
                  Documented consultation activities with attached evidence.
                </p>
                <ul className="ml-4 space-y-2">
                  {validationEvents.map((e) => (
                    <li key={e.id} className="text-xs">
                      <p>
                        <span className="font-medium text-foreground">
                          {METHOD_LABELS[e.method] ?? e.method}
                        </span>
                        <span className="text-muted-foreground"> — {fmtDate(e.date_conducted)}</span>
                      </p>
                      <p className="text-foreground/80 italic mt-0.5 pl-3">“{e.summary}”</p>
                      {e.stakeholders.length > 0 && (
                        <p className="pl-3 mt-1 text-foreground/70">
                          <span className="font-medium">Stakeholders:</span>{" "}
                          {e.stakeholders.filter((s) => s.present).length} present of {e.stakeholders.length}
                          {e.stakeholders.some((s) => s.role) && ` · Roles: ${Array.from(new Set(e.stakeholders.map((s) => s.role).filter(Boolean))).join(", ")}`}
                        </p>
                      )}
                      {e.evidence_count > 0 && (
                        <p className="pl-3 text-foreground/70">
                          <span className="font-medium">Evidence:</span>{" "}
                          {e.evidence_count} retained file{e.evidence_count === 1 ? "" : "s"}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </>
        )}
      </section>

      {/* Signature blocks */}
      <section className="mt-12 grid grid-cols-2 gap-12 text-sm">
        <SignatureBlock label="Prepared by" name={proposal.users?.full_name ?? ""} />
        <SignatureBlock label="Evidence reviewed by (PARAYA Researcher)" />
        <SignatureBlock label="Approved by (PARAYA Director)" />
        <SignatureBlock label="Received by (Partner Barangay)" />
      </section>

      <footer className="mt-12 pt-4 border-t border-foreground/20 text-[10px] text-muted-foreground">
        This document was auto-generated by AGAPE. Information herein reflects the proposal record
        at the time of generation. Reference: {proposal.id}.
      </footer>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function SignatureBlock({ label, name = "" }: { label: string; name?: string }) {
  return (
    <div>
      <div className="border-b border-foreground/40 h-10 flex items-end pb-1 text-sm text-foreground font-medium">
        {name}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      <p className="text-xs text-muted-foreground">Date: ___________________</p>
    </div>
  );
}
