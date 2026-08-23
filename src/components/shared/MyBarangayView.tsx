"use client";

import { useEffect, useState } from "react";
import {
  MapPin, Phone, Mail, User, Users, Home, CalendarDays, Loader2,
  Building2, Clock, Activity, CheckCircle2, History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PartnershipEvent {
  id:         string;
  event_type: string;
  notes:      string | null;
  date:       string;
  created_at: string;
  officer:    { full_name: string } | null;
}

interface BarangayInfo {
  id:                string;
  name:              string;
  municipality:      string;
  province:          string;
  contact_person:    string | null;
  contact_phone:     string | null;
  contact_email:     string | null;
  total_population:  number | null;
  total_households:  number | null;
  partnership_start: string | null;
  is_active:         boolean;
  partnership_history: PartnershipEvent[] | null;
}

interface ProgramRow {
  id:         string;
  title:      string;
  status:     string;
  start_date: string | null;
  end_date:   string | null;
}

interface ApiResponse {
  data: {
    barangay:   BarangayInfo;
    programs:   ProgramRow[];
    viewerRole: string;
  } | null;
  error?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROGRAM_BADGE: Record<string, string> = {
  active:    "bg-success/10 text-success border-success/20 border",
  planning:  "bg-info/10 text-info border-info/20 border",
  completed: "bg-muted text-muted-foreground border",
  cancelled: "bg-danger/10 text-danger border-danger/20 border",
};

const EVENT_ICON_COLOR: Record<string, string> = {
  "Partnership Started":     "text-success",
  "Partnership Deactivated": "text-danger",
  "Reactivated":             "text-info",
  "Profile Updated":         "text-warning",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MyBarangayView({ emptyMessage }: { emptyMessage: string }) {
  const [data, setData]       = useState<ApiResponse["data"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/my-barangay")
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (j.error || !j.data) setError(j.error ?? "No data");
        else setData(j.data);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading barangay info…
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-16 text-center text-muted-foreground space-y-2">
          <MapPin className="w-10 h-10 mx-auto opacity-30" />
          <p className="text-sm">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const { barangay, programs } = data;
  const history = (barangay.partnership_history ?? []).slice().sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-6">

      {/* Header card */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="font-heading text-xl">{barangay.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {barangay.municipality}, {barangay.province}
                </p>
              </div>
            </div>
            <Badge
              className={
                barangay.is_active
                  ? "bg-success/10 text-success border-success/20 border"
                  : "bg-muted text-muted-foreground border"
              }
            >
              {barangay.is_active ? "Active Partnership" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow icon={User}         label="Contact Person" value={barangay.contact_person} />
            <InfoRow icon={Phone}        label="Phone"          value={barangay.contact_phone} />
            <InfoRow icon={Mail}         label="Email"          value={barangay.contact_email} />
            <InfoRow icon={CalendarDays} label="Partner since"  value={fmtDate(barangay.partnership_start)} />
            <InfoRow icon={Users}        label="Population"     value={barangay.total_population?.toLocaleString() ?? null} />
            <InfoRow icon={Home}         label="Households"     value={barangay.total_households?.toLocaleString() ?? null} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Programs in this barangay */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Programs in this Barangay
            </CardTitle>
          </CardHeader>
          <CardContent>
            {programs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No programs hosted here yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {programs.map((p) => (
                  <li key={p.id} className="p-3 rounded-lg bg-surface-alt/50 border border-border/60 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDate(p.start_date)}{p.end_date ? ` – ${fmtDate(p.end_date)}` : ""}
                      </p>
                    </div>
                    <Badge className={`${PROGRAM_BADGE[p.status] ?? "bg-muted text-muted-foreground border"} text-[10px] capitalize flex-shrink-0`}>
                      {p.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Partnership history timeline */}
        <Card className="border-border shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Partnership History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No history entries yet.
              </div>
            ) : (
              <ol className="relative border-l-2 border-border/60 pl-5 space-y-4">
                {history.map((evt) => (
                  <li key={evt.id} className="relative">
                    <span className="absolute -left-[1.55rem] top-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${EVENT_ICON_COLOR[evt.event_type] ?? "text-muted-foreground"}`} />
                      <p className="text-sm font-medium text-foreground">{evt.event_type}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(evt.date)}{evt.officer?.full_name ? ` · ${evt.officer.full_name}` : ""}
                    </p>
                    {evt.notes && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{evt.notes}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon, label, value,
}: { icon: React.ElementType; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-md bg-surface-alt flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value ?? "—"}</p>
      </div>
    </div>
  );
}
