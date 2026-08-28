"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clipboard, Crown, Link2, ListChecks, Loader2, MapPin, RefreshCw, Settings2, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { VOLUNTEER_SKILL_CODES } from "@/lib/volunteers/phase4-contracts";

type Match = {
  rank: number; volunteerId: string; name: string; email: string; course: string | null; yearLevel: number | null;
  eligible: boolean; matchedSkillCount: number; requiredSkillCount: number;
  availability: "available" | "unavailable" | "not_recorded";
  withinRadius: boolean | null; distanceBand: string;
};
type Setup = {
  rowVersion: number; requiredSkills: string[]; allowedCourses: string[];
  minimumYearLevel: number | null; maximumYearLevel: number | null; signupDeadline: string | null;
  site: null | { venueName: string; barangayId: string; sitioId: string | null; latitude: string; longitude: string; startsAt: string; endsAt: string; radiusKm: string };
};
type Invitation = { id: string; label: string | null; state: string; expiresAt: string; maxUses: number; useCount: number; rowVersion: number };
type Leader = { volunteerId: string; name: string; course: string | null; yearLevel: number | null };
type WaitlistEntry = {
  id: string; volunteerId: string; name: string; course: string | null; yearLevel: number | null;
  reason: "capacity_full" | "eligibility_review"; state: "pending"; rowVersion: number; createdAt: string;
};

const skillLabel = (value: string) => value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
const distanceLabel: Record<string, string> = {
  under_1_km: "under 1 km", "1_to_3_km": "1–3 km", "3_to_5_km": "3–5 km",
  "5_to_10_km": "5–10 km", over_10_km: "over 10 km", not_available: "not provided",
};

export function ProgramVolunteerMatchingPanel({
  programId, barangayId, enrolledVolunteerIds, onChanged,
}: { programId: string; barangayId: string | null; enrolledVolunteerIds: string[]; onChanged: () => void }) {
  const [enabled, setEnabled] = useState(true);
  const [invitationsEnabled, setInvitationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [leaderVersion, setLeaderVersion] = useState(0);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [updatingLeader, setUpdatingLeader] = useState<string | null>(null);
  const [reviewingWaitlist, setReviewingWaitlist] = useState<string | null>(null);
  const [venue, setVenue] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [radiusKm, setRadiusKm] = useState("5");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [courses, setCourses] = useState("");
  const [minimumYear, setMinimumYear] = useState("");
  const [maximumYear, setMaximumYear] = useState("");
  const [signupDeadline, setSignupDeadline] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteUses, setInviteUses] = useState("1");
  const [inviteExpires, setInviteExpires] = useState(() => {
    const value = new Date(Date.now() + 7 * 86400000 - 60000);
    return value.toISOString().slice(0, 16);
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const setupResponse = await fetch(`/api/v2/programs/${programId}/volunteer-matching`);
      if (setupResponse.status === 404) {
        setEnabled(false);
        return;
      }
      if (!setupResponse.ok) throw new Error("matching setup");
      const setupBody = await setupResponse.json();
      const next = setupBody.data as Setup;
      setSetup(next);
      setRequiredSkills(next.requiredSkills ?? []);
      setCourses((next.allowedCourses ?? []).join(", "));
      setMinimumYear(next.minimumYearLevel?.toString() ?? "");
      setMaximumYear(next.maximumYearLevel?.toString() ?? "");
      setSignupDeadline(next.signupDeadline?.slice(0, 16) ?? "");
      if (!next.site) {
        setMatches([]); setInvitations([]); setLeaders([]); setWaitlist([]);
        return;
      }
      setVenue(next.site.venueName); setLatitude(next.site.latitude); setLongitude(next.site.longitude);
      setStartsAt(next.site.startsAt.slice(0, 16)); setEndsAt(next.site.endsAt.slice(0, 16)); setRadiusKm(next.site.radiusKm);
      const [matchResponse, inviteResponse, leaderResponse, waitlistResponse] = await Promise.all([
        fetch(`/api/v2/programs/${programId}/volunteer-matches`),
        fetch(`/api/v2/programs/${programId}/invitations`),
        fetch(`/api/v2/programs/${programId}/volunteer-leaders`),
        fetch(`/api/v2/programs/${programId}/waitlist`),
      ]);
      if (!matchResponse.ok) throw new Error("volunteer matches");
      setMatches((await matchResponse.json()).data ?? []);
      if (inviteResponse.status === 404) {
        setInvitationsEnabled(false);
      } else if (inviteResponse.ok && leaderResponse.ok && waitlistResponse.ok) {
        setInvitationsEnabled(true);
        setInvitations((await inviteResponse.json()).data ?? []);
        const leaderData = (await leaderResponse.json()).data ?? {};
        setLeaders(leaderData.leaders ?? []);
        setLeaderVersion(leaderData.rowVersion ?? next.rowVersion);
        setWaitlist((await waitlistResponse.json()).data ?? []);
      } else {
        throw new Error("invitation management");
      }
    } catch {
      toast.error("Could not load volunteer matching.");
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { load(); }, [load]);
  if (!enabled) return null;

  function toggleSkill(code: string) {
    setRequiredSkills((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  async function saveSetup() {
    if (!barangayId) return toast.error("The program must have a barangay before matching can be configured.");
    if (![latitude, longitude, radiusKm].every((value) => Number.isFinite(Number(value))) || !startsAt || !endsAt) {
      return toast.error("Enter valid program location and schedule values.");
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/v2/programs/${programId}/volunteer-matching`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: setup?.rowVersion || null,
          requiredSkills,
          allowedCourses: courses.split(",").map((item) => item.trim()).filter(Boolean),
          minimumYearLevel: minimumYear ? Number(minimumYear) : null,
          maximumYearLevel: maximumYear ? Number(maximumYear) : null,
          signupDeadline: signupDeadline ? new Date(signupDeadline).toISOString() : null,
          site: {
            venueName: venue, barangayId, sitioId: null, latitude: Number(latitude), longitude: Number(longitude),
            startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), radiusKm: Number(radiusKm),
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error ?? "Could not save matching setup.");
      toast.success("Volunteer matching setup saved.");
      await load();
    } catch {
      toast.error("Could not save matching setup.");
    } finally {
      setSaving(false);
    }
  }

  async function assign(volunteerId: string) {
    setAssigning(volunteerId);
    try {
      const response = await fetch(`/api/programs/${programId}/signup`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ volunteer_id: volunteerId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error ?? "Could not assign volunteer.");
      toast.success("Volunteer assigned.");
      onChanged();
      await load();
    } catch {
      toast.error("Could not assign volunteer.");
    } finally {
      setAssigning(null);
    }
  }

  async function toggleLeader(volunteerId: string) {
    setUpdatingLeader(volunteerId);
    const current = leaders.map((leader) => leader.volunteerId);
    const volunteerIds = current.includes(volunteerId)
      ? current.filter((id) => id !== volunteerId)
      : [...current, volunteerId];
    try {
      const response = await fetch(`/api/v2/programs/${programId}/volunteer-leaders`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: leaderVersion, volunteerIds }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error ?? "Could not update program leaders.");
      toast.success(current.includes(volunteerId) ? "Program leader removed." : "Program leader assigned.");
      await load();
    } catch {
      toast.error("Could not update program leaders.");
    } finally {
      setUpdatingLeader(null);
    }
  }

  async function createInvite() {
    try {
      const response = await fetch(`/api/v2/programs/${programId}/invitations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: inviteLabel || null, expiresAt: new Date(inviteExpires).toISOString(), maxUses: Number(inviteUses),
          allowedEmailDomain: "dyci.edu.ph", allowExternalEmail: false, externalExceptionReason: null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error ?? "Could not create invitation.");
      await navigator.clipboard.writeText(`${window.location.origin}${body.data.joinPath}`);
      toast.success("Invitation created and copied. This is the only time its link is shown.");
      await load();
    } catch {
      toast.error("Could not create or copy the invitation.");
    }
  }

  async function revoke(invitation: Invitation) {
    try {
      const response = await fetch(`/api/v2/programs/${programId}/invitations/${invitation.id}/revoke`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: invitation.rowVersion, reason: "Revoked from program volunteer management." }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error ?? "Could not revoke invitation.");
      toast.success("Invitation revoked.");
      await load();
    } catch {
      toast.error("Could not revoke invitation.");
    }
  }

  async function reviewWaitlist(entry: WaitlistEntry, action: "approve" | "decline") {
    setReviewingWaitlist(entry.id);
    try {
      const response = await fetch(`/api/v2/programs/${programId}/waitlist/${entry.id}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedVersion: entry.rowVersion, remarks: null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error ?? "Could not review the waitlist request.");
      toast.success(action === "approve" ? "Volunteer approved from waitlist." : "Waitlist request declined.");
      onChanged();
      await load();
    } catch {
      toast.error("Could not review the waitlist request.");
    } finally {
      setReviewingWaitlist(null);
    }
  }

  return <div className="space-y-4">
    <Card className="border-border">
      <CardHeader><CardTitle className="flex items-center gap-2 font-heading text-base"><Settings2 className="h-4 w-4" />Matching setup</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label>Venue</Label><Input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Program venue" /></div>
            <div><Label>Program latitude</Label><Input type="number" step="0.00001" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></div>
            <div><Label>Program longitude</Label><Input type="number" step="0.00001" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></div>
            <div><Label>Starts</Label><Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div>
            <div><Label>Ends</Label><Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div>
            <div><Label>Discovery radius (km)</Label><Input type="number" min="0.5" max="100" step="0.5" value={radiusKm} onChange={(event) => setRadiusKm(event.target.value)} /></div>
            <div className="md:col-span-2"><Label>Allowed courses (comma-separated)</Label><Input value={courses} onChange={(event) => setCourses(event.target.value)} placeholder="BSIT, BSED" /></div>
            <div><Label>Signup deadline</Label><Input type="datetime-local" value={signupDeadline} onChange={(event) => setSignupDeadline(event.target.value)} /></div>
            <div><Label>Minimum year</Label><Input type="number" min="1" max="6" value={minimumYear} onChange={(event) => setMinimumYear(event.target.value)} /></div>
            <div><Label>Maximum year</Label><Input type="number" min="1" max="6" value={maximumYear} onChange={(event) => setMaximumYear(event.target.value)} /></div>
          </div>
          <div><Label>Preferred skills</Label><div className="mt-2 flex flex-wrap gap-1.5">
            {VOLUNTEER_SKILL_CODES.map((code) => <button type="button" key={code} onClick={() => toggleSkill(code)}
              className={`rounded-full border px-2.5 py-1 text-xs ${requiredSkills.includes(code) ? "border-primary bg-primary text-white" : "border-border"}`}>{skillLabel(code)}</button>)}
          </div></div>
          <Button onClick={saveSetup} disabled={saving || !venue || !latitude || !longitude || !startsAt || !endsAt}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save matching setup
          </Button>
        </>}
      </CardContent>
    </Card>

    {setup?.site && <Card className="border-border">
      <CardHeader className="flex-row items-center justify-between"><div><CardTitle className="font-heading text-base">Ranked volunteer matches</CardTitle>
        <p className="text-xs text-muted-foreground">Eligibility → skill match → availability → proximity</p></div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" />Refresh</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {matches.length === 0 ? <p className="text-sm text-muted-foreground">No eligible volunteer profiles are available yet.</p> : matches.map((match) => {
          const enrolled = enrolledVolunteerIds.includes(match.volunteerId);
          const leader = leaders.some((item) => item.volunteerId === match.volunteerId);
          return <div key={match.volunteerId} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">#{match.rank} {match.name}</span>
              <Badge variant="outline" className={match.eligible ? "text-success" : "text-danger"}>{match.eligible ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}{match.eligible ? "Eligible" : "Needs review"}</Badge>
              {leader && <Badge variant="outline"><Crown className="mr-1 h-3 w-3" />Program leader</Badge>}</div>
              <p className="truncate text-xs text-muted-foreground">{match.email} · {match.course ?? "Course not recorded"} · Year {match.yearLevel ?? "—"}</p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs"><span>{match.matchedSkillCount}/{match.requiredSkillCount} skills</span><span>· {match.availability.replace("_", " ")}</span>
                <span>· <MapPin className="inline h-3 w-3" /> {distanceLabel[match.distanceBand] ?? match.distanceBand}</span>
                {match.withinRadius !== null && <span>· {match.withinRadius ? "within radius" : "outside radius"}</span>}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={enrolled || assigning !== null || !match.eligible} onClick={() => assign(match.volunteerId)}>
                {assigning === match.volunteerId ? <Loader2 className="h-4 w-4 animate-spin" /> : enrolled ? "Assigned" : <><UserPlus className="mr-1 h-4 w-4" />Assign</>}
              </Button>
              {invitationsEnabled && enrolled && <Button size="sm" variant="outline" disabled={updatingLeader !== null}
                onClick={() => toggleLeader(match.volunteerId)}>
                {updatingLeader === match.volunteerId ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Crown className="mr-1 h-4 w-4" />{leader ? "Remove leader" : "Make leader"}</>}
              </Button>}
            </div>
          </div>;
        })}
      </CardContent>
    </Card>}

    {setup?.site && invitationsEnabled && <Card className="border-border">
      <CardHeader><CardTitle className="flex items-center gap-2 font-heading text-base"><Link2 className="h-4 w-4" />Secure invitations</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[1fr_190px_110px_auto]">
          <Input placeholder="Invitation label (optional)" value={inviteLabel} onChange={(event) => setInviteLabel(event.target.value)} />
          <Input type="datetime-local" value={inviteExpires} onChange={(event) => setInviteExpires(event.target.value)} />
          <Input type="number" min="1" value={inviteUses} onChange={(event) => setInviteUses(event.target.value)} />
          <Button onClick={createInvite}><Clipboard className="mr-1 h-4 w-4" />Create & copy</Button>
        </div>
        <p className="text-xs text-muted-foreground">Links expire in at most seven days, default to DYCI email, respect remaining program capacity, and can be revoked.</p>
        {invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
          <div><p className="font-medium">{invitation.label || "Program invitation"}</p>
            <p className="text-xs text-muted-foreground">{invitation.useCount}/{invitation.maxUses} uses · expires {new Date(invitation.expiresAt).toLocaleString()} · {invitation.state}</p></div>
          {invitation.state === "active" && <Button size="sm" variant="outline" onClick={() => revoke(invitation)}>Revoke</Button>}
        </div>)}
      </CardContent>
    </Card>}

    {setup?.site && invitationsEnabled && <Card className="border-border">
      <CardHeader><CardTitle className="flex items-center gap-2 font-heading text-base"><ListChecks className="h-4 w-4" />Invitation waitlist</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {waitlist.length === 0 ? <p className="text-sm text-muted-foreground">No pending invitation requests.</p> :
          waitlist.map((entry) => <div key={entry.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">{entry.name}</p>
              <p className="text-xs text-muted-foreground">{entry.course ?? "Course not recorded"} · Year {entry.yearLevel ?? "—"} · {entry.reason.replace("_", " ")}</p></div>
            <div className="flex gap-2">
              <Button size="sm" disabled={reviewingWaitlist !== null} onClick={() => reviewWaitlist(entry, "approve")}>Approve</Button>
              <Button size="sm" variant="outline" disabled={reviewingWaitlist !== null} onClick={() => reviewWaitlist(entry, "decline")}>Decline</Button>
            </div>
          </div>)}
      </CardContent>
    </Card>}
  </div>;
}
