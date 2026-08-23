"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ScanLine, CheckCircle2, Loader2, AlertCircle, Calendar, ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface CheckInResult {
  activity: { id: string; title: string; date: string | null };
  program:  { id: string; title: string } | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function VolunteerCheckInPage() {
  const params      = useSearchParams();
  const prefilled   = (params.get("otp") ?? "").toUpperCase().slice(0, 6);

  const [otp, setOtp]           = useState(prefilled);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]     = useState<CheckInResult | null>(null);
  const [error,  setError]      = useState<string | null>(null);

  // Auto-submit when an OTP came in via URL — makes QR scanning seamless
  useEffect(() => {
    if (prefilled.length === 6 && !result && !error && !submitting) {
      submit(prefilled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilled]);

  async function submit(code: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/attendance/check-in", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ otp: code, method: prefilled ? "qr" : "otp" }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setResult({ activity: j.activity, program: j.program });
    } else {
      setError(j.error ?? "Check-in failed.");
    }
    setSubmitting(false);
  }

  function onSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length < 4) {
      setError("Enter the full 6-character code.");
      return;
    }
    submit(otp.trim().toUpperCase());
  }

  // ── Success view ───────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="max-w-md mx-auto text-center py-12 animate-fade-in space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-success/10">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-foreground">You&apos;re checked in!</h1>
        <Card className="border-border shadow-card text-left">
          <CardContent className="p-5 space-y-1">
            <p className="text-xs text-muted-foreground">Activity</p>
            <p className="text-base font-semibold text-foreground">{result.activity.title}</p>
            <p className="text-xs text-muted-foreground mt-2">Program</p>
            <p className="text-sm text-foreground">{result.program?.title ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {fmtDate(result.activity.date)}
            </p>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2">
          <Link
            href="/volunteer/hours"
            className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            View My Hours
          </Link>
          <button
            onClick={() => { setResult(null); setOtp(""); }}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Check in for another activity
          </button>
        </div>
      </div>
    );
  }

  // ── Entry form ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-3">
          <ScanLine className="w-7 h-7 text-primary" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground">Check In</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scan the QR code at the venue or enter the 6-character code below.
        </p>
      </div>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-base">Attendance Code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmitForm} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="otp">Code</Label>
              <Input
                id="otp"
                inputMode="text"
                autoComplete="off"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="e.g. K7P3WX"
                className="font-mono text-2xl tracking-[0.4em] text-center h-14 focus-visible:ring-primary/30"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Codes are 6 characters — uppercase letters and digits only.</p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-danger/5 border border-danger/20 text-sm text-danger flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || otp.length < 4}
              className="w-full bg-primary hover:bg-primary-dark text-white gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Check In
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Codes expire after a few hours. If your code doesn&apos;t work, ask the PARAYA officer at the venue for a new one.
      </p>
    </div>
  );
}
