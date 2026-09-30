"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LegacyHouseholdPage } from "@/lib/profiling/legacy-household-contract";
import { LEGACY_MAX_PAGE } from "@/lib/profiling/legacy-household-contract";

export function LegacyHouseholdList({ initialPage, initialError, initialTiming }: { initialPage: LegacyHouseholdPage | null; initialError: string | null; initialTiming: string }) {
  const [result, setResult] = useState(initialPage);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [request, setRequest] = useState<{ page: number; q: string; revision: number } | null>(null);

  useEffect(() => {
    if (!request) return; // Server already loaded and audited the first page.
    const controller = new AbortController();
    let current = true;
    setLoading(true); setError(null); setResult(null);
    const params = new URLSearchParams({ page: String(request.page), q: request.q });
    fetch(`/api/household-profiles?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(response.status === 400 ? body.error : "Unable to load authorized legacy data. Please retry.");
        return body as LegacyHouseholdPage;
      })
      .then((payload) => { if (current) setResult(payload); })
      .catch((failure: Error) => { if (current && failure.name !== "AbortError") setError(failure.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [request]);

  useEffect(() => {
    const timer = setTimeout(() => setRequest((previous) => {
      if (search.trim() === (previous?.q ?? "")) return previous;
      return { page: 1, q: search.trim(), revision: 0 };
    }), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const visible = result?.data ?? [];
  const refresh = () => setRequest((previous) => ({ page: previous?.page ?? 1, q: search.trim(), revision: (previous?.revision ?? 0) + 1 }));

  return (
    <div className="space-y-6" data-legacy-server-timing={initialTiming}>
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <Badge variant="outline">Unverified · read only</Badge>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
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
        <Input aria-label="Search authorized legacy records" maxLength={80} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search household, sitio or barangay" className="pl-9" />
      </div>

      {error && <div role="alert" className="rounded-lg border border-warning/30 p-4 text-sm">{error}<Button variant="outline" size="sm" onClick={refresh} className="ml-3">Retry</Button></div>}
      <Card aria-busy={loading}><CardContent className="p-0 overflow-x-auto">
        {loading ? <div role="status" className="p-10 flex justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Loading records…</div> : !error && visible.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No authorized legacy records match this search.</p> : !error && (
          <table aria-label="Legacy households" className="w-full text-sm">
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
      {result && <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span aria-live="polite">Page {result.pagination.page} · {visible.length} records shown</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={loading || result.pagination.page <= 1} onClick={() => setRequest({ page: result.pagination.page - 1, q: request?.q ?? "", revision: 0 })}>Previous</Button>
          <Button variant="outline" disabled={loading || !result.pagination.hasNextPage || result.pagination.page >= LEGACY_MAX_PAGE} onClick={() => setRequest({ page: result.pagination.page + 1, q: request?.q ?? "", revision: 0 })}>Next</Button>
        </div>
        {result.pagination.page >= LEGACY_MAX_PAGE && result.pagination.hasNextPage && <p>Refine your search to view further records.</p>}
      </div>}
    </div>
  );
}
