"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Household = {
  id: string; household_number: string;
  member_count: number; sitio: string | null; collected_at: string;
  barangays: { name: string } | null;
};

export default function LegacyCommunityProfilePage() {
  const [rows, setRows] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/household-profiles")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load legacy data")))
      .then((payload) => setRows(payload.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => [row.household_number, row.sitio, row.barangays?.name].some((value) => value?.toLowerCase().includes(query)));
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-bold">Legacy household data</h1>
          <Badge variant="outline">Unverified · read only</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          These aggregate records are preserved only for historical links. They are excluded from resident totals, approved-sample analytics, exports, beneficiary estimates, and AI. No resident records are generated from member counts.
        </p>
        <Link href="/officer/profiling" className="inline-block mt-2 text-sm text-primary hover:underline">
          Open cycle-aware profiling →
        </Link>
      </div>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4 flex gap-3">
          <Archive className="w-5 h-5 text-warning shrink-0" />
          <p className="text-sm">Editing, deletion, and identifiable client-side exports are disabled. Corrections belong in a consented, versioned profiling package.</p>
        </CardContent>
      </Card>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search authorized legacy records" className="pl-9" />
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30">
              <th className="text-left p-3">Legacy household</th><th className="text-left p-3">Barangay</th>
              <th className="text-left p-3">Sitio</th>
              <th className="text-right p-3">Unverified member count</th><th className="text-left p-3">Collected</th>
            </tr></thead>
            <tbody>{visible.map((row) => <tr key={row.id} className="border-b last:border-0">
              <td className="p-3 font-mono text-xs">{row.household_number}</td><td className="p-3">{row.barangays?.name ?? "—"}</td>
              <td className="p-3">{row.sitio ?? "—"}</td>
              <td className="p-3 text-right">{row.member_count}</td><td className="p-3">{new Date(row.collected_at).toLocaleDateString()}</td>
            </tr>)}</tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  );
}
