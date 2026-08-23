"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, MapPin, Calendar, Users, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ProgramStatus = "planning" | "active" | "completed" | "cancelled";
type SignupStatus  = "pending" | "approved" | "withdrawn";

interface Program {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  max_volunteers: number | null;
  status: ProgramStatus;
  signup_count: number;
  my_signup: { id: string; status: SignupStatus } | null;
  barangays: { name: string } | null;
}

const STATUS_BADGE: Record<ProgramStatus, string> = {
  planning:  "bg-info/10 text-info border-info/20 border",
  active:    "bg-success/10 text-success border-success/20 border",
  completed: "bg-muted text-muted-foreground border",
  cancelled: "bg-danger/10 text-danger border-danger/20 border",
};

function fmt(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function VolunteerProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actId, setActId]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState<"all" | ProgramStatus>("all");

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/programs");
    if (res.ok) { const j = await res.json(); setPrograms(j.data ?? []); }
    else toast.error("Failed to load programs.");
    setLoading(false);
  }, []);

  useEffect(() => { fetchPrograms(); }, [fetchPrograms]);

  const filtered = programs.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = p.title.toLowerCase().includes(q) || (p.barangays?.name ?? "").toLowerCase().includes(q);
    const matchFilter = filter === "all" || p.status === filter;
    return matchSearch && matchFilter;
  });

  async function signUp(id: string) {
    setActId(id);
    const res = await fetch(`/api/programs/${id}/signup`, { method: "POST" });
    if (res.ok) {
      const j = await res.json();
      setPrograms((prev) => prev.map((p) => p.id === id ? { ...p, my_signup: j.data, signup_count: p.signup_count + 1 } : p));
      toast.success("Signed up! Awaiting officer approval.");
    } else {
      toast.error("Failed to sign up. Please try again.");
    }
    setActId(null);
  }

  async function withdraw(id: string) {
    setActId(id);
    const res = await fetch(`/api/programs/${id}/signup`, { method: "DELETE" });
    if (res.ok) {
      setPrograms((prev) => prev.map((p) => p.id === id ? { ...p, my_signup: null, signup_count: Math.max(0, p.signup_count - 1) } : p));
      toast.success("Withdrawal recorded.");
    } else {
      toast.error("Action failed.");
    }
    setActId(null);
  }

  return (
    <div className="space-y-6">
      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search programs or barangay…"
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
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Program cards */}
      {loading ? (
        <div className="py-20 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading programs…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border shadow-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            {programs.length === 0 ? "No programs available yet." : "No programs match your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const isOpen      = p.status === "active" || p.status === "planning";
            const isFull      = p.max_volunteers != null && p.signup_count >= p.max_volunteers;
            const myStatus    = p.my_signup?.status;
            const isActing    = actId === p.id;

            return (
              <Card key={p.id} className="border-border shadow-card flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge className={`${STATUS_BADGE[p.status]} capitalize text-xs`}>{p.status}</Badge>
                    {myStatus && myStatus !== "withdrawn" && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 border text-xs capitalize">{myStatus}</Badge>
                    )}
                  </div>
                  <CardTitle className="font-heading text-base mt-2 leading-snug">{p.title}</CardTitle>
                  {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>}
                </CardHeader>

                <CardContent className="pt-0 flex flex-col flex-1 gap-3">
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {p.barangays && (
                      <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 flex-shrink-0" />{p.barangays.name}</p>
                    )}
                    <p className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      {fmt(p.start_date)} {p.end_date ? `— ${fmt(p.end_date)}` : ""}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 flex-shrink-0" />
                      {p.signup_count}{p.max_volunteers ? ` / ${p.max_volunteers}` : ""} volunteers
                      {isFull && <span className="text-danger font-medium">(Full)</span>}
                    </p>
                  </div>

                  <div className="mt-auto pt-2">
                    {!isOpen ? (
                      <Button disabled className="w-full bg-muted text-muted-foreground">
                        {p.status === "completed" ? <><CheckCircle className="w-4 h-4 mr-2" /> Completed</> : "Unavailable"}
                      </Button>
                    ) : myStatus && myStatus !== "withdrawn" ? (
                      <Button
                        variant="outline"
                        disabled={isActing}
                        onClick={() => withdraw(p.id)}
                        className="w-full border-danger/40 text-danger hover:bg-danger/5"
                      >
                        {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Withdraw"}
                      </Button>
                    ) : (
                      <Button
                        disabled={isActing || isFull}
                        onClick={() => signUp(p.id)}
                        className="w-full bg-primary hover:bg-primary-dark text-white"
                      >
                        {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : isFull ? "Program Full" : "Sign Up"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
