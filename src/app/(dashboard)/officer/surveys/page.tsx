"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown,
  MoreHorizontal, Loader2, FileText, Globe, XCircle,
  Settings, Eye, LayoutList, Pencil, GitBranch, Check, Search, Tag,
  Bookmark, LayoutTemplate, X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SurveyStatus   = "draft" | "published" | "closed";
type QuestionType   = "text" | "multiple_choice" | "checkbox" | "rating";
type BuilderTab     = "builder" | "settings" | "preview";
type SubmissionType = "once" | "multiple";

interface BarangayOption { id: string; name: string; }

interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  published_at: string | null;
  created_at: string;
  target_barangay_id: string | null;
  methodology: Methodology | null;
  survey_questions: { id: string }[];
}

interface DbQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  is_required: boolean;
  order_index: number;
  section_title: string | null;
  conditions: { on_question_id: string; on_value: string } | null;
}

interface SurveyDetail extends Omit<Survey, "survey_questions"> {
  survey_questions: DbQuestion[];
  opens_at: string | null;
  closes_at: string | null;
  is_anonymous: boolean;
  is_editable: boolean;
  reminder_enabled: boolean;
  submission_type: SubmissionType;
  methodology: Methodology | null;
  parent_survey_id: string | null;
  program_id: string | null;
}

interface LocalSection {
  localId:             string;
  title:               string;
  category:            string;
  defaultQuestionType: QuestionType;
}

interface LocalQuestion {
  localId: string;
  dbId?: string;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  is_required: boolean;
  section_local_id: string;
  conditional_on?: string;    // localId of parent question
  conditional_value?: string;
}

interface SurveyTemplate {
  id:          string;
  name:        string;
  description: string | null;
  sections:    LocalSection[];
  questions:   Omit<LocalQuestion, "dbId">[];
  created_by:  string | null;
  created_at:  string;
}

type Methodology = "quantitative" | "qualitative" | "mixed";

interface SurveySettings {
  target_barangay_id: string;
  opens_at: string;
  closes_at: string;
  is_anonymous: boolean;
  is_editable: boolean;
  reminder_enabled: boolean;
  submission_type: SubmissionType;
  methodology: Methodology;
  parent_survey_id: string;
  program_id: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text:            "Short Text",
  multiple_choice: "Multiple Choice",
  checkbox:        "Checkboxes",
  rating:          "Rating (1–5)",
};

const STATUS_STYLES: Record<SurveyStatus, string> = {
  draft:     "bg-muted text-muted-foreground border",
  published: "bg-success/10 text-success border-success/20 border",
  closed:    "bg-danger/10 text-danger border-danger/20 border",
};

const SECTION_CATEGORIES = [
  { value: "",               label: "— None / General —" },
  { value: "health",         label: "Health" },
  { value: "economic",       label: "Economic" },
  { value: "environmental",  label: "Environmental" },
  { value: "social",         label: "Social" },
  { value: "transportation", label: "Transportation" },
  { value: "education",      label: "Education" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "other",          label: "Other" },
];

const DEFAULT_SECTION_TITLE = "General";
const DEFAULT_SETTINGS: SurveySettings = {
  target_barangay_id: "",
  opens_at:           "",
  closes_at:          "",
  is_anonymous:       false,
  is_editable:        false,
  reminder_enabled:   false,
  submission_type:    "once",
  methodology:        "quantitative",
  parent_survey_id:   "",
  program_id:         "",
};

const METHODOLOGY_LABEL: Record<Methodology, string> = {
  quantitative: "Quantitative",
  qualitative:  "Qualitative",
  mixed:        "Mixed-method",
};

const METHODOLOGY_BADGE: Record<Methodology, string> = {
  quantitative: "bg-info/10 text-info border-info/20 border",
  qualitative:  "bg-accent/15 text-accent-foreground border-accent/30 border",
  mixed:        "bg-success/10 text-success border-success/20 border",
};

function makeId() { return Math.random().toString(36).slice(2); }

// ─── QuestionCard ──────────────────────────────────────────────────────────────

function QuestionCard({
  q, index, total, allQuestions, onChange, onDelete, onMove,
}: {
  q: LocalQuestion;
  index: number;
  total: number;
  allQuestions: LocalQuestion[];
  onChange: (u: Partial<LocalQuestion>) => void;
  onDelete: () => void;
  onMove: (d: "up" | "down") => void;
}) {
  const [showConditional, setShowConditional] = useState(!!q.conditional_on);
  const hasOptions = q.question_type === "multiple_choice" || q.question_type === "checkbox";

  const conditionSources = allQuestions.filter(
    (aq) => aq.localId !== q.localId &&
      (aq.question_type === "multiple_choice" || aq.question_type === "checkbox") &&
      aq.options.some((o) => o.trim()),
  );
  const sourceQuestion = conditionSources.find((s) => s.localId === q.conditional_on);

  function addOption() { onChange({ options: [...q.options, ""] }); }
  function updateOption(i: number, val: string) {
    const next = [...q.options]; next[i] = val; onChange({ options: next });
  }
  function removeOption(i: number) { onChange({ options: q.options.filter((_, j) => j !== i) }); }

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground w-5 flex-shrink-0">{index + 1}.</span>
          <select
            value={q.question_type}
            onChange={(e) => {
              const t = e.target.value as QuestionType;
              onChange({
                question_type: t,
                options: (t === "multiple_choice" || t === "checkbox") && q.options.length === 0 ? [""] : q.options,
              });
            }}
            className="h-8 rounded-xl border border-border bg-transparent px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
          >
            {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => onMove("up")} disabled={index === 0} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onMove("down")} disabled={index === total - 1} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <Input
          placeholder="Question text…"
          value={q.question_text}
          onChange={(e) => onChange({ question_text: e.target.value })}
          className="focus-visible:ring-primary/30"
        />

        {q.question_type === "rating" && (
          <div className="flex gap-1 px-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-xs text-muted-foreground">{n}</span>
            ))}
          </div>
        )}

        {hasOptions && (
          <div className="space-y-2 pl-1">
            {q.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded${q.question_type === "checkbox" ? "" : "-full"} border border-border flex-shrink-0`} />
                <Input
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  className="h-8 text-sm focus-visible:ring-primary/30"
                />
                <button onClick={() => removeOption(i)} className="text-muted-foreground hover:text-danger transition-colors flex-shrink-0">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={addOption} className="text-xs text-primary hover:text-primary-dark flex items-center gap-1 transition-colors ml-6">
              <Plus className="w-3 h-3" /> Add option
            </button>
          </div>
        )}

        {/* Footer: required + conditional */}
        <div className="flex items-center gap-4 pt-1 border-t border-border/50">
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={q.is_required}
              onClick={() => onChange({ is_required: !q.is_required })}
              className={cn(
                "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                q.is_required ? "bg-primary" : "bg-border",
              )}
            >
              <span className={cn(
                "pointer-events-none absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200",
                q.is_required ? "translate-x-3" : "translate-x-0",
              )} />
            </button>
            <span className="text-xs text-muted-foreground">Required</span>
          </div>
          {conditionSources.length > 0 && (
            <button
              onClick={() => {
                setShowConditional(!showConditional);
                if (showConditional) onChange({ conditional_on: undefined, conditional_value: undefined });
              }}
              className={cn(
                "flex items-center gap-1 text-xs transition-colors",
                showConditional ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <GitBranch className="w-3 h-3" />
              {showConditional ? "Conditional on" : "Add condition"}
            </button>
          )}
        </div>

        {showConditional && conditionSources.length > 0 && (
          <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Show this question when:</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={q.conditional_on ?? ""}
                onChange={(e) => onChange({ conditional_on: e.target.value || undefined, conditional_value: undefined })}
                className="h-8 rounded-xl border border-border bg-card px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
              >
                <option value="">— Select question —</option>
                {conditionSources.map((s) => (
                  <option key={s.localId} value={s.localId}>
                    {s.question_text || `(Question ${allQuestions.findIndex((q) => q.localId === s.localId) + 1})`}
                  </option>
                ))}
              </select>
              {sourceQuestion && (
                <>
                  <span className="text-xs text-muted-foreground">equals</span>
                  <select
                    value={q.conditional_value ?? ""}
                    onChange={(e) => onChange({ conditional_value: e.target.value || undefined })}
                    className="h-8 rounded-xl border border-border bg-card px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                  >
                    <option value="">— Select answer —</option>
                    {sourceQuestion.options.filter((o) => o.trim()).map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Survey Preview ────────────────────────────────────────────────────────────

function SurveyPreview({
  title, description, sections, questions,
}: {
  title: string;
  description: string;
  sections: LocalSection[];
  questions: LocalQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  function isVisible(q: LocalQuestion): boolean {
    if (!q.conditional_on || !q.conditional_value) return true;
    const parentAnswer = answers[q.conditional_on];
    if (Array.isArray(parentAnswer)) return parentAnswer.includes(q.conditional_value);
    return parentAnswer === q.conditional_value;
  }

  function setAnswer(localId: string, val: string | string[]) {
    setAnswers((prev) => ({ ...prev, [localId]: val }));
  }

  const sectionGroups = sections.map((sec) => ({
    section: sec,
    questions: questions.filter((q) => q.section_local_id === sec.localId),
  })).filter((g) => g.questions.length > 0);

  if (!title) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Add a title in the Builder tab to preview the survey.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-muted-foreground text-sm mt-2 leading-relaxed">{description}</p>}
      </div>

      {sectionGroups.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No questions added yet.
        </div>
      ) : sectionGroups.map(({ section, questions: sqs }) => (
        <div key={section.localId} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {sections.length > 1 && (
            <div className="px-6 py-3 bg-secondary/50 border-b border-border">
              <h2 className="font-heading text-base font-semibold text-foreground">{section.title}</h2>
            </div>
          )}
          <div className="p-6 space-y-6">
            {sqs.filter((q) => isVisible(q)).map((q, idx) => (
              <div key={q.localId} className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  {idx + 1}.{" "}
                  {q.question_text
                    ? q.question_text
                    : <span className="italic text-muted-foreground">(untitled question)</span>}
                  {q.is_required && <span className="text-danger ml-1">*</span>}
                </Label>

                {q.question_type === "text" && (
                  <Textarea
                    placeholder="Your answer…"
                    rows={2}
                    value={(answers[q.localId] as string) ?? ""}
                    onChange={(e) => setAnswer(q.localId, e.target.value)}
                    className="focus-visible:ring-primary/30 resize-none text-sm"
                  />
                )}

                {q.question_type === "rating" && (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAnswer(q.localId, String(n))}
                        className={cn(
                          "w-10 h-10 rounded-full border text-sm font-medium transition-colors",
                          answers[q.localId] === String(n)
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}

                {q.question_type === "multiple_choice" && (
                  <div className="space-y-2">
                    {q.options.filter((o) => o.trim()).map((opt, i) => (
                      <div
                        key={i}
                        onClick={() => setAnswer(q.localId, opt)}
                        className="flex items-center gap-2.5 cursor-pointer group"
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                          answers[q.localId] === opt ? "border-primary" : "border-border group-hover:border-primary/50",
                        )}>
                          {answers[q.localId] === opt && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className="text-sm text-foreground">{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.question_type === "checkbox" && (
                  <div className="space-y-2">
                    {q.options.filter((o) => o.trim()).map((opt, i) => {
                      const checked = Array.isArray(answers[q.localId]) && (answers[q.localId] as string[]).includes(opt);
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            const prev = (answers[q.localId] as string[]) ?? [];
                            setAnswer(q.localId, checked ? prev.filter((p) => p !== opt) : [...prev, opt]);
                          }}
                          className="flex items-center gap-2.5 cursor-pointer group"
                        >
                          <div className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                            checked ? "border-primary bg-primary" : "border-border group-hover:border-primary/50",
                          )}>
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="text-sm text-foreground">{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <Button className="bg-primary hover:bg-primary-dark text-primary-foreground" disabled>
          Submit (preview only)
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SurveysPage() {
  const [view, setView]         = useState<"list" | "builder">("list");
  const [surveys, setSurveys]   = useState<Survey[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [barangays, setBarangays] = useState<BarangayOption[]>([]);
  const [programs, setPrograms]   = useState<{ id: string; title: string; status: string }[]>([]);

  // Builder state
  const [editId, setEditId]             = useState<string | null>(null);
  const [builderTab, setBuilderTab]     = useState<BuilderTab>("builder");
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderTitle, setBuilderTitle] = useState("");
  const [builderDesc, setBuilderDesc]   = useState("");
  const [sections, setSections]         = useState<LocalSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string>("");
  // Section drawer (add / edit)
  const [sectionDrawerOpen, setSectionDrawerOpen]   = useState(false);
  const [drawerSectionId, setDrawerSectionId]       = useState<string | null>(null);
  const [drawerTitle, setDrawerTitle]               = useState("");
  const [drawerCategory, setDrawerCategory]         = useState("");
  const [drawerDefaultType, setDrawerDefaultType]   = useState<QuestionType>("text");
  const [questions, setQuestions]       = useState<LocalQuestion[]>([]);
  const [settings, setSettings]         = useState<SurveySettings>(DEFAULT_SETTINGS);

  // Create survey sheet
  const [createSheetOpen, setCreateSheetOpen]         = useState(false);
  const [createTitle, setCreateTitle]                 = useState("");
  const [createDesc, setCreateDesc]                   = useState("");
  const [createBarangayId, setCreateBarangayId]       = useState("");
  const [selectedTemplateId, setSelectedTemplateId]   = useState<string | null>(null);

  // Templates (persisted in localStorage)
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/surveys");
    if (res.ok) { const j = await res.json(); setSurveys(j.data ?? []); }
    else toast.error("Failed to load surveys.");
    setLoading(false);
  }, []);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  useEffect(() => {
    fetch("/api/partnerships")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.data) setBarangays(j.data.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Pull programs for the "Program Linkage" picker in the Settings tab.
    fetch("/api/programs")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (j?.data) setPrograms(
          j.data.map((p: { id: string; title: string; status: string }) => ({
            id: p.id, title: p.title, status: p.status,
          }))
        );
      })
      .catch(() => {});
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/survey-templates");
      if (res.ok) { const j = await res.json(); setTemplates(j.data ?? []); }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // ── Section helpers ────────────────────────────────────────────────────────────

  function openAddSection() {
    setDrawerSectionId(null);
    setDrawerTitle("");
    setDrawerCategory("");
    setDrawerDefaultType("text");
    setSectionDrawerOpen(true);
  }

  function openEditSection(sec: LocalSection) {
    setDrawerSectionId(sec.localId);
    setDrawerTitle(sec.title);
    setDrawerCategory(sec.category);
    setDrawerDefaultType(sec.defaultQuestionType);
    setSectionDrawerOpen(true);
  }

  function commitSectionDrawer() {
    const title = drawerTitle.trim() || "New Section";
    if (drawerSectionId) {
      setSections((prev) => prev.map((s) =>
        s.localId === drawerSectionId
          ? { ...s, title, category: drawerCategory, defaultQuestionType: drawerDefaultType }
          : s
      ));
    } else {
      const sec: LocalSection = {
        localId: makeId(), title,
        category: drawerCategory,
        defaultQuestionType: drawerDefaultType,
      };
      setSections((prev) => [...prev, sec]);
      setActiveSectionId(sec.localId);
    }
    setSectionDrawerOpen(false);
  }

  function deleteSection(localId: string) {
    if (sections.length === 1) { toast.error("Cannot delete the last section."); return; }
    setSections((prev) => prev.filter((s) => s.localId !== localId));
    setQuestions((prev) => prev.filter((q) => q.section_local_id !== localId));
    if (activeSectionId === localId) {
      setActiveSectionId(sections.find((s) => s.localId !== localId)?.localId ?? "");
    }
  }

  // ── Question helpers ──────────────────────────────────────────────────────────

  function addQuestion() {
    const sec = sections.find((s) => s.localId === activeSectionId);
    const qt  = sec?.defaultQuestionType ?? "text";
    setQuestions((prev) => [...prev, {
      localId:          makeId(),
      question_text:    "",
      question_type:    qt,
      options:          (qt === "multiple_choice" || qt === "checkbox") ? [""] : [],
      is_required:      false,
      section_local_id: activeSectionId,
    }]);
  }

  function updateQuestion(localId: string, updates: Partial<LocalQuestion>) {
    setQuestions((prev) => prev.map((q) => q.localId === localId ? { ...q, ...updates } : q));
  }

  function deleteQuestion(localId: string) {
    setQuestions((prev) => prev.filter((q) => q.localId !== localId));
  }

  function moveQuestion(localId: string, dir: "up" | "down") {
    const sqs = questions.filter((q) => q.section_local_id === activeSectionId);
    const idx  = sqs.findIndex((q) => q.localId === localId);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sqs.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      const iA   = next.findIndex((q) => q.localId === sqs[idx].localId);
      const iB   = next.findIndex((q) => q.localId === sqs[swap].localId);
      [next[iA], next[iB]] = [next[iB], next[iA]];
      return next;
    });
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  async function saveAsTemplate() {
    if (!builderTitle.trim()) { toast.error("Add a title before saving as template."); return; }
    const res = await fetch("/api/survey-templates", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name:        builderTitle.trim(),
        description: builderDesc.trim(),
        sections,
        questions:   questions.map(({ dbId, ...q }) => {
          void dbId;
          return q;
        }),
      }),
    });
    if (res.ok) {
      toast.success(`Template "${builderTitle.trim()}" saved.`);
      await fetchTemplates();
    } else {
      toast.error("Failed to save template.");
    }
  }

  async function deleteTemplate(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id)); // optimistic
    const res = await fetch(`/api/survey-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete template.");
      await fetchTemplates(); // revert on failure
    }
  }

  // ── Open builder ──────────────────────────────────────────────────────────────

  function openCreate() {
    setCreateTitle("");
    setCreateDesc("");
    setCreateBarangayId("");
    setSelectedTemplateId(null);
    setCreateSheetOpen(true);
  }

  function startSurvey() {
    if (!createTitle.trim()) { toast.error("Survey title is required."); return; }

    setEditId(null);
    setBuilderTitle(createTitle.trim());
    setBuilderDesc(createDesc.trim());
    setSettings({ ...DEFAULT_SETTINGS, target_barangay_id: createBarangayId });

    const template = selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) : null;

    if (template) {
      // Remap section IDs so they're fresh local IDs
      const sectionIdMap = new Map<string, string>();
      const newSections = template.sections.map((s) => {
        const newId = makeId();
        sectionIdMap.set(s.localId, newId);
        return { ...s, localId: newId };
      });

      // Remap question IDs (including conditional_on references)
      const questionIdMap = new Map<string, string>();
      template.questions.forEach((q) => questionIdMap.set(q.localId, makeId()));

      const newQuestions: LocalQuestion[] = template.questions.map((q) => ({
        ...q,
        localId:          questionIdMap.get(q.localId)!,
        dbId:             undefined,
        section_local_id: sectionIdMap.get(q.section_local_id) ?? newSections[0].localId,
        conditional_on:   q.conditional_on ? questionIdMap.get(q.conditional_on) : undefined,
      }));

      setSections(newSections);
      setActiveSectionId(newSections[0]?.localId ?? "");
      setQuestions(newQuestions);
    } else {
      const sec: LocalSection = { localId: makeId(), title: DEFAULT_SECTION_TITLE, category: "", defaultQuestionType: "text" };
      setSections([sec]);
      setActiveSectionId(sec.localId);
      setQuestions([]);
    }

    setBuilderTab("builder");
    setCreateSheetOpen(false);
    setView("builder");
  }

  async function openEdit(id: string) {
    setEditId(id);
    setBuilderTab("builder");
    setBuilderLoading(true);
    setView("builder");

    const res = await fetch(`/api/surveys/${id}`);
    if (!res.ok) { toast.error("Failed to load survey."); setBuilderLoading(false); return; }

    const j: { data: SurveyDetail } = await res.json();
    const d = j.data;

    setBuilderTitle(d.title);
    setBuilderDesc(d.description ?? "");
    setSettings({
      target_barangay_id: d.target_barangay_id ?? "",
      opens_at:           d.opens_at  ? d.opens_at.slice(0, 16)  : "",
      closes_at:          d.closes_at ? d.closes_at.slice(0, 16) : "",
      is_anonymous:       d.is_anonymous    ?? false,
      is_editable:        d.is_editable     ?? false,
      reminder_enabled:   d.reminder_enabled ?? false,
      submission_type:    d.submission_type ?? "once",
      methodology:        d.methodology     ?? "quantitative",
      parent_survey_id:   d.parent_survey_id ?? "",
      program_id:         d.program_id ?? "",
    });

    // Reconstruct sections from question section_title order
    const dbQs = d.survey_questions ?? [];
    const seenTitles: string[] = [];
    dbQs.forEach((q) => {
      const t = q.section_title ?? DEFAULT_SECTION_TITLE;
      if (!seenTitles.includes(t)) seenTitles.push(t);
    });
    if (seenTitles.length === 0) seenTitles.push(DEFAULT_SECTION_TITLE);

    const newSections: LocalSection[] = seenTitles.map((t) => ({
      localId: makeId(), title: t, category: "", defaultQuestionType: "text" as QuestionType,
    }));
    setSections(newSections);
    setActiveSectionId(newSections[0].localId);

    // Map DB questions → local questions
    // localId = dbId so conditional_on (which contains a DB UUID) works directly
    const localQs: LocalQuestion[] = dbQs.map((q) => {
      const secTitle = q.section_title ?? DEFAULT_SECTION_TITLE;
      const sec = newSections.find((s) => s.title === secTitle) ?? newSections[0];
      return {
        localId:          q.id,
        dbId:             q.id,
        question_text:    q.question_text,
        question_type:    q.question_type,
        options:          q.options ?? [],
        is_required:      q.is_required,
        section_local_id: sec.localId,
        conditional_on:   q.conditions?.on_question_id,
        conditional_value: q.conditions?.on_value,
      };
    });
    setQuestions(localQs);
    setBuilderLoading(false);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function saveSurvey(status: "draft" | "published") {
    if (!builderTitle.trim()) {
      toast.error("Survey title is required.");
      setBuilderTab("builder");
      return;
    }
    setSaving(true);

    const flatQuestions = questions.map((q, i) => ({
      question_text:          q.question_text,
      question_type:          q.question_type,
      options:                q.options.filter((o) => o.trim()),
      is_required:            q.is_required,
      section_title:          sections.find((s) => s.localId === q.section_local_id)?.title ?? DEFAULT_SECTION_TITLE,
      order_index:            i,
      // Reference by position index so server can resolve to DB ID after insert
      conditions: q.conditional_on && q.conditional_value
        ? { on_question_index: questions.findIndex((qq) => qq.localId === q.conditional_on), on_value: q.conditional_value }
        : null,
    }));

    const payload = {
      title:              builderTitle.trim(),
      description:        builderDesc.trim() || null,
      status:             "draft" as const,
      target_barangay_id: settings.target_barangay_id || null,
      opens_at:           settings.opens_at  || null,
      closes_at:          settings.closes_at || null,
      is_anonymous:       settings.is_anonymous,
      is_editable:        settings.is_editable,
      reminder_enabled:   settings.reminder_enabled,
      submission_type:    settings.submission_type,
      methodology:        settings.methodology,
      parent_survey_id:   settings.parent_survey_id || null,
      program_id:         settings.program_id || null,
      questions:          flatQuestions,
    };

    const res = editId
      ? await fetch(`/api/surveys/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/surveys",            { method: "POST",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    if (res.ok) {
      const saved = await res.json().catch(() => ({}));
      const savedId = editId ?? saved.data?.id;
      if (status === "published" && savedId) {
        const publish = await fetch(`/api/surveys/${savedId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_status: "draft", status: "published" }) });
        if (!publish.ok) { const issue = await publish.json().catch(() => ({})); toast.error(issue.error ?? "Draft saved, but publishing failed."); setSaving(false); return; }
      }
      toast.success(status === "published" ? "Survey saved and published." : "Draft saved.");
      await fetchSurveys();
      setView("list");
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to save survey.");
    }
    setSaving(false);
  }

  // ── List actions ──────────────────────────────────────────────────────────────

  async function changeStatus(id: string, status: SurveyStatus) {
    setActionId(id);
    const current = surveys.find((survey) => survey.id === id)?.status;
    if (!current || current === "closed") { setActionId(null); return; }
    const res = await fetch(`/api/surveys/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_status: current, status }),
    });
    if (res.ok) {
      setSurveys((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
      toast.success(`Survey ${status}.`);
    } else toast.error("Action failed.");
    setActionId(null);
  }

  // Must be before any early return so hook count is stable across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredSurveys = useMemo(() => {
    const q = search.toLowerCase();
    return surveys.filter((s) => {
      const matchQ    = s.title.toLowerCase().includes(q);
      const matchS    = statusFilter === "all" || s.status === statusFilter;
      const created   = s.created_at.slice(0, 10);
      const matchFrom = !dateFrom || created >= dateFrom;
      const matchTo   = !dateTo   || created <= dateTo;
      return matchQ && matchS && matchFrom && matchTo;
    });
  }, [surveys, search, statusFilter, dateFrom, dateTo]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Builder view
  // ─────────────────────────────────────────────────────────────────────────────

  if (view === "builder") {
    const activeSection = sections.find((s) => s.localId === activeSectionId);
    const activeSectionQuestions = questions.filter((q) => q.section_local_id === activeSectionId);

    return (
      <div className="space-y-4">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("list")} className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <h2 className="font-heading text-xl font-semibold text-foreground">
            {editId ? "Edit Survey" : "New Survey"}
          </h2>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={saveAsTemplate} className="gap-1.5 text-muted-foreground hover:text-foreground hidden sm:flex">
              <Bookmark className="w-4 h-4" /> Save as Template
            </Button>
            <Button variant="outline" disabled={saving} onClick={() => saveSurvey("draft")}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Draft
            </Button>
            <Button disabled={saving} className="bg-primary hover:bg-primary-dark text-primary-foreground gap-2" onClick={() => saveSurvey("published")}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Globe className="w-4 h-4" /> Publish
            </Button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center border-b border-border gap-1">
          {(["builder", "settings", "preview"] as BuilderTab[]).map((t) => {
            const meta: Record<BuilderTab, { icon: React.ReactNode; label: string }> = {
              builder:  { icon: <LayoutList className="w-4 h-4" />, label: "Builder" },
              settings: { icon: <Settings  className="w-4 h-4" />, label: "Settings" },
              preview:  { icon: <Eye       className="w-4 h-4" />, label: "Preview" },
            };
            return (
              <button
                key={t}
                onClick={() => setBuilderTab(t)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  builderTab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                {meta[t].icon} {meta[t].label}
              </button>
            );
          })}
        </div>

        {builderLoading ? (
          <div className="py-20 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading survey…
          </div>
        ) : (
          <>
            {/* ── BUILDER TAB ── */}
            {builderTab === "builder" && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                {/* Left sidebar */}
                <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
                  <Card className="border-border shadow-card">
                    <CardContent className="p-4 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="s-title" className="text-xs">Title <span className="text-danger">*</span></Label>
                        <Input
                          id="s-title"
                          placeholder="Survey title…"
                          value={builderTitle}
                          onChange={(e) => setBuilderTitle(e.target.value)}
                          className="focus-visible:ring-primary/30 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-desc" className="text-xs">Description</Label>
                        <Textarea
                          id="s-desc"
                          placeholder="Brief description…"
                          rows={2}
                          value={builderDesc}
                          onChange={(e) => setBuilderDesc(e.target.value)}
                          className="focus-visible:ring-primary/30 resize-none text-sm"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border shadow-card">
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Sections</p>
                      <div className="space-y-0.5">
                        {sections.map((sec) => (
                          <div
                            key={sec.localId}
                            onClick={() => setActiveSectionId(sec.localId)}
                            className={cn(
                              "flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer group transition-colors",
                              activeSectionId === sec.localId ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground",
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{sec.title}</p>
                              {sec.category && (
                                <p className="text-[10px] text-muted-foreground truncate capitalize">{sec.category}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                              {questions.filter((q) => q.section_local_id === sec.localId).length}
                            </span>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditSection(sec); }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              {sections.length > 1 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteSection(sec.localId); }}
                                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-danger/10 hover:text-danger transition-colors"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={openAddSection}
                        className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 mt-1 rounded-lg hover:bg-muted"
                      >
                        <Plus className="w-3 h-3" /> Add section
                      </button>
                    </CardContent>
                  </Card>

                  <Card className="border-border shadow-card">
                    <CardContent className="px-4 py-2.5">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{questions.length}</span> question{questions.length !== 1 ? "s" : ""}{" "}
                        across{" "}
                        <span className="font-semibold text-foreground">{sections.length}</span> section{sections.length !== 1 ? "s" : ""}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Questions panel */}
                <div className="lg:col-span-3 space-y-3">
                  {activeSection && (
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-heading text-sm font-semibold text-foreground">{activeSection.title}</h3>
                      {activeSection.category && (
                        <Badge className="text-[10px] bg-accent/10 text-accent-foreground border border-accent/20 gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          <span className="capitalize">{activeSection.category}</span>
                        </Badge>
                      )}
                      <Badge className="text-[10px] bg-muted text-muted-foreground border">
                        {activeSectionQuestions.length} question{activeSectionQuestions.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  )}

                  {activeSectionQuestions.length === 0 ? (
                    <Card className="border-border border-dashed shadow-none">
                      <CardContent className="py-14 text-center text-muted-foreground text-sm">
                        No questions in this section yet.<br />
                        Click &ldquo;Add Question&rdquo; below to get started.
                      </CardContent>
                    </Card>
                  ) : activeSectionQuestions.map((q, i) => (
                    <QuestionCard
                      key={q.localId}
                      q={q}
                      index={i}
                      total={activeSectionQuestions.length}
                      allQuestions={questions}
                      onChange={(updates) => updateQuestion(q.localId, updates)}
                      onDelete={() => deleteQuestion(q.localId)}
                      onMove={(dir) => moveQuestion(q.localId, dir)}
                    />
                  ))}

                  <Button
                    variant="outline"
                    onClick={addQuestion}
                    className="w-full gap-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary"
                  >
                    <Plus className="w-4 h-4" /> Add Question
                  </Button>
                </div>
              </div>
            )}

            {/* ── SETTINGS TAB ── */}
            {builderTab === "settings" && (
              <div className="max-w-xl space-y-6">
                <Card className="border-border shadow-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-heading">Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="set-barangay">Target Barangay</Label>
                      <select
                        id="set-barangay"
                        value={settings.target_barangay_id}
                        onChange={(e) => setSettings((p) => ({ ...p, target_barangay_id: e.target.value }))}
                        className="w-full h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                      >
                        <option value="">All barangays</option>
                        {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="set-opens">Open Date</Label>
                        <input
                          id="set-opens"
                          type="datetime-local"
                          value={settings.opens_at}
                          onChange={(e) => setSettings((p) => ({ ...p, opens_at: e.target.value }))}
                          className="w-full h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="set-closes">Close Date</Label>
                        <input
                          id="set-closes"
                          type="datetime-local"
                          value={settings.closes_at}
                          onChange={(e) => setSettings((p) => ({ ...p, closes_at: e.target.value }))}
                          className="w-full h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Program Linkage — attaches the survey to a specific program
                    so it appears in the program detail and scopes analytics. */}
                <Card className="border-border shadow-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-heading">Program Linkage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Label htmlFor="set-program" className="text-sm mb-2 block">
                      Link to program
                      <span className="text-muted-foreground font-normal ml-1">
                        (optional — attach this survey to an existing program for baseline / endline / monitoring)
                      </span>
                    </Label>
                    <select
                      id="set-program"
                      value={settings.program_id}
                      onChange={(e) => setSettings((p) => ({ ...p, program_id: e.target.value }))}
                      className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                    >
                      <option value="">— None (standalone / community-wide) —</option>
                      {programs.length === 0 ? (
                        <option value="" disabled>No programs available</option>
                      ) : (
                        programs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}{p.status && p.status !== "active" ? ` · ${p.status}` : ""}
                          </option>
                        ))
                      )}
                    </select>
                    {settings.program_id && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Responses to this survey will be associated with the linked program for
                        impact analytics and program reporting.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border shadow-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-heading">Methodology</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Label className="text-sm mb-2 block">
                      Research approach
                      <span className="text-muted-foreground font-normal ml-1">
                        (tags the survey so analytics applies the right lens)
                      </span>
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(["quantitative", "qualitative", "mixed"] as Methodology[]).map((m) => (
                        <button
                          type="button"
                          key={m}
                          onClick={() => setSettings((p) => ({ ...p, methodology: m }))}
                          className={cn(
                            "p-3 rounded-xl border text-left transition-colors",
                            settings.methodology === m
                              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                              : "border-border bg-card hover:bg-muted/40"
                          )}
                        >
                          <p className="text-sm font-medium text-foreground">{METHODOLOGY_LABEL[m]}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {m === "quantitative" && "Closed questions, Likert, multiple choice"}
                            {m === "qualitative"  && "Open-ended, interview, FGD-style"}
                            {m === "mixed"        && "Combines both — needs thematic coding + stats"}
                          </p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Pre/Post linking — declare this survey as a follow-up to an
                    earlier baseline. Pre/Post Compare uses this to align them
                    question-by-question. */}
                <Card className="border-border shadow-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-heading">Pre / Post Pairing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Label className="text-sm mb-2 block">
                      Baseline survey (optional)
                      <span className="text-muted-foreground font-normal ml-1">
                        — link this as a follow-up to a prior survey for Pre/Post Compare
                      </span>
                    </Label>
                    <select
                      value={settings.parent_survey_id}
                      onChange={(e) => setSettings((p) => ({ ...p, parent_survey_id: e.target.value }))}
                      className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">— None (this is a baseline / standalone) —</option>
                      {surveys
                        .filter((s) => s.id !== editId)
                        .map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  </CardContent>
                </Card>

                <Card className="border-border shadow-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-heading">Submission Options</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <Label className="text-sm mb-3 block">Submission limit</Label>
                      <div className="flex gap-4">
                        {(["once", "multiple"] as SubmissionType[]).map((t) => (
                          <div
                            key={t}
                            onClick={() => setSettings((p) => ({ ...p, submission_type: t }))}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0",
                              settings.submission_type === t ? "border-primary" : "border-border",
                            )}>
                              {settings.submission_type === t && <div className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                            <span className="text-sm">{t === "once" ? "Once per respondent" : "Multiple submissions"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {(["is_anonymous", "is_editable", "reminder_enabled"] as const).map((key) => {
                      const labels = {
                        is_anonymous:     { title: "Hide respondent identity in routine views", desc: "Responses remain pseudonymous for integrity and authorized corrections; this is not irreversible anonymization." },
                        is_editable:      { title: "Allow editing",        desc: "Respondents can edit answers after submission" },
                        reminder_enabled: { title: "Send reminders",       desc: "Notify respondents who haven't submitted near the close date" },
                      };
                      const on = settings[key];
                      return (
                        <div key={key} className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">{labels[key].title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{labels[key].desc}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => setSettings((p) => ({ ...p, [key]: !p[key] }))}
                            className={cn(
                              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                              on ? "bg-primary" : "bg-border",
                            )}
                          >
                            <span className={cn(
                              "pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                              on ? "translate-x-4" : "translate-x-0",
                            )} />
                          </button>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── PREVIEW TAB ── */}
            {builderTab === "preview" && (
              <SurveyPreview
                title={builderTitle}
                description={builderDesc}
                sections={sections}
                questions={questions}
              />
            )}
          </>
        )}

        {/* ── Section Drawer ── */}
        <Sheet open={sectionDrawerOpen} onOpenChange={setSectionDrawerOpen}>
          <SheetContent side="right" className="w-80 sm:w-[360px] flex flex-col p-0">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
              <SheetTitle className="font-heading text-lg">
                {drawerSectionId ? "Edit Section" : "New Section"}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {drawerSectionId
                  ? "Update this section's title, category, and default question type."
                  : "Configure the section before adding questions to it."}
              </p>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="drawer-title" className="text-sm font-semibold flex items-center gap-1.5">
                  Section Title <span className="text-danger">*</span>
                </Label>
                <Input
                  id="drawer-title"
                  placeholder="e.g. Household Information"
                  value={drawerTitle}
                  onChange={(e) => setDrawerTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitSectionDrawer(); }}
                  className="focus-visible:ring-primary/30"
                  autoFocus
                />
              </div>

              <div className="border-t border-border" />

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="drawer-category" className="text-sm font-semibold flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  Category
                </Label>
                <p className="text-xs text-muted-foreground">
                  Tag this section by community needs area for easier analysis
                </p>
                <select
                  id="drawer-category"
                  value={drawerCategory}
                  onChange={(e) => setDrawerCategory(e.target.value)}
                  className="w-full h-10 px-3 text-sm rounded-xl border border-border bg-card text-foreground
                             outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 cursor-pointer"
                >
                  {SECTION_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="border-t border-border" />

              {/* Default question type */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-semibold">Default Question Type</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    New questions added to this section will start with this type
                  </p>
                </div>
                <div className="space-y-2">
                  {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([val, label]) => (
                    <div
                      key={val}
                      onClick={() => setDrawerDefaultType(val)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                        drawerDefaultType === val ? "border-primary" : "border-border",
                      )}>
                        {drawerDefaultType === val && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <span className="text-sm text-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <SheetFooter className="flex-col gap-2.5 px-6 py-5 border-t border-border">
              <Button
                onClick={commitSectionDrawer}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {drawerSectionId ? "Save Changes" : "Add Section"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSectionDrawerOpen(false)}
                className="w-full"
              >
                Cancel
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // List view
  // ─────────────────────────────────────────────────────────────────────────────

  const counts = {
    total:     surveys.length,
    draft:     surveys.filter((s) => s.status === "draft").length,
    published: surveys.filter((s) => s.status === "published").length,
    closed:    surveys.filter((s) => s.status === "closed").length,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total",     value: counts.total,     accent: "border-l-primary" },
          { label: "Draft",     value: counts.draft,     accent: "border-l-muted-foreground" },
          { label: "Published", value: counts.published, accent: "border-l-success" },
          { label: "Closed",    value: counts.closed,    accent: "border-l-danger" },
        ].map((c) => (
          <Card key={c.label} className={`border-border shadow-card border-l-4 ${c.accent}`}>
            <CardContent className="px-4 py-2.5">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold font-heading text-foreground mt-0.5">{loading ? "—" : c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-lg">Surveys</CardTitle>
              <Button onClick={openCreate} className="bg-primary hover:bg-primary-dark text-primary-foreground gap-2">
                <Plus className="w-4 h-4" /> Create Survey
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Search surveys…" className="pl-9 h-9 w-52 focus-visible:ring-primary/30" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9">
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="closed">Closed</option>
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="Created from" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" title="Created to" />
              {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/30">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Survey</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Questions</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
                  </td></tr>
                ) : filteredSurveys.length === 0 ? (
                  <tr><td colSpan={4} className="py-16 text-center text-muted-foreground">
                    {surveys.length === 0 ? "No surveys yet. Click \"Create Survey\" to build one." : "No surveys match your filters."}
                  </td></tr>
                ) : filteredSurveys.map((s, i) => (
                  <tr key={s.id} className={`border-b border-border/60 hover:bg-muted/20 transition-colors ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                    <td className="py-3 px-4">
                      <p className="font-medium text-foreground">{s.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                      <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{s.survey_questions?.length ?? 0}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className={STATUS_STYLES[s.status] + " capitalize"}>{s.status}</Badge>
                        {s.methodology && s.methodology !== "quantitative" && (
                          <Badge className={`${METHODOLOGY_BADGE[s.methodology]} text-[10px]`} title="Research methodology">
                            {METHODOLOGY_LABEL[s.methodology]}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={actionId === s.id}
                          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {actionId === s.id
                            ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            : <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          }
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openEdit(s.id)}>
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            {s.status === "draft" && (
                              <DropdownMenuItem className="gap-2 cursor-pointer text-success" onClick={() => changeStatus(s.id, "published")}>
                                <Globe className="w-3.5 h-3.5" /> Publish
                              </DropdownMenuItem>
                            )}
                            {s.status === "published" && (
                              <DropdownMenuItem className="gap-2 cursor-pointer text-warning" onClick={() => changeStatus(s.id, "closed")}>
                                <XCircle className="w-3.5 h-3.5" /> Close
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && surveys.length > 0 && (
            <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
              {filteredSurveys.length} of {surveys.length} surveys
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Survey Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle className="font-heading text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> New Survey
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Fill in the basics, then optionally pick a template to pre-fill your sections and questions.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

            {/* Survey Details */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Survey Details</p>

              <div className="space-y-1.5">
                <Label htmlFor="cs-title" className="text-sm font-medium">
                  Title <span className="text-danger">*</span>
                </Label>
                <Input
                  id="cs-title"
                  placeholder="e.g. Community Needs Assessment 2026"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") startSurvey(); }}
                  autoFocus
                  className="focus-visible:ring-primary/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cs-desc" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="cs-desc"
                  placeholder="Brief description of what this survey covers…"
                  rows={3}
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  className="resize-none focus-visible:ring-primary/30 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cs-barangay" className="text-sm font-medium">Target Barangay</Label>
                <select
                  id="cs-barangay"
                  value={createBarangayId}
                  onChange={(e) => setCreateBarangayId(e.target.value)}
                  className="w-full h-10 px-3 text-sm rounded-xl border border-border bg-card text-foreground
                             outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 cursor-pointer"
                >
                  <option value="">All barangays</option>
                  {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Template picker */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start from Template</p>
              </div>

              {templates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  No templates yet. Build a survey and click{" "}
                  <span className="font-medium text-foreground">Save as Template</span>{" "}
                  in the builder to create one.
                </div>
              ) : (
                <div className="space-y-2">
                  {templates
                    .slice()
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .map((t) => {
                      const isSelected = selectedTemplateId === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTemplateId(isSelected ? null : t.id)}
                          className={cn(
                            "relative flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all duration-150 group",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                            isSelected ? "border-primary" : "border-border",
                          )}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground leading-snug truncate">{t.name}</p>
                            {t.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[11px] text-muted-foreground">
                                {t.sections.length} section{t.sections.length !== 1 ? "s" : ""}
                              </span>
                              <span className="text-[10px] text-muted-foreground/50">·</span>
                              <span className="text-[11px] text-muted-foreground">
                                {t.questions.length} question{t.questions.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            {t.sections.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {t.sections.slice(0, 3).map((s) => (
                                  <span key={s.localId} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                                    {s.title}
                                  </span>
                                ))}
                                {t.sections.length > 3 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                                    +{t.sections.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}
                            className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-danger/10 hover:text-danger text-muted-foreground transition-all"
                            title="Delete template"
                          >
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

          </div>

          <SheetFooter className="flex-col gap-2.5 px-6 py-5 border-t border-border">
            <Button
              onClick={startSurvey}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            >
              {selectedTemplateId ? (
                <><LayoutTemplate className="w-4 h-4" /> Use Template &amp; Build</>
              ) : (
                <><Plus className="w-4 h-4" /> Start from Scratch</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setCreateSheetOpen(false)}
              className="w-full"
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

    </div>
  );
}
