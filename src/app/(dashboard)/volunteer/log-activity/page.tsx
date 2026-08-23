"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle, Loader2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MyProgram {
  id: string;
  title: string;
  status: string;
  my_signup: { status: string } | null;
}

interface ActivityLog {
  id: string;
  date: string;
  hours: number;
  description: string;
  status: "pending" | "approved" | "rejected";
  programs: { title: string } | null;
}

const schema = z.object({
  program_id:  z.string().optional(),
  date:        z.string().min(1, "Date is required"),
  hours:       z.string().min(1, "Hours is required"),
  description: z.string().min(5, "Please describe what you did"),
});
type FormData = z.infer<typeof schema>;

const LOG_BADGE: Record<string, string> = {
  pending:  "bg-warning/10 text-warning border-warning/20 border",
  approved: "bg-success/10 text-success border-success/20 border",
  rejected: "bg-danger/10 text-danger border-danger/20 border",
};

export default function LogActivityPage() {
  const [programs, setPrograms] = useState<MyProgram[]>([]);
  const [logs, setLogs]         = useState<ActivityLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date().toISOString().split("T")[0] },
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [progRes, logRes] = await Promise.all([
      fetch("/api/programs"),
      fetch("/api/activity-logs"),
    ]);
    if (progRes.ok) {
      const j = await progRes.json();
      setPrograms((j.data ?? []).filter((p: MyProgram) => p.my_signup && p.my_signup.status !== "withdrawn"));
    }
    if (logRes.ok) {
      const j = await logRes.json();
      setLogs(j.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function onSubmit(data: FormData) {
    const hours = parseFloat(data.hours);
    if (isNaN(hours) || hours <= 0) { toast.error("Enter a valid number of hours."); return; }
    setSaving(true);
    const res = await fetch("/api/activity-logs", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...data, program_id: data.program_id || null, hours }),
    });
    if (res.ok) {
      const j = await res.json();
      setLogs((prev) => [j.data, ...prev]);
      toast.success("Activity logged. Pending officer approval.");
      reset({ date: new Date().toISOString().split("T")[0] });
    } else {
      toast.error("Failed to log activity.");
    }
    setSaving(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      {/* Log form */}
      <div className="lg:col-span-2">
        <Card className="border-border shadow-card">
          <CardHeader className="pb-4">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-accent" /> Log Activity
            </CardTitle>
            <p className="text-sm text-muted-foreground">Record your volunteer hours for officer approval.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="program_id">Program <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <select
                  id="program_id"
                  {...register("program_id")}
                  className="w-full h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                >
                  <option value="">— General / not program-specific —</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="date">Date <span className="text-danger">*</span></Label>
                  <Input id="date" type="date" className="focus-visible:ring-primary/30" {...register("date")} />
                  {errors.date && <p className="text-xs text-danger">{errors.date.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hours">Hours <span className="text-danger">*</span></Label>
                  <Input id="hours" type="number" step="0.5" min="0.5" max="24" placeholder="e.g. 3.5" className="focus-visible:ring-primary/30" {...register("hours")} />
                  {errors.hours && <p className="text-xs text-danger">{errors.hours.message}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">What did you do? <span className="text-danger">*</span></Label>
                <Textarea
                  id="description"
                  placeholder="Describe your activities, tasks completed, and impact observed…"
                  rows={4}
                  className="focus-visible:ring-primary/30 resize-none text-sm"
                  {...register("description")}
                />
                {errors.description && <p className="text-xs text-danger">{errors.description.message}</p>}
              </div>

              <Button type="submit" disabled={saving} className="w-full bg-primary hover:bg-primary-dark text-white">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Submit Log
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Recent logs */}
      <div className="lg:col-span-3 space-y-4">
        <h3 className="font-heading font-semibold text-foreground">Recent Activity Logs</h3>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          </div>
        ) : logs.length === 0 ? (
          <Card className="border-border shadow-card">
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No logs yet. Submit your first activity above.
            </CardContent>
          </Card>
        ) : logs.map((log) => (
          <Card key={log.id} className="border-border shadow-sm">
            <CardContent className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-2">{log.description}</p>
                  {log.programs && <p className="text-xs text-muted-foreground mt-0.5">{log.programs.title}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(log.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="text-lg font-bold font-heading text-foreground">
                    {log.hours}h
                  </span>
                  <Badge className={`${LOG_BADGE[log.status]} capitalize text-xs`}>{log.status}</Badge>
                </div>
              </div>
              {log.status === "approved" && (
                <div className="mt-2 flex items-center gap-1 text-xs text-success">
                  <CheckCircle className="w-3 h-3" /> Approved
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
