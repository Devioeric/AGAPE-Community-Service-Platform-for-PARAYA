"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ProfilingPrivacyPanel({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [notice, setNotice] = useState({ version: "", text: "", controller: "", contact: "", retention: "", effectiveFrom: "" });
  const [saving, setSaving] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/profiling/privacy/notice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: notice.version, notice_text: notice.text, controller_name: notice.controller, privacy_contact: notice.contact, retention_summary: notice.retention, effective_from: notice.effectiveFrom }) });
      if (!response.ok) throw new Error("Unable to create privacy notice. Check the fields and your authorization.");
      toast.success("Privacy notice version created");
      await onRefresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save notice"); }
    finally { setSaving(false); }
  }
  return <Card className="gap-0 py-0" data-testid="profiling-privacy-configuration"><details className="group/privacy">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
      <Settings2 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Privacy notice setup</span><span className="mt-1 block text-xs text-muted-foreground">Manage approved notice versions and retention information.</span></span>
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/privacy:rotate-180" />
    </summary>
    <CardContent className="border-t border-border px-5 py-5">
    <form onSubmit={save} className="grid max-w-3xl gap-4 sm:grid-cols-2 [&_label]:space-y-1.5">
      <label className="text-sm">Notice version<Input required maxLength={40} value={notice.version} onChange={e => setNotice(v => ({ ...v, version: e.target.value }))} /></label>
      <label className="text-sm">Effective date<Input required type="date" value={notice.effectiveFrom} onChange={e => setNotice(v => ({ ...v, effectiveFrom: e.target.value }))} /></label>
      <label className="text-sm">Data controller<Input required minLength={2} maxLength={200} value={notice.controller} onChange={e => setNotice(v => ({ ...v, controller: e.target.value }))} /></label>
      <label className="text-sm">Privacy contact<Input required minLength={2} maxLength={200} value={notice.contact} onChange={e => setNotice(v => ({ ...v, contact: e.target.value }))} /></label>
      <label className="text-sm sm:col-span-2">Approved notice text<Textarea required minLength={20} maxLength={20000} value={notice.text} onChange={e => setNotice(v => ({ ...v, text: e.target.value }))} /></label>
      <label className="text-sm sm:col-span-2">Retention summary<Textarea required minLength={2} maxLength={1000} value={notice.retention} onChange={e => setNotice(v => ({ ...v, retention: e.target.value }))} /></label>
      <div className="sm:col-span-2"><Button type="submit" className="w-full sm:w-auto" disabled={saving}>{saving ? "Saving…" : "Create approved notice version"}</Button></div>
    </form>
  </CardContent></details></Card>;
}
