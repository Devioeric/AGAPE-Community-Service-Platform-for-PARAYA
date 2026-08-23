import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";

export async function GET(request: Request) {
  const auth = await authorizeCapability("survey.analyze");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.supabase;
  const adminDb  = createAdminClient();

  const { searchParams } = new URL(request.url);
  const surveyId        = searchParams.get("survey_id");
  // When true, flagged-as-excluded responses are included in the aggregates.
  // Default is false so analytics reflects the cleaned dataset.
  const includeExcluded = searchParams.get("include_excluded") === "1";

  // ── Detailed analysis for one survey ──────────────────────────────────────
  if (surveyId) {
    const [{ data: survey }, { data: responses, error: rErr }] = await Promise.all([
      supabase
        .from("surveys")
        .select("*, survey_questions(*), barangays(name)")
        .eq("id", surveyId)
        .order("order_index", { referencedTable: "survey_questions", ascending: true })
        .single(),
      adminDb
        .from("survey_responses")
        .select("id, submitted_at, excluded, exclusion_reason, excluded_at, respondent_id")
        .eq("survey_id", surveyId),
    ]);

    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

    const allResponses    = rErr ? [] : (responses ?? []);
    const excludedCount   = allResponses.filter((r) => r.excluded).length;
    const safeResponses   = includeExcluded ? allResponses : allResponses.filter((r) => !r.excluded);
    const responseIds     = safeResponses.map((r) => r.id);

    // Fetch answers for these responses
    type AnswerRow = { question_id: string; answer_text: string };
    let answers: AnswerRow[] = [];
    if (responseIds.length > 0) {
      const { data: ans } = await adminDb
        .from("survey_answers")
        .select("question_id, answer_text")
        .in("response_id", responseIds);
      answers = (ans ?? []) as AnswerRow[];
    }

    type DbQuestion = {
      id: string;
      question_text: string;
      question_type: string;
      options: string[] | null;
      section_title: string | null;
      is_required: boolean;
      order_index: number;
    };

    const questions = ((survey.survey_questions ?? []) as DbQuestion[])
      .sort((a, b) => a.order_index - b.order_index)
      .map((q) => {
        const qAnswers = answers.filter((a) => a.question_id === q.id);

        const distribution: { label: string; count: number }[] = [];

        if (q.question_type === "multiple_choice") {
          (q.options ?? []).forEach((opt) => {
            distribution.push({ label: opt, count: qAnswers.filter((a) => a.answer_text === opt).length });
          });
        } else if (q.question_type === "checkbox") {
          (q.options ?? []).forEach((opt) => {
            distribution.push({
              label: opt,
              count: qAnswers.filter((a) => {
                try { return (JSON.parse(a.answer_text) as string[]).includes(opt); }
                catch { return a.answer_text?.includes(opt); }
              }).length,
            });
          });
        } else if (q.question_type === "rating") {
          [1, 2, 3, 4, 5].forEach((n) => {
            distribution.push({ label: String(n), count: qAnswers.filter((a) => a.answer_text === String(n)).length });
          });
        }

        const numericVals = qAnswers.map((a) => Number(a.answer_text)).filter((n) => !isNaN(n) && n > 0);
        const average = numericVals.length > 0 ? numericVals.reduce((a, b) => a + b, 0) / numericVals.length : null;

        return {
          id:             q.id,
          question_text:  q.question_text,
          question_type:  q.question_type,
          options:        q.options,
          section_title:  q.section_title,
          is_required:    q.is_required,
          response_count: qAnswers.length,
          distribution,
          average:        average !== null ? Math.round(average * 100) / 100 : null,
        };
      });

    // Response timeline (group by month)
    const timelineMap = new Map<string, number>();
    safeResponses.forEach((r) => {
      if (!r.submitted_at) return;
      const d   = new Date(r.submitted_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      timelineMap.set(key, (timelineMap.get(key) ?? 0) + 1);
    });
    const timeline = Array.from(timelineMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, count]) => ({
        month: new Date(k + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        count,
      }));

    // Per-response summary so the analysis UI can list rows and offer a
    // flag-as-outlier action. Only ids, timestamps, and exclusion state — no
    // answer text here (those still come from /api/surveys/[id] when needed).
    const responseList = allResponses
      .sort((a, b) => new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime())
      .map((r) => ({
        id:               r.id,
        submitted_at:     r.submitted_at,
        excluded:         !!r.excluded,
        exclusion_reason: r.exclusion_reason ?? null,
        excluded_at:      r.excluded_at ?? null,
      }));

    return NextResponse.json({
      data: {
        survey: {
          id:                 survey.id,
          title:              survey.title,
          description:        survey.description,
          status:             survey.status,
          opens_at:           survey.opens_at,
          closes_at:          survey.closes_at,
          is_anonymous:       survey.is_anonymous,
          target_barangay_id: survey.target_barangay_id,
          barangay_name:      (survey.barangays as { name: string } | null)?.name ?? null,
          created_at:         survey.created_at,
        },
        response_count:  safeResponses.length,
        excluded_count:  excludedCount,
        include_excluded: includeExcluded,
        questions,
        timeline,
        responses:       responseList,
      },
    });
  }

  // ── Overview (all surveys) ─────────────────────────────────────────────────
  const [{ data: surveys }, { data: allResponses, error: arErr }] = await Promise.all([
    supabase
      .from("surveys")
      .select("id, title, status, created_at, published_at, opens_at, closes_at, target_barangay_id, barangays(name), survey_questions(id)")
      .order("created_at", { ascending: false }),
    adminDb
      .from("survey_responses")
      .select("survey_id, submitted_at, excluded"),
  ]);

  const rawAllResponses  = arErr ? [] : (allResponses ?? []);
  // Apply the same default — exclude flagged rows from the rollup unless
  // include_excluded=1 was passed.
  const safeAllResponses = includeExcluded ? rawAllResponses : rawAllResponses.filter((r) => !r.excluded);

  const surveyList = (surveys ?? []).map((s) => ({
    id:                 s.id,
    title:              s.title,
    status:             s.status,
    created_at:         s.created_at,
    published_at:       s.published_at,
    opens_at:           s.opens_at,
    closes_at:          s.closes_at,
    target_barangay_id: s.target_barangay_id,
    barangay_name:      (s.barangays as unknown as { name: string } | null)?.name ?? null,
    question_count:     (s.survey_questions as { id: string }[] | null)?.length ?? 0,
    response_count:     safeAllResponses.filter((r) => r.survey_id === s.id).length,
  }));

  const summary = {
    total:           surveyList.length,
    draft:           surveyList.filter((s) => s.status === "draft").length,
    published:       surveyList.filter((s) => s.status === "published").length,
    closed:          surveyList.filter((s) => s.status === "closed").length,
    total_responses: safeAllResponses.length,
  };

  // Responses by month — last 6 months, zero-seeded
  const now = new Date();
  const monthMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, 0);
  }
  safeAllResponses.forEach((r) => {
    if (!r.submitted_at) return;
    const d   = new Date(r.submitted_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  });
  const responses_by_month = Array.from(monthMap.entries()).map(([k, count]) => ({
    month: new Date(k + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    count,
  }));

  const by_status = [
    { status: "Published", count: summary.published, color: "#4A7C59" },
    { status: "Draft",     count: summary.draft,     color: "#9C9488" },
    { status: "Closed",    count: summary.closed,    color: "#9B3B3B" },
  ].filter((s) => s.count > 0);

  // Surveys per barangay (top 5)
  const barangayMap = new Map<string, number>();
  surveyList.forEach((s) => {
    if (!s.barangay_name) return;
    barangayMap.set(s.barangay_name, (barangayMap.get(s.barangay_name) ?? 0) + 1);
  });
  const by_barangay = Array.from(barangayMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return NextResponse.json({
    data: { summary, surveys: surveyList, responses_by_month, by_status, by_barangay },
  });
}
