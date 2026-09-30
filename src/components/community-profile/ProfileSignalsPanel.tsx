"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Lightbulb, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileSignal } from "@/lib/community-profile/need-signals";

type Group = { barangay: { id: string; name: string }; profile: { id: string; updated_at: string; coverage: string | null }; signals: ProfileSignal[] };

const PRIORITY_STYLE: Record<ProfileSignal["priority"], string> = {
  high: "border-danger/30 bg-danger/10 text-danger",
  medium: "border-warning/30 bg-warning/10 text-warning",
};

/** Rule-based need signals from community profiles; an Officer accepts (pending need) or dismisses with a reason. */
export function ProfileSignalsPanel({ onNeedCreated }: { onNeedCreated: () => void }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ group: Group; signal: ProfileSignal } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/community-profiles/signals", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.data)) throw new Error("Community profile signals are unavailable");
      setGroups(payload.data); setError(null);
    } catch { setError("Community profile signals are unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(group: Group, signal: ProfileSignal, decision: "accept" | "dismiss", dismissReason?: string) {
    setBusy(`${group.barangay.id}:${signal.code}`);
    try {
      const response = await fetch("/api/community-profiles/signals/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ barangay_id: group.barangay.id, rule_code: signal.code, decision, reason: dismissReason, expected_profile_updated_at: group.profile.updated_at }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? (response.status === 409 ? "This signal changed. Reloading." : "The decision could not be recorded."));
        if (response.status === 409) void load();
        return;
      }
      if (decision === "accept") { toast.success("Added to Community Needs for review"); onNeedCreated(); }
      else toast.success("Signal dismissed");
      setTarget(null); setReason(""); void load();
    } catch {
      toast.error("The decision could not be recorded. Check your connection and try again.");
    } finally { setBusy(null); }
  }

  return (
    <>
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-base">
            <Lightbulb className="h-4 w-4 text-warning" aria-hidden="true" />Suggested from community profiles
          </CardTitle>
          <p className="text-xs text-muted-foreground">Rule-based signals from each barangay&apos;s community profile. Nothing is created until you accept.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading community-profile signals…</p>
            : error ? (
              <div role="alert" className="text-sm">
                <p>{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>Retry signals</Button>
              </div>
            ) : groups.length === 0 ? <p className="text-sm text-muted-foreground">No community-profile signals need a decision.</p>
              : groups.map((group) => (
                <div key={group.barangay.id} className="space-y-2">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="font-semibold text-foreground">{group.barangay.name}</span>
                    {group.profile.coverage && <span className="text-xs text-muted-foreground">{group.profile.coverage}</span>}
                  </p>
                  {group.signals.map((signal) => {
                    const working = busy === `${group.barangay.id}:${signal.code}`;
                    return (
                      // Stacked so the panel also fits the narrow column beside the needs list.
                      <div key={signal.code} className="space-y-2.5 rounded-lg border border-border bg-background p-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium text-foreground">{signal.title}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLE[signal.priority]}`}>{signal.priority === "high" ? "High" : "Medium"} priority</span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{signal.description}</p>
                          <p className="mt-1 text-xs capitalize text-muted-foreground">Category: {signal.category}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => void decide(group, signal, "accept")} disabled={busy !== null}>
                            {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Accept as need
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setTarget({ group, signal }); setReason(""); }} disabled={busy !== null}>Dismiss</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Dismiss signal</DialogTitle>
            {target && <DialogDescription>{target.signal.title} in {target.group.barangay.name}. It stays hidden until the profile is edited.</DialogDescription>}
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="signal-dismiss-reason">Reason <span className="text-danger">*</span></Label>
            <Textarea id="signal-dismiss-reason" rows={3} minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this signal is not actionable now" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy !== null}>Cancel</Button>
            <Button onClick={() => target && void decide(target.group, target.signal, "dismiss", reason.trim())} disabled={busy !== null || reason.trim().length < 3} className="bg-danger text-white hover:bg-danger/90">Dismiss signal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
