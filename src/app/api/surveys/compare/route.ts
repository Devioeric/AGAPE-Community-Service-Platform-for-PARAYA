import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/surveys/compare?baseline=<id>&followup=<id>
// Pre/post analysis at the *population* level — matches questions across two
// surveys by their question_text and returns side-by-side response
// distributions. Excluded responses are filtered the same way single-survey
// analytics does, so a scrubbed outlier doesn't poison the comparison.
//
// We deliberately don't try to match individual respondents: surveys in AGAPE
// have respondent_id pointing to the user who *submitted* the form, not the
// beneficiary it's about (the volunteer fills the form on the beneficiary's
// behalf). Aggregate distribution shift is the right granularity here, and
// it's how most program evaluations report results anyway.

interface DbQuestion {
  id:            string;
  question_text: string;
  question_type: string;
  options:       string[] | null;
  section_title: string | null;
  order_index:   number;
}

interface AnswerRow {
  question_id: string;
  answer_text: string;
}

interface ResponseRow {
  id:       string;
  excluded: boolean;
}

interface SurveyHead {
  id:          string;
  title:       string;
  description: string | null;
  status:      string;
}

async function loadSurveyData(adminDb: ReturnType<typeof createAdminClient>, surveyId: string) {
  const { data: survey } = await adminDb
    .from("surveys")
    .select("id, title, description, status, survey_questions(id, question_text, question_type, options, section_title, order_index)")
    .eq("id", surveyId)
    .single();

  if (!survey) return null;

  const { data: responses } = await adminDb
    .from("survey_responses")
    .select("id, excluded")
    .eq("survey_id", surveyId);

  const allResponses = (responses ?? []) as ResponseRow[];
  const valid        = allResponses.filter((r) => !r.excluded);
  const validIds     = valid.map((r) => r.id);

  let answers: AnswerRow[] = [];
  if (validIds.length > 0) {
    const { data } = await adminDb
      .from("survey_answers")
      .select("question_id, answer_text")
      .in("response_id", validIds);
    answers = (data ?? []) as AnswerRow[];
  }

  return {
    survey: {
      id:          survey.id as string,
      title:       survey.title as string,
      description: survey.description as string | null,
      status:      survey.status as string,
    } satisfies SurveyHead,
    questions:        ((survey.survey_questions ?? []) as DbQuestion[]).sort((a, b) => a.order_index - b.order_index),
    answers,
    response_count:   valid.length,
    excluded_count:   allResponses.length - valid.length,
  };
}

function distributionFor(q: DbQuestion, answers: AnswerRow[]) {
  const qAnswers = answers.filter((a) => a.question_id === q.id);
  const dist: { label: string; count: number; pct: number }[] = [];
  const total = qAnswers.length;

  if (q.question_type === "multiple_choice") {
    (q.options ?? []).forEach((opt) => {
      const count = qAnswers.filter((a) => a.answer_text === opt).length;
      dist.push({ label: opt, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 });
    });
  } else if (q.question_type === "checkbox") {
    (q.options ?? []).forEach((opt) => {
      const count = qAnswers.filter((a) => {
        try { return (JSON.parse(a.answer_text) as string[]).includes(opt); }
        catch { return a.answer_text?.includes(opt); }
      }).length;
      // For multi-select the percentage denominator is the response count.
      dist.push({ label: opt, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 });
    });
  } else if (q.question_type === "rating") {
    [1, 2, 3, 4, 5].forEach((n) => {
      const count = qAnswers.filter((a) => a.answer_text === String(n)).length;
      dist.push({ label: String(n), count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 });
    });
  }

  // Numeric average for rating questions
  let avg: number | null = null;
  if (q.question_type === "rating") {
    const nums = qAnswers.map((a) => Number(a.answer_text)).filter((n) => !isNaN(n) && n > 0);
    if (nums.length > 0) avg = Math.round((nums.reduce((s, x) => s + x, 0) / nums.length) * 100) / 100;
  }

  return { distribution: dist, response_count: total, average: avg };
}

export async function GET(request: Request) {
  const auth = await authorizeCapability("survey.analyze");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const baselineId = searchParams.get("baseline");
  const followupId = searchParams.get("followup");
  if (!baselineId || !followupId) {
    return NextResponse.json({ error: "Both baseline and followup survey ids are required." }, { status: 400 });
  }
  if (baselineId === followupId) {
    return NextResponse.json({ error: "Baseline and follow-up cannot be the same survey." }, { status: 400 });
  }

  const adminDb = createAdminClient();
  const [base, foll] = await Promise.all([
    loadSurveyData(adminDb, baselineId),
    loadSurveyData(adminDb, followupId),
  ]);

  if (!base || !foll) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  // Match questions by normalized text. Two questions with the same wording
  // across the baseline and follow-up are treated as the same item.
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const baseByKey = new Map<string, DbQuestion>();
  base.questions.forEach((q) => baseByKey.set(normalize(q.question_text), q));

  const matched: {
    question_text: string;
    question_type: string;
    section_title: string | null;
    baseline:      ReturnType<typeof distributionFor>;
    followup:      ReturnType<typeof distributionFor>;
    // Signed shift between baseline and follow-up averages, when both exist.
    avg_delta:     number | null;
  }[] = [];
  const followupOnly: DbQuestion[] = [];

  for (const fq of foll.questions) {
    const bq = baseByKey.get(normalize(fq.question_text));
    if (!bq) { followupOnly.push(fq); continue; }
    // Type must agree for the distributions to be comparable.
    if (bq.question_type !== fq.question_type) continue;
    const baseDist = distributionFor(bq, base.answers);
    const follDist = distributionFor(fq, foll.answers);
    matched.push({
      question_text: fq.question_text,
      question_type: fq.question_type,
      section_title: fq.section_title,
      baseline:      baseDist,
      followup:      follDist,
      avg_delta: (baseDist.average != null && follDist.average != null)
        ? Math.round((follDist.average - baseDist.average) * 100) / 100
        : null,
    });
    baseByKey.delete(normalize(fq.question_text));
  }
  const baselineOnly = Array.from(baseByKey.values());

  return NextResponse.json({
    data: {
      baseline:        base.survey,
      followup:        foll.survey,
      response_counts: { baseline: base.response_count, followup: foll.response_count },
      excluded_counts: { baseline: base.excluded_count, followup: foll.excluded_count },
      matched,
      // Questions that exist only on one side — surfaced as warnings so the
      // researcher knows the comparison is incomplete by design.
      unmatched: {
        baseline_only: baselineOnly.map((q) => ({ id: q.id, question_text: q.question_text, question_type: q.question_type })),
        followup_only: followupOnly.map((q) => ({ id: q.id, question_text: q.question_text, question_type: q.question_type })),
      },
    },
  });
}
