"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Search, Plus, MoreHorizontal, Pencil, PowerOff, Loader2,
  MapPin, Phone, Users, Building2, CalendarDays, Map, CheckCircle2,
} from "lucide-react";
import { PH_PROVINCES, PH_MUNICIPALITIES, PH_BARANGAYS } from "@/lib/ph-data";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import type { MapBarangay } from "@/components/maps/BarangayMap";

// Load Leaflet map only on the client (no SSR)
const BarangayMap = dynamic(() => import("@/components/maps/BarangayMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-surface-alt rounded-xl border border-border" style={{ height: 420 }}>
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Barangay {
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
  latitude:          number | null;
  longitude:         number | null;
  created_at:        string;
  updated_at:        string;
}

// ─── Form schema ────────────────────────────────────────────────────────────────

const barangaySchema = z.object({
  name:              z.string().min(1, "Barangay name is required"),
  municipality:      z.string().min(1, "Municipality is required"),
  province:          z.string().min(1, "Province is required"),
  contact_person:    z.string().optional(),
  contact_phone:     z.string().optional(),
  contact_email:     z.string().email("Enter a valid email").optional().or(z.literal("")),
  total_population:  z.string().optional(),
  total_households:  z.string().optional(),
  partnership_start: z.string().optional(),
  latitude:          z.string().optional(),
  longitude:         z.string().optional(),
});
type BarangayForm = z.infer<typeof barangaySchema>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toMapBarangay(b: Barangay): MapBarangay {
  return {
    id: b.id, name: b.name, municipality: b.municipality, province: b.province,
    contact_person: b.contact_person, contact_phone: b.contact_phone,
    partnership_start: b.partnership_start, is_active: b.is_active,
    latitude: b.latitude, longitude: b.longitude,
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PartnershipManagementPage() {
  const [barangays, setBarangays]   = useState<Barangay[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [actionId, setActionId]     = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<"all" | "active" | "inactive">("all");
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [editTarget, setEditTarget]       = useState<Barangay | null>(null);
  const [mapFilter, setMapFilter]         = useState<"all" | "active">("active");
  const [coordAutoFilled, setCoordAutoFilled] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors } } = useForm<BarangayForm>({
    resolver: zodResolver(barangaySchema),
    defaultValues: { municipality: "Bocaue", province: "Bulacan" },
  });

  const watchedProvince     = watch("province");
  const watchedMunicipality = watch("municipality");

  const municipalityList = useMemo(
    () => (watchedProvince ? (PH_MUNICIPALITIES[watchedProvince] ?? []) : []),
    [watchedProvince]
  );
  const barangayList = useMemo(
    () => (watchedMunicipality ? (PH_BARANGAYS[watchedMunicipality] ?? []) : []),
    [watchedMunicipality]
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/partnerships");
    if (res.ok) {
      const json = await res.json();
      setBarangays(json.data ?? []);
    } else {
      toast.error("Failed to load barangays.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  // ── Derived data ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() =>
    barangays.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        b.name.toLowerCase().includes(q) ||
        b.municipality.toLowerCase().includes(q) ||
        (b.contact_person ?? "").toLowerCase().includes(q);
      const matchFilter =
        filter === "all" ||
        (filter === "active" && b.is_active) ||
        (filter === "inactive" && !b.is_active);
      return matchSearch && matchFilter;
    }), [barangays, search, filter]);

  const counts = useMemo(() => ({
    total:    barangays.length,
    active:   barangays.filter((b) => b.is_active).length,
    inactive: barangays.filter((b) => !b.is_active).length,
  }), [barangays]);

  const mapData = useMemo(() =>
    barangays
      .filter((b) => mapFilter === "all" || b.is_active)
      .map(toMapBarangay),
    [barangays, mapFilter]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditTarget(null);
    setCoordAutoFilled(false);
    reset({ municipality: "Bocaue", province: "Bulacan" });
    setSheetOpen(true);
  }

  function openEdit(b: Barangay) {
    setEditTarget(b);
    setCoordAutoFilled(false);
    reset({
      name:              b.name,
      municipality:      b.municipality,
      province:          b.province,
      contact_person:    b.contact_person ?? "",
      contact_phone:     b.contact_phone ?? "",
      contact_email:     b.contact_email ?? "",
      total_population:  b.total_population != null ? String(b.total_population) : "",
      total_households:  b.total_households != null ? String(b.total_households) : "",
      partnership_start: b.partnership_start ?? "",
      latitude:          b.latitude != null ? String(b.latitude) : "",
      longitude:         b.longitude != null ? String(b.longitude) : "",
    });
    setSheetOpen(true);
  }

  // ── Cascade handlers ──────────────────────────────────────────────────────────

  function onProvinceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setValue("province", e.target.value, { shouldValidate: true });
    setValue("municipality", "");
    setValue("name", "");
    setValue("latitude", "");
    setValue("longitude", "");
    setCoordAutoFilled(false);
  }

  function onMunicipalityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setValue("municipality", e.target.value, { shouldValidate: true });
    setValue("name", "");
    setValue("latitude", "");
    setValue("longitude", "");
    setCoordAutoFilled(false);
  }

  function onBarangayChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const brgyName = e.target.value;
    setValue("name", brgyName, { shouldValidate: true });
    const municipality = getValues("municipality");
    const found = (PH_BARANGAYS[municipality] ?? []).find((b) => b.name === brgyName);
    if (found?.lat !== undefined && found?.lng !== undefined) {
      setValue("latitude",  String(found.lat));
      setValue("longitude", String(found.lng));
      setCoordAutoFilled(true);
    } else {
      setValue("latitude", "");
      setValue("longitude", "");
      setCoordAutoFilled(false);
    }
  }

  async function onSubmit(data: BarangayForm) {
    setSaving(true);
    const payload = {
      ...data,
      total_population:  data.total_population ? parseInt(data.total_population, 10) : null,
      total_households:  data.total_households ? parseInt(data.total_households, 10) : null,
      contact_email:     data.contact_email || null,
      partnership_start: data.partnership_start || null,
      latitude:          data.latitude ? parseFloat(data.latitude) : null,
      longitude:         data.longitude ? parseFloat(data.longitude) : null,
    };

    const url    = editTarget ? `/api/partnerships/${editTarget.id}` : "/api/partnerships";
    const method = editTarget ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json();
      if (editTarget) {
        setBarangays((prev) => prev.map((b) => b.id === editTarget.id ? json.data : b));
        toast.success("Barangay updated.");
      } else {
        setBarangays((prev) => [json.data, ...prev]);
        toast.success("Barangay added to directory.");
      }
      setSheetOpen(false);
    } else {
      toast.error(editTarget ? "Failed to update barangay." : "Failed to add barangay.");
    }
    setSaving(false);
  }

  async function deactivate(b: Barangay) {
    setActionId(b.id);
    const res = await fetch(`/api/partnerships/${b.id}`, { method: "DELETE" });
    if (res.ok) {
      setBarangays((prev) => prev.map((x) => x.id === b.id ? { ...x, is_active: false } : x));
      toast.warning(`${b.name} deactivated.`);
    } else {
      toast.error("Action failed.");
    }
    setActionId(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Barangays", value: counts.total,    accent: "border-l-primary" },
          { label: "Active Partners", value: counts.active,   accent: "border-l-success" },
          { label: "Inactive",        value: counts.inactive, accent: "border-l-danger"  },
        ].map((c) => (
          <Card key={c.label} className={`border-border shadow-card border-l-4 ${c.accent}`}>
            <CardContent className="px-4 py-2.5">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold font-heading text-foreground mt-0.5">
                {loading ? "—" : c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Map */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Map className="w-5 h-5 text-primary" /> Partner Barangay Map
            </CardTitle>
            <div className="flex gap-1 p-1 bg-surface-alt rounded-lg border border-border text-xs">
              {(["active", "all"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setMapFilter(v)}
                  className={`px-3 py-1 rounded-md font-medium transition-all capitalize ${
                    mapFilter === v
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "active" ? "Active only" : "All"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click a marker to view barangay details. Set coordinates via Edit to place a barangay on the map.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center bg-surface-alt rounded-xl border border-border" style={{ height: 420 }}>
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <BarangayMap barangays={mapData} height="420px" />
          )}
        </CardContent>
      </Card>

      {/* Directory table */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="font-heading text-lg">Barangay Directory</CardTitle>
            <Button onClick={openAdd} className="bg-primary hover:bg-primary-dark text-white gap-2 self-start sm:self-auto">
              <Plus className="w-4 h-4" /> Add Barangay
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name, municipality, or contact…"
                className="pl-9 focus-visible:ring-primary/30"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Barangay</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Contact Person</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">Partnership Since</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading directory…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-muted-foreground">
                      {barangays.length === 0
                        ? "No barangays added yet. Click \"Add Barangay\" to get started."
                        : "No barangays match your search."}
                    </td>
                  </tr>
                ) : filtered.map((b, i) => (
                  <tr key={b.id} className={`border-b border-border/60 transition-colors hover:bg-surface-alt/40 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-start gap-2">
                        <div>
                          <p className="font-medium text-foreground">{b.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            {b.municipality}, {b.province}
                          </p>
                        </div>
                        {b.latitude && b.longitude && (
                          <span title="Has map coordinates" className="mt-0.5">
                            <Map className="w-3 h-3 text-primary/50" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {b.contact_person ? (
                        <div>
                          <p className="text-foreground">{b.contact_person}</p>
                          {b.contact_phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" />{b.contact_phone}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">
                      {formatDate(b.partnership_start)}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={b.is_active
                        ? "bg-success/10 text-success border-success/20 border"
                        : "bg-danger/10 text-danger border-danger/20 border"
                      }>
                        {b.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={actionId === b.id}
                          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {actionId === b.id
                            ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            : <MoreHorizontal className="w-4 h-4 text-muted-foreground" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openEdit(b)}>
                              <Pencil className="w-3.5 h-3.5" /> Edit Details
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          {b.is_active && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer text-danger"
                                  onClick={() => deactivate(b)}
                                >
                                  <PowerOff className="w-3.5 h-3.5" /> Deactivate
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
            Showing {filtered.length} of {barangays.length} barangays
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
            <SheetTitle className="font-heading text-xl">
              {editTarget ? "Edit Barangay" : "Add Barangay"}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Location — cascading selects */}
              <div className="space-y-4">
                <p className="text-muted-foreground font-medium flex items-center gap-1.5 text-sm">
                  <Building2 className="w-3.5 h-3.5" /> Location
                </p>

                {/* Province */}
                <div className="space-y-1.5">
                  <Label htmlFor="province">Province <span className="text-danger">*</span></Label>
                  <select
                    id="province"
                    value={watchedProvince}
                    onChange={onProvinceChange}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                  >
                    <option value="">Select province…</option>
                    {PH_PROVINCES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {errors.province && <p className="text-xs text-danger">{errors.province.message}</p>}
                </div>

                {/* Municipality */}
                <div className="space-y-1.5">
                  <Label htmlFor="municipality">Municipality / City <span className="text-danger">*</span></Label>
                  {municipalityList.length > 0 ? (
                    <select
                      id="municipality"
                      value={watchedMunicipality}
                      onChange={onMunicipalityChange}
                      disabled={!watchedProvince}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none disabled:opacity-50"
                    >
                      <option value="">Select municipality…</option>
                      {municipalityList.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="municipality"
                      placeholder="Enter municipality / city"
                      className="focus-visible:ring-primary/30"
                      {...register("municipality")}
                    />
                  )}
                  {errors.municipality && <p className="text-xs text-danger">{errors.municipality.message}</p>}
                </div>

                {/* Barangay name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">Barangay name <span className="text-danger">*</span></Label>
                  {barangayList.length > 0 ? (
                    <select
                      id="name"
                      value={watch("name")}
                      onChange={onBarangayChange}
                      disabled={!watchedMunicipality}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none disabled:opacity-50"
                    >
                      <option value="">Select barangay…</option>
                      {barangayList.map((b) => (
                        <option key={b.name} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="name"
                      placeholder="e.g. Barangay Sta. Ana"
                      className="focus-visible:ring-primary/30"
                      {...register("name")}
                    />
                  )}
                  {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
                </div>
              </div>

              {/* Map Coordinates — auto or manual */}
              <div className="space-y-4 pt-1">
                <p className="text-muted-foreground font-medium flex items-center gap-1.5 text-sm">
                  <Map className="w-3.5 h-3.5" /> Map Coordinates
                  {coordAutoFilled ? (
                    <span className="flex items-center gap-1 text-xs font-normal text-success">
                      <CheckCircle2 className="w-3 h-3" /> Auto-filled
                    </span>
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude" type="number" step="any"
                      placeholder="e.g. 14.7975"
                      className="focus-visible:ring-primary/30"
                      {...register("latitude")}
                      onChange={(e) => { register("latitude").onChange(e); setCoordAutoFilled(false); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude" type="number" step="any"
                      placeholder="e.g. 120.9281"
                      className="focus-visible:ring-primary/30"
                      {...register("longitude")}
                      onChange={(e) => { register("longitude").onChange(e); setCoordAutoFilled(false); }}
                    />
                  </div>
                </div>
                {!coordAutoFilled && (
                  <p className="text-xs text-muted-foreground">
                    Coordinates are auto-filled for known barangays. For others, right-click on{" "}
                    <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2">Google Maps</a>{" "}
                    → Copy coordinates.
                  </p>
                )}
              </div>

              {/* Contact */}
              <div className="space-y-4 pt-1">
                <p className="text-muted-foreground font-medium flex items-center gap-1.5 text-sm">
                  <Phone className="w-3.5 h-3.5" /> Contact Information
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="contact_person">Contact person</Label>
                  <Input id="contact_person" placeholder="Full name of barangay contact" className="focus-visible:ring-primary/30" {...register("contact_person")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact_phone">Phone</Label>
                    <Input id="contact_phone" type="tel" placeholder="+63 900 000 0000" className="focus-visible:ring-primary/30" {...register("contact_phone")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact_email">Email</Label>
                    <Input id="contact_email" type="email" placeholder="barangay@email.com" className="focus-visible:ring-primary/30" {...register("contact_email")} />
                    {errors.contact_email && <p className="text-xs text-danger">{errors.contact_email.message}</p>}
                  </div>
                </div>
              </div>

              {/* Demographics */}
              <div className="space-y-4 pt-1">
                <p className="text-muted-foreground font-medium flex items-center gap-1.5 text-sm">
                  <Users className="w-3.5 h-3.5" /> Demographics
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="total_population">Total population</Label>
                    <Input id="total_population" type="number" min="0" placeholder="0" className="focus-visible:ring-primary/30" {...register("total_population")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="total_households">Total households</Label>
                    <Input id="total_households" type="number" min="0" placeholder="0" className="focus-visible:ring-primary/30" {...register("total_households")} />
                  </div>
                </div>
              </div>

              {/* Partnership */}
              <div className="space-y-4 pt-1">
                <p className="text-muted-foreground font-medium flex items-center gap-1.5 text-sm">
                  <CalendarDays className="w-3.5 h-3.5" /> Partnership
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="partnership_start">Partnership start date</Label>
                  <Input id="partnership_start" type="date" className="focus-visible:ring-primary/30" {...register("partnership_start")} />
                </div>
              </div>

            </div>

            {/* Sticky footer */}
            <div className="shrink-0 border-t border-border px-6 py-4 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {editTarget ? "Save Changes" : "Add Barangay"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

    </div>
  );
}
