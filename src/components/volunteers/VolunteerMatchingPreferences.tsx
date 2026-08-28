"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VOLUNTEER_SKILL_CODES } from "@/lib/volunteers/phase4-contracts";

type Window = { dayOfWeek: number; startTime: string; endTime: string };
type Preferences = {
  rowVersion: number;
  skills: string[];
  availability: Window[];
  location: {
    consentStatus: string;
    hasApproximatePoint: boolean;
    approximateLatitude: string | null;
    approximateLongitude: string | null;
  };
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const label = (value: string) => value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");

export function VolunteerMatchingPreferences() {
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);
  const [consent, setConsent] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  useEffect(() => {
    fetch("/api/v2/volunteers/preferences").then(async (response) => {
      if (response.status === 404) return setAvailable(false);
      if (!response.ok) throw new Error("Could not load matching preferences.");
      const { data } = await response.json() as { data: Preferences };
      setRowVersion(data.rowVersion || null);
      setSkills(data.skills ?? []);
      setWindows(data.availability ?? []);
      setConsent(data.location?.consentStatus === "active");
      setLatitude(data.location?.approximateLatitude ?? "");
      setLongitude(data.location?.approximateLongitude ?? "");
    }).catch((reason) => toast.error(reason.message)).finally(() => setLoading(false));
  }, []);

  if (!available) return null;

  function toggleSkill(code: string) {
    setSkills((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/v2/volunteers/preferences", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: rowVersion,
          skills,
          availability: windows,
          location: {
            consent,
            barangayId: null,
            sitioId: null,
            approximateLatitude: consent && latitude ? Number(latitude) : null,
            approximateLongitude: consent && longitude ? Number(longitude) : null,
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error ?? "Could not save matching preferences.");
      setRowVersion(body.data.rowVersion);
      setLatitude(body.data.location?.approximateLatitude ?? "");
      setLongitude(body.data.location?.approximateLongitude ?? "");
      toast.success("Volunteer matching preferences saved.");
    } catch {
      toast.error("Could not save matching preferences.");
    } finally {
      setSaving(false);
    }
  }

  return <Card className="border-border shadow-card">
    <CardHeader>
      <CardTitle className="font-heading">Volunteer matching preferences</CardTitle>
      <p className="text-sm text-muted-foreground">Skills and availability are considered before proximity. Location is optional and never shown as a map point to officers.</p>
    </CardHeader>
    <CardContent className="space-y-6">
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <>
        <div className="space-y-2">
          <Label>Skills</Label>
          <div className="flex flex-wrap gap-2">
            {VOLUNTEER_SKILL_CODES.map((code) => <button key={code} type="button" onClick={() => toggleSkill(code)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${skills.includes(code) ? "border-primary bg-primary text-white" : "border-border hover:bg-muted"}`}>
              {label(code)}
            </button>)}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between"><Label>Available times</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => setWindows([...windows, { dayOfWeek: 1, startTime: "08:00", endTime: "17:00" }])}>
              <Plus className="mr-1 h-3.5 w-3.5" />Add
            </Button>
          </div>
          {windows.length === 0 && <p className="text-sm text-muted-foreground">No availability recorded yet.</p>}
          {windows.map((item, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
            <select className="rounded-lg border border-border bg-background px-2 text-sm" value={item.dayOfWeek}
              onChange={(event) => setWindows(windows.map((value, i) => i === index ? { ...value, dayOfWeek: Number(event.target.value) } : value))}>
              {DAYS.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}
            </select>
            <Input type="time" value={item.startTime} onChange={(event) => setWindows(windows.map((value, i) => i === index ? { ...value, startTime: event.target.value } : value))} />
            <Input type="time" value={item.endTime} onChange={(event) => setWindows(windows.map((value, i) => i === index ? { ...value, endTime: event.target.value } : value))} />
            <Button type="button" size="icon" variant="ghost" onClick={() => setWindows(windows.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
          </div>)}
        </div>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span><span className="flex items-center gap-1 font-medium"><MapPin className="h-4 w-4" />Use an approximate base location</span>
              <span className="block text-xs text-muted-foreground">Optional consent. Coordinates are rounded to roughly neighborhood precision and may be withdrawn at any time.</span>
            </span>
          </label>
          {consent && <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="approx-lat">Approximate latitude</Label><Input id="approx-lat" type="number" step="0.01" min="-90" max="90" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></div>
            <div><Label htmlFor="approx-lon">Approximate longitude</Label><Input id="approx-lon" type="number" step="0.01" min="-180" max="180" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></div>
          </div>}
        </div>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save matching preferences</Button>
      </>}
    </CardContent>
  </Card>;
}
