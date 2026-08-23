"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Search, Loader2, Plus, MoreHorizontal, Package,
  Gift, TrendingDown, Calendar, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Donation {
  id: string;
  donor_name: string;
  donor_type: string;
  item_type: string;
  quantity: number;
  unit: string;
  received_date: string;
  program_id: string | null;
  barangay_id: string | null;
  notes: string | null;
  programs: { title: string } | null;
  barangays: { name: string } | null;
  donation_distributions: { quantity: number }[];
}

interface Distribution {
  id: string;
  distributed_to: string;
  quantity: number;
  distribution_date: string;
  distribution_type: string;
  notes: string | null;
}

interface DonationDetail extends Donation {
  donation_distributions: Distribution[];
}

interface Barangay { id: string; name: string; }
interface Program  { id: string; title: string; }

// ─── Schemas ───────────────────────────────────────────────────────────────────

const donationSchema = z.object({
  donor_name:    z.string().min(2, "Donor name required"),
  donor_type:    z.string(),
  item_type:     z.string().min(2, "Item type required"),
  quantity:      z.string().min(1, "Quantity required"),
  unit:          z.string(),
  received_date: z.string().min(1, "Date required"),
  program_id:    z.string().optional(),
  barangay_id:   z.string().optional(),
  notes:         z.string().optional(),
});
type DonationForm = z.infer<typeof donationSchema>;

const distSchema = z.object({
  distributed_to:   z.string().min(2, "Recipient required"),
  quantity:         z.string().min(1, "Quantity required"),
  distribution_date: z.string().min(1, "Date required"),
  distribution_type: z.string(),
  notes:            z.string().optional(),
});
type DistForm = z.infer<typeof distSchema>;

// ─── Constants ─────────────────────────────────────────────────────────────────

const DONOR_TYPES  = ["individual", "organization", "corporate", "government", "anonymous"];
const ITEM_TYPES   = ["Canned Goods", "Clothing", "Medicine", "Equipment", "Food Pack", "School Supplies", "Hygiene Kit", "Cash", "Other"];
const UNITS        = ["pcs", "kg", "boxes", "bags", "liters", "sets", "PHP"];
const DIST_TYPES   = ["regular", "disaster"];

const DONOR_BADGE: Record<string, string> = {
  individual:  "bg-primary/10 text-primary border border-primary/20",
  organization:"bg-info/10 text-info border border-info/20",
  corporate:   "bg-accent/10 text-accent-foreground border border-accent/30",
  government:  "bg-success/10 text-success border border-success/20",
  anonymous:   "bg-muted/60 text-muted-foreground border border-border",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const today = () => new Date().toISOString().split("T")[0];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OfficerDonationsPage() {
  const [donations, setDonations]   = useState<Donation[]>([]);
  const [barangays, setBarangays]   = useState<Barangay[]>([]);
  const [programs, setPrograms]     = useState<Program[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");

  // Form sheet
  const [formOpen, setFormOpen] = useState(false);
  const [editDon, setEditDon]   = useState<Donation | null>(null);
  const [saving, setSaving]     = useState(false);

  // Detail sheet
  const [detailOpen, setDetailOpen]       = useState(false);
  const [detailDon, setDetailDon]         = useState<DonationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Distribution dialog
  const [distFormOpen, setDistFormOpen] = useState(false);
  const [distSaving, setDistSaving]     = useState(false);

  const donationForm = useForm<DonationForm>({
    resolver: zodResolver(donationSchema),
    defaultValues: { donor_type: "individual", unit: "pcs", received_date: today() },
  });
  const distForm = useForm<DistForm>({
    resolver: zodResolver(distSchema),
    defaultValues: { distribution_type: "regular", distribution_date: today() },
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [donRes, barRes, progRes] = await Promise.all([
      fetch("/api/donations"),
      fetch("/api/partnerships"),
      fetch("/api/programs"),
    ]);
    if (donRes.ok)  { const j = await donRes.json();  setDonations(j.data ?? []); }
    if (barRes.ok)  { const j = await barRes.json();  setBarangays(j.data ?? []); }
    if (progRes.ok) { const j = await progRes.json(); setPrograms(j.data  ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/donations/${id}`);
    if (res.ok) { const j = await res.json(); setDetailDon(j.data); }
    setDetailLoading(false);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return donations.filter((d) => {
      const matchQ    = d.donor_name.toLowerCase().includes(q) || d.item_type.toLowerCase().includes(q);
      const matchT    = typeFilter === "all" || d.item_type === typeFilter;
      const received  = (d.received_date ?? "").slice(0, 10);
      const matchFrom = !dateFrom || received >= dateFrom;
      const matchTo   = !dateTo   || received <= dateTo;
      return matchQ && matchT && matchFrom && matchTo;
    });
  }, [donations, search, typeFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const totalQty       = donations.reduce((s, d) => s + (d.quantity ?? 0), 0);
    const totalDistrib   = donations.reduce((s, d) =>
      s + d.donation_distributions.reduce((a, x) => a + (x.quantity ?? 0), 0), 0);
    return { count: donations.length, totalQty, totalDistrib };
  }, [donations]);

  const distTotal = useMemo(() => {
    if (!detailDon) return 0;
    return detailDon.donation_distributions.reduce((s, d) => s + (d.quantity ?? 0), 0);
  }, [detailDon]);

  const uniqueItemTypes = useMemo(() => {
    const seen: Record<string, true> = {};
    donations.forEach((d) => { seen[d.item_type] = true; });
    return Object.keys(seen).sort();
  }, [donations]);

  // ── Donation CRUD ─────────────────────────────────────────────────────────────

  function openCreate() {
    setEditDon(null);
    donationForm.reset({ donor_type: "individual", unit: "pcs", received_date: today() });
    setFormOpen(true);
  }

  function openEdit(d: Donation) {
    setEditDon(d);
    donationForm.reset({
      donor_name:    d.donor_name,
      donor_type:    d.donor_type,
      item_type:     d.item_type,
      quantity:      String(d.quantity),
      unit:          d.unit,
      received_date: d.received_date,
      program_id:    d.program_id  ?? "",
      barangay_id:   d.barangay_id ?? "",
      notes:         d.notes       ?? "",
    });
    setFormOpen(true);
  }

  async function onDonationSubmit(values: DonationForm) {
    setSaving(true);
    const payload = {
      donor_name:    values.donor_name,
      donor_type:    values.donor_type,
      item_type:     values.item_type,
      quantity:      parseFloat(values.quantity),
      unit:          values.unit,
      received_date: values.received_date,
      program_id:    values.program_id  || null,
      barangay_id:   values.barangay_id || null,
      notes:         values.notes       || null,
    };
    const res = editDon
      ? await fetch(`/api/donations/${editDon.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      : await fetch("/api/donations", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
    if (res.ok) {
      toast.success(editDon ? "Donation updated." : "Donation recorded.");
      setFormOpen(false);
      fetchAll();
      if (detailDon && editDon?.id === detailDon.id) fetchDetail(detailDon.id);
    } else {
      toast.error("Failed to save donation.");
    }
    setSaving(false);
  }

  function openDetail(d: Donation) {
    setDetailDon(null);
    setDetailOpen(true);
    fetchDetail(d.id);
  }

  // ── Distribution ──────────────────────────────────────────────────────────────

  async function onDistSubmit(values: DistForm) {
    if (!detailDon) return;
    setDistSaving(true);
    const payload = {
      distributed_to:   values.distributed_to,
      quantity:         parseFloat(values.quantity),
      distribution_date: values.distribution_date,
      distribution_type: values.distribution_type,
      notes:            values.notes || null,
    };
    const res = await fetch(`/api/donations/${detailDon.id}/distribute`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success("Distribution recorded.");
      setDistFormOpen(false);
      distForm.reset({ distribution_type: "regular", distribution_date: today() });
      fetchDetail(detailDon.id);
      fetchAll();
    } else {
      toast.error("Failed to record distribution.");
    }
    setDistSaving(false);
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Donations",     value: stats.count,      icon: Gift,        accent: "border-l-primary" },
          { label: "Total Items Received", value: stats.totalQty,   icon: Package,     accent: "border-l-accent" },
          { label: "Total Distributed",   value: stats.totalDistrib, icon: TrendingDown, accent: "border-l-success" },
        ].map(({ label, value, icon: Icon, accent }) => (
          <Card key={label} className={`border-border shadow-card border-l-4 ${accent}`}>
            <CardContent className="px-4 py-2.5">
              <div className="flex items-center gap-2 mb-0.5">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
              <p className="text-2xl font-bold font-heading text-foreground">
                {loading ? "—" : value.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Donations table */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="font-heading text-lg">Donation Log</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search donor or item…"
                  className="pl-9 h-9 w-52 focus-visible:ring-primary/30"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9">
                <option value="all">All Items</option>
                {uniqueItemTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="From date" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="To date" />
              {(search || typeFilter !== "all" || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setSearch(""); setTypeFilter("all"); setDateFrom(""); setDateTo(""); }}>
                  Clear
                </Button>
              )}
              <Button onClick={openCreate} className="bg-primary hover:bg-primary-light text-white">
                <Plus className="w-4 h-4 mr-1.5" /> Record Donation
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Donor</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Item</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden sm:table-cell">Qty</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Date</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden lg:table-cell">Distributed</th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">
                    {donations.length === 0 ? "No donations recorded yet." : "No donations match your search."}
                  </td></tr>
                ) : filtered.map((d, i) => {
                  const distQty = d.donation_distributions.reduce((s, x) => s + (x.quantity ?? 0), 0);
                  const remaining = (d.quantity ?? 0) - distQty;
                  return (
                    <tr
                      key={d.id}
                      className={`border-b border-border/60 hover:bg-surface-alt/40 transition-colors cursor-pointer ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}
                      onClick={() => openDetail(d)}
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-foreground">{d.donor_name}</p>
                        <Badge className={`${DONOR_BADGE[d.donor_type] ?? ""} capitalize text-xs mt-0.5`}>{d.donor_type}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-foreground">{d.item_type}</p>
                        {d.programs && <p className="text-xs text-muted-foreground mt-0.5">{d.programs.title}</p>}
                      </td>
                      <td className="py-3 px-4 text-foreground hidden sm:table-cell">
                        {(d.quantity ?? 0).toLocaleString()} {d.unit}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                        {fmtDate(d.received_date)}
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <span className={`text-sm font-medium ${remaining > 0 ? "text-warning" : "text-success"}`}>
                          {distQty.toLocaleString()} / {(d.quantity ?? 0).toLocaleString()}
                        </span>
                        {remaining > 0 && (
                          <p className="text-xs text-muted-foreground">{remaining.toLocaleString()} remaining</p>
                        )}
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors">
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuGroup>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => openDetail(d)}>View Details</DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(d)}>Edit</DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
            {filtered.length} of {donations.length} donations
          </div>
        </CardContent>
      </Card>

      {/* ── Create / Edit Donation Sheet ────────────────────────────────────────── */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
            <SheetTitle className="font-heading text-lg">
              {editDon ? "Edit Donation" : "Record Donation"}
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={donationForm.handleSubmit(onDonationSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="text-sm font-medium text-foreground">Donor Name <span className="text-danger">*</span></label>
                  <Input {...donationForm.register("donor_name")} placeholder="Full name or organization" className="focus-visible:ring-primary/30" />
                  {donationForm.formState.errors.donor_name && (
                    <p className="text-xs text-danger">{donationForm.formState.errors.donor_name.message}</p>
                  )}
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="text-sm font-medium text-foreground">Donor Type</label>
                  <select
                    {...donationForm.register("donor_type")}
                    className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {DONOR_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Item Type <span className="text-danger">*</span></label>
                <select
                  {...donationForm.register("item_type")}
                  className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— Select item type —</option>
                  {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {donationForm.formState.errors.item_type && (
                  <p className="text-xs text-danger">{donationForm.formState.errors.item_type.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Quantity <span className="text-danger">*</span></label>
                  <Input type="number" min={0} step="0.01" {...donationForm.register("quantity")} className="focus-visible:ring-primary/30" />
                  {donationForm.formState.errors.quantity && (
                    <p className="text-xs text-danger">{donationForm.formState.errors.quantity.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Unit</label>
                  <select
                    {...donationForm.register("unit")}
                    className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Date Received <span className="text-danger">*</span></label>
                <Input type="date" {...donationForm.register("received_date")} className="focus-visible:ring-primary/30" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Associated Program</label>
                <select
                  {...donationForm.register("program_id")}
                  className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— None —</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Barangay</label>
                <select
                  {...donationForm.register("barangay_id")}
                  className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— None —</option>
                  {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Notes</label>
                <textarea
                  {...donationForm.register("notes")}
                  rows={3}
                  placeholder="Additional information…"
                  className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-border px-6 py-4 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-light text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editDon ? "Save Changes" : "Record Donation")}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Donation Detail Sheet ───────────────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          {detailLoading || !detailDon ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="font-heading text-xl">{detailDon.donor_name}</SheetTitle>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge className={`${DONOR_BADGE[detailDon.donor_type] ?? ""} capitalize text-xs`}>
                        {detailDon.donor_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {fmtDate(detailDon.received_date)}
                      </span>
                      {detailDon.barangays && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {detailDon.barangays.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { setDetailOpen(false); openEdit(detailDon); }}
                  >
                    Edit
                  </Button>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                {/* Item summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl border border-border bg-surface-alt/30 text-center">
                    <p className="text-xs text-muted-foreground">Item</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{detailDon.item_type}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-surface-alt/30 text-center">
                    <p className="text-xs text-muted-foreground">Received</p>
                    <p className="text-lg font-bold font-heading text-foreground">{(detailDon.quantity ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{detailDon.unit}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-surface-alt/30 text-center">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className={`text-lg font-bold font-heading ${(detailDon.quantity ?? 0) - distTotal > 0 ? "text-warning" : "text-success"}`}>
                      {((detailDon.quantity ?? 0) - distTotal).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{detailDon.unit}</p>
                  </div>
                </div>

                {/* Progress bar */}
                {(detailDon.quantity ?? 0) > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Distribution progress</span>
                      <span>{Math.round((distTotal / (detailDon.quantity ?? 1)) * 100)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${Math.min(100, (distTotal / (detailDon.quantity ?? 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {detailDon.notes && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">Notes</p>
                    <p className="text-sm text-foreground">{detailDon.notes}</p>
                  </div>
                )}

                {detailDon.programs && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-surface-alt/30 border border-border">
                    <Package className="w-4 h-4 flex-shrink-0" />
                    <span>Associated with <strong className="text-foreground">{detailDon.programs.title}</strong></span>
                  </div>
                )}

                {/* Distributions */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      Distribution Records ({detailDon.donation_distributions.length})
                    </p>
                    <Button
                      size="sm"
                      onClick={() => { distForm.reset({ distribution_type: "regular", distribution_date: today() }); setDistFormOpen(true); }}
                      className="bg-primary hover:bg-primary-light text-white h-8 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Distribute
                    </Button>
                  </div>

                  {detailDon.donation_distributions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No distributions recorded yet.</p>
                  ) : detailDon.donation_distributions.map((dist) => (
                    <div key={dist.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-transparent-alt/20 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{dist.distributed_to}</p>
                          <Badge className={`text-xs capitalize ${
                            dist.distribution_type === "disaster"
                              ? "bg-danger/10 text-danger border border-danger/20"
                              : "bg-success/10 text-success border border-success/20"
                          }`}>
                            {dist.distribution_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{fmtDate(dist.distribution_date)}</span>
                          <span className="font-medium text-foreground">{dist.quantity.toLocaleString()} {detailDon.unit}</span>
                        </div>
                        {dist.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{dist.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Distribution Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={distFormOpen} onOpenChange={setDistFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Record Distribution</DialogTitle>
          </DialogHeader>
          <form onSubmit={distForm.handleSubmit(onDistSubmit)} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Distributed To <span className="text-danger">*</span></label>
              <Input
                {...distForm.register("distributed_to")}
                placeholder="Barangay, community, or beneficiary group"
                className="focus-visible:ring-primary/30"
              />
              {distForm.formState.errors.distributed_to && (
                <p className="text-xs text-danger">{distForm.formState.errors.distributed_to.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quantity <span className="text-danger">*</span></label>
                <Input
                  type="number" min={0} step="0.01"
                  {...distForm.register("quantity")}
                  placeholder="0"
                  className="focus-visible:ring-primary/30"
                />
                {distForm.formState.errors.quantity && (
                  <p className="text-xs text-danger">{distForm.formState.errors.quantity.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <select
                  {...distForm.register("distribution_type")}
                  className="w-full h-10 rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {DIST_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date <span className="text-danger">*</span></label>
              <Input type="date" {...distForm.register("distribution_date")} className="focus-visible:ring-primary/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Input {...distForm.register("notes")} placeholder="Optional notes" className="focus-visible:ring-primary/30" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDistFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={distSaving} className="bg-primary hover:bg-primary-light text-white">
                {distSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record Distribution"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────────────────────── */}
    </div>
  );
}
