import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { matchSurveyQuestions, surveyDistribution, type SurveyAnswer } from "@/lib/surveys/analysis";

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
  const { data: survey, error: surveyError } = await adminDb
    .from("surveys")
    .select("id, title, description, status, survey_questions(id, question_text, question_type, options, section_title, order_index)")
    .eq("id", surveyId)
    .maybeSingle();

  if (surveyError) throw new Error("Survey comparison unavailable");
  if (!survey) return null;

  const { data: responses, error: responseError } = await adminDb
    .from("survey_responses")
    .select("id, excluded")
    .eq("survey_id", surveyId);
  if (responseError) throw new Error("Survey comparison unavailable");

  const allResponses = (responses ?? []) as ResponseRow[];
  const valid        = allResponses.filter((r) => !r.excluded);
  const validIds     = valid.map((r) => r.id);

  let answers: SurveyAnswer[] = [];
  if (validIds.length > 0) {
    const { data, error } = await adminDb
      .from("survey_answers")
      .select("question_id, answer_text, answer_options")
      .in("response_id", validIds);
    if (error) throw new Error("Survey comparison unavailable");
    answers = (data ?? []) as SurveyAnswer[];
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

  try {
  const adminDb = createAdminClient();
  const [base, foll] = await Promise.all([
    loadSurveyData(adminDb, baselineId),
    loadSurveyData(adminDb, followupId),
  ]);

  if (!base || !foll) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  const { pairs, baselineOnly, followupOnly } = matchSurveyQuestions(base.questions, foll.questions);
  const matched = pairs.map(({ baseline: bq, followup: fq }) => {
    const baseDist = surveyDistribution(bq, base.answers);
    const follDist = surveyDistribution(fq, foll.answers);
    return {
      question_text: fq.question_text,
      question_type: fq.question_type,
      section_title: fq.section_title,
      baseline:      baseDist,
      followup:      follDist,
      avg_delta: (baseDist.average != null && follDist.average != null)
        ? Math.round((follDist.average - baseDist.average) * 100) / 100
        : null,
    };
  });

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
  } catch {
    return NextResponse.json({ error: "Unable to load the survey comparison" }, { status: 503 });
  }
}
