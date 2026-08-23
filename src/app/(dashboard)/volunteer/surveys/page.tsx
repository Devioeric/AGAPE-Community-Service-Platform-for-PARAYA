"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Loader2, CheckCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Survey {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  published_at: string | null;
  survey_questions: { id: string }[];
}

interface Question {
  id: string;
  question_text: string;
  question_type: "text" | "multiple_choice" | "checkbox" | "rating";
  options: string[] | null;
  is_required: boolean;
  order_index: number;
}

interface SurveyDetail extends Survey {
  survey_questions: Question[];
}

type Answers = Record<string, string | string[] | number>;

export default function VolunteerSurveysPage() {
  const [surveys, setSurveys]     = useState<Survey[]>([]);
  const [loading, setLoading]     = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail]       = useState<SurveyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answers, setAnswers]     = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/surveys");
    if (res.ok) { const j = await res.json(); setSurveys(j.data ?? []); }
    else toast.error("Failed to load surveys.");
    setLoading(false);
  }, []);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  async function openSurvey(id: string) {
    setAnswers({});
    setSheetOpen(true);
    setDetailLoading(true);
    const res = await fetch(`/api/surveys/${id}`);
    if (res.ok) { const j = await res.json(); setDetail(j.data); }
    else toast.error("Failed to load survey.");
    setDetailLoading(false);
  }

  function setAnswer(qid: string, val: string | string[] | number) {
    setAnswers((prev) => ({ ...prev, [qid]: val }));
  }

  function toggleCheckbox(qid: string, opt: string) {
    setAnswers((prev) => {
      const curr = (prev[qid] as string[]) ?? [];
      return { ...prev, [qid]: curr.includes(opt) ? curr.filter((v) => v !== opt) : [...curr, opt] };
    });
  }

  async function submitSurvey() {
    if (!detail) return;
    const required = detail.survey_questions.filter((q) => q.is_required);
    const missing  = required.filter((q) => {
      const a = answers[q.id];
      return !a || (Array.isArray(a) && a.length === 0) || a === "";
    });
    if (missing.length > 0) {
      toast.error(`Please answer all required questions (${missing.length} remaining).`);
      return;
    }

    setSubmitting(true);
    const payload = {
      answers: detail.survey_questions.map((q) => {
        const a = answers[q.id];
        return {
          question_id:    q.id,
          answer_text:    Array.isArray(a) ? null : typeof a === "number" ? String(a) : (a ?? null),
          answer_options: Array.isArray(a) ? a : null,
        };
      }),
    };

    const res = await fetch(`/api/surveys/${detail.id}/respond`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success("Response submitted. Thank you!");
      setSubmitted((prev) => new Set(prev).add(detail.id));
      setSheetOpen(false);
    } else {
      toast.error("Failed to submit survey.");
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">Surveys for Beneficiary Interviews</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Answer surveys on behalf of beneficiaries you&apos;re interviewing in the field. Each submission is logged separately, so you can fill the same survey multiple times — once per beneficiary.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading surveys…
        </div>
      ) : surveys.length === 0 ? (
        <Card className="border-border shadow-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            No surveys available right now. Check back once a PARAYA officer publishes one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {surveys.map((s) => {
            const done = submitted.has(s.id);
            return (
              <Card key={s.id} className="border-border shadow-card hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    {done
                      ? <Badge className="bg-success/10 text-success border-success/20 border text-xs">Submitted</Badge>
                      : <Badge className="bg-accent/10 text-accent border-accent/20 border text-xs">Open</Badge>
                    }
                  </div>
                  <CardTitle className="font-heading text-base mt-3">{s.title}</CardTitle>
                  {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="capitalize">{s.category ?? "General"}</span>
                    <span>{s.survey_questions?.length ?? 0} questions</span>
                  </div>
                  <Button
                    onClick={() => openSurvey(s.id)}
                    className="w-full bg-primary hover:bg-primary-dark text-white"
                  >
                    {done ? <><CheckCircle className="w-4 h-4 mr-2" /> Submit Another Response</> : "Start Interview"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Answer sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
            <SheetTitle className="font-heading text-lg">{detail?.title ?? "Survey"}</SheetTitle>
            {detail?.description && <p className="text-sm text-muted-foreground mt-1">{detail.description}</p>}
            <div className="mt-2 p-2.5 rounded-lg bg-info/5 border border-info/20 text-xs text-info">
              Record the beneficiary&apos;s answers below. You can submit this survey again for each new beneficiary you interview.
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {detailLoading ? (
              <div className="py-20 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading questions…
              </div>
            ) : (detail?.survey_questions ?? []).map((q, i) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {i + 1}. {q.question_text}
                  {q.is_required && <span className="text-danger ml-1">*</span>}
                </p>

                {q.question_type === "text" && (
                  <Textarea
                    placeholder="Beneficiary's answer…"
                    rows={3}
                    className="focus-visible:ring-primary/30 resize-none text-sm"
                    value={(answers[q.id] as string) ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                  />
                )}

                {q.question_type === "multiple_choice" && (
                  <div className="space-y-1.5">
                    {(q.options ?? []).map((opt) => (
                      <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${answers[q.id] === opt ? "border-primary bg-primary" : "border-border group-hover:border-primary/50"}`}>
                          {answers[q.id] === opt && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <input type="radio" className="sr-only" checked={answers[q.id] === opt} onChange={() => setAnswer(q.id, opt)} />
                        <span className="text-sm text-foreground">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.question_type === "checkbox" && (
                  <div className="space-y-1.5">
                    {(q.options ?? []).map((opt) => {
                      const checked = ((answers[q.id] as string[]) ?? []).includes(opt);
                      return (
                        <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? "border-primary bg-primary" : "border-border group-hover:border-primary/50"}`}
                            onClick={() => toggleCheckbox(q.id, opt)}
                          >
                            {checked && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12"><path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <span className="text-sm text-foreground">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.question_type === "rating" && (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const selected = (answers[q.id] as number) >= n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAnswer(q.id, n)}
                          className="transition-transform hover:scale-110"
                        >
                          <Star className={`w-7 h-7 ${selected ? "fill-accent text-accent" : "text-border"}`} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-border px-6 py-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button
              disabled={submitting || detailLoading}
              className="bg-primary hover:bg-primary-dark text-white"
              onClick={submitSurvey}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Submit Response
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
