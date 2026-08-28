"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clipboard, Crown, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LeaderProgram = {
  id: string;
  title: string;
  status: string;
  barangay: string | null;
  signupDeadline: string | null;
  maxVolunteers: number | null;
  signupCount: number;
  remainingCapacity: number | null;
  activeInvitationCount: number;
};

type Invitation = {
  id: string;
  label: string | null;
  state: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  rowVersion: number;
};

function defaultExpiry(deadline: string | null) {
  const sevenDays = Date.now() + (7 * 24 * 60 * 60 * 1000) - 60_000;
  const deadlineTime = deadline ? new Date(deadline).getTime() : Number.POSITIVE_INFINITY;
  return new Date(Math.min(sevenDays, deadlineTime)).toISOString().slice(0, 16);
}

function LeaderProgramInvitations({ program }: { program: LeaderProgram }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(() => program.remainingCapacity == null ? "1" : String(Math.max(1, program.remainingCapacity)));
  const [expiresAt, setExpiresAt] = useState(() => defaultExpiry(program.signupDeadline));
  const [newLink, setNewLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v2/programs/${program.id}/invitations`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load invitations.");
      setInvitations(body.data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load invitations.");
    } finally {
      setLoading(false);
    }
  }, [program.id]);

  useEffect(() => { void load(); }, [load]);

  async function createInvitation() {
    setActing(true);
    setNewLink(null);
    try {
      const response = await fetch(`/api/v2/programs/${program.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || null,
          expiresAt: new Date(expiresAt).toISOString(),
          maxUses: Number(maxUses),
          allowedEmailDomain: "dyci.edu.ph",
          allowExternalEmail: false,
          externalExceptionReason: null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not create invitation.");
      const link = `${window.location.origin}${body.data.joinPath}`;
      setNewLink(link);
      try {
        await navigator.clipboard.writeText(link);
        toast.success("Invitation created and copied.");
      } catch {
        toast.success("Invitation created. Copy the one-time link below.");
      }
      setLabel("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create invitation.");
    } finally {
      setActing(false);
    }
  }

  async function revoke(invitation: Invitation) {
    setActing(true);
    try {
      const response = await fetch(`/api/v2/programs/${program.id}/invitations/${invitation.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: invitation.rowVersion,
          reason: "Revoked by the designated volunteer program leader.",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not revoke invitation.");
      toast.success("Invitation revoked.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke invitation.");
    } finally {
      setActing(false);
    }
  }

  const full = program.remainingCapacity === 0;
  return <Card className="border-border">
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="font-heading text-base">{program.title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{program.barangay ?? "Barangay not recorded"} · {program.signupCount}{program.maxVolunteers ? `/${program.maxVolunteers}` : ""} volunteers</p>
        </div>
        <div className="flex gap-1.5"><Badge variant="outline">{program.status}</Badge><Badge variant="outline">{program.activeInvitationCount} active links</Badge></div>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_180px_100px_auto]">
        <Input aria-label="Invitation label" placeholder="Invitation label (optional)" value={label} onChange={(event) => setLabel(event.target.value)} />
        <Input aria-label="Invitation expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        <Input aria-label="Maximum uses" type="number" min="1" max={program.remainingCapacity ?? 10000} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
        <Button onClick={createInvitation} disabled={acting || full || !expiresAt || Number(maxUses) < 1}>
          {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Clipboard className="mr-1 h-4 w-4" />Create link</>}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">DYCI email only. The link expires within seven days and cannot exceed remaining capacity.</p>
      {full && <p className="text-sm text-danger">This program is full. Revoke unused links or ask an officer to adjust capacity.</p>}
      {newLink && <div className="rounded-lg border border-success/30 bg-success/5 p-3">
        <p className="text-xs font-medium text-success">One-time invitation link</p>
        <div className="mt-1 flex gap-2"><Input readOnly value={newLink} aria-label="New invitation link" /><Button variant="outline" onClick={() => navigator.clipboard.writeText(newLink).then(() => toast.success("Link copied."))}>Copy</Button></div>
      </div>}
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : invitations.length === 0 ?
        <p className="text-sm text-muted-foreground">No invitation links have been created.</p> :
        invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-medium">{invitation.label || "Program invitation"}</p>
            <p className="text-xs text-muted-foreground">{invitation.useCount}/{invitation.maxUses} uses · expires {new Date(invitation.expiresAt).toLocaleString()} · {invitation.state}</p></div>
          {invitation.state === "active" && <Button size="sm" variant="outline" disabled={acting} onClick={() => revoke(invitation)}>Revoke</Button>}
        </div>)}
    </CardContent>
  </Card>;
}

export function VolunteerLeaderInvitationPanel() {
  const [programs, setPrograms] = useState<LeaderProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v2/volunteers/leader-programs");
      if (response.status === 404) {
        setAvailable(false);
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load leader programs.");
      setAvailable(true);
      setPrograms(body.data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load leader programs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const activePrograms = useMemo(() => programs.filter((program) => ["planning", "upcoming", "active"].includes(program.status)), [programs]);

  if (!available || (!loading && activePrograms.length === 0)) return null;
  return <section className="space-y-3" aria-labelledby="leader-invitations-heading">
    <div className="flex items-center justify-between gap-3">
      <div><h2 id="leader-invitations-heading" className="flex items-center gap-2 font-heading text-lg"><Crown className="h-5 w-5 text-primary" />Program leader invitations</h2>
        <p className="text-sm text-muted-foreground">Create and revoke secure links only for programs where an officer designated you as leader.</p></div>
      <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
    </div>
    {loading ? <Card><CardContent className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></CardContent></Card> :
      <div className="space-y-3">{activePrograms.map((program) => <LeaderProgramInvitations key={program.id} program={program} />)}</div>}
  </section>;
}
