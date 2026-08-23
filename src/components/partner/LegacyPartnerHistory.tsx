"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type HistoricalRow = { id: string; title: string; status: string; created_at?: string; start_date?: string | null; end_date?: string | null };
export function LegacyPartnerHistory({ kind }: { kind: "proposals" | "programs" }) {
  const [rows,setRows]=useState<HistoricalRow[]>([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{fetch(`/api/${kind}`).then(r=>r.ok?r.json():Promise.reject()).then(p=>setRows(p.data??[])).finally(()=>setLoading(false));},[kind]);
  return <div className="space-y-5"><div><h1 className="font-heading text-2xl font-bold">Historical {kind}</h1><p className="text-sm text-muted-foreground mt-1">Read-only attribution retained during the institutional-account transition. New proposals are encoded by PARAYA using a non-login Partner/Proponent record.</p></div><Card><CardContent className="p-0">{loading?<div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div>:<div className="divide-y">{rows.length===0?<p className="p-8 text-sm text-center text-muted-foreground">No historical records are attributed to this account.</p>:rows.map(row=><div key={row.id} className="p-4 flex items-center justify-between gap-4"><div><p className="font-medium">{row.title}</p><p className="text-xs text-muted-foreground">{row.created_at?new Date(row.created_at).toLocaleDateString():[row.start_date,row.end_date].filter(Boolean).join(" – ")}</p></div><Badge variant="outline">{row.status.replaceAll("_"," ")}</Badge></div>)}</div>}</CardContent></Card></div>;
}
