import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// GET — fetches every open-text answer for a survey, each one bundled with the
// codes that have been applied so far. Also returns aggregate label frequencies
// and an "agreement" indicator (codes applied by 2+ distinct coders).
//
// Only PARAYA staff + admin can read this — the answers themselves may contain
// PII the respondent did not intend to share publicly.
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("survey.analyze");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: surveyId } = await params;
  const adminDb = createAdminClient();

  // Fetch the survey + its questions so we know which ones are open-text.
  const { data: survey } = await adminDb
    .from("surveys")
    .select("id, title, survey_questions(id, question_text, question_type, order_index, section_title)")
    .eq("id", surveyId)
    .single();
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  type DbQuestion = {
    id: string; question_text: string; question_type: string;
    order_index: number; section_title: string | null;
  };
  const textQuestions = ((survey.survey_questions ?? []) as DbQuestion[])
    .filter((q) => q.question_type === "text")
    .sort((a, b) => a.order_index - b.order_index);

  if (textQuestions.length === 0) {
    return NextResponse.json({ data: {
      survey:    { id: survey.id, title: survey.title },
      questions: [], labels: [],
    }});
  }

  const qIds = textQuestions.map((q) => q.id);

  // Pull every non-empty text answer for those questions, plus the response
  // it belongs to so we can drop responses that have been flagged as excluded.
  const { data: rawAnswers } = await adminDb
    .from("survey_answers")
    .select("id, question_id, answer_text, response_id, survey_responses!inner(excluded, submitted_at, respondent_id)")
    .in("question_id", qIds);

  type AnswerRow = {
    id:               string;
    question_id:      string;
    answer_text:      string | null;
    response_id:      string;
    survey_responses: { excluded: boolean; submitted_at: string | null; respondent_id: string };
  };
  const answers = ((rawAnswers ?? []) as unknown as AnswerRow[])
    .filter((a) => !a.survey_responses?.excluded)
    .filter((a) => (a.answer_text ?? "").trim().length > 0);

  // Bring in the codes for every one of those answers.
  const answerIds = answers.map((a) => a.id);
  type CodeRow = { id: string; answer_id: string; label: string; coder_id: string; created_at: string };
  let codes: CodeRow[] = [];
  if (answerIds.length > 0) {
    const { data: c } = await adminDb
      .from("survey_answer_codes")
      .select("id, answer_id, label, coder_id, created_at")
      .is("voided_at", null)
      .in("answer_id", answerIds);
    codes = (c ?? []) as CodeRow[];
  }

  // Coder display names for the chips.
  const coderIds = Array.from(new Set(codes.map((c) => c.coder_id)));
  type UserRow = { id: string; full_name: string | null };
  let users: UserRow[] = [];
  if (coderIds.length > 0) {
    const { data: u } = await adminDb.from("users").select("id, full_name").in("id", coderIds);
    users = (u ?? []) as UserRow[];
  }
  const userMap = new Map(users.map((u) => [u.id, u.full_name ?? "Coder"]));

  // Per-question rollup: answers + codes; codes per answer collapsed into
  // their label with the list of coders who applied it.
  const questionsOut = textQuestions.map((q) => {
    const qAnswers = answers.filter((a) => a.question_id === q.id);
    return {
      id:            q.id,
      question_text: q.question_text,
      section_title: q.section_title,
      answer_count:  qAnswers.length,
      answers: qAnswers.map((a) => {
        const aCodes = codes.filter((c) => c.answer_id === a.id);
        // Collapse to unique labels with the coder names that applied each
        const byLabel = new Map<string, { coders: { id: string; name: string }[]; codeIds: string[] }>();
        for (const c of aCodes) {
          const entry = byLabel.get(c.label) ?? { coders: [], codeIds: [] };
          entry.coders.push({ id: c.coder_id, name: userMap.get(c.coder_id) ?? "Coder" });
          entry.codeIds.push(c.id);
          byLabel.set(c.label, entry);
        }
        return {
          id:           a.id,
          text:         a.answer_text!,
          submitted_at: a.survey_responses?.submitted_at ?? null,
          codes: Array.from(byLabel.entries()).map(([label, v]) => ({
            label,
            coders:    v.coders,
            code_ids:  v.codeIds,
            // Mark codes applied by 2+ distinct coders so the UI can highlight
            // inter-rater agreement.
            agreed:    new Set(v.coders.map((co) => co.id)).size >= 2,
          })),
        };
      }),
    };
  });

  // Survey-wide label frequencies (how often each label appears, plus how many
  // distinct coders use it). This is what powers the "themes" sidebar.
  const labelMap = new Map<string, { count: number; coderIds: Set<string> }>();
  for (const c of codes) {
    const entry = labelMap.get(c.label) ?? { count: 0, coderIds: new Set() };
    entry.count += 1;
    entry.coderIds.add(c.coder_id);
    labelMap.set(c.label, entry);
  }
  const labels = Array.from(labelMap.entries())
    .map(([label, v]) => ({ label, count: v.count, coder_count: v.coderIds.size }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    data: {
      survey:    { id: survey.id, title: survey.title },
      questions: questionsOut,
      labels,
    },
  });
}

// POST — applies a code (label) to an answer on behalf of the current user.
// Body: { answer_id: string, label: string, notes?: string }
export async function POST(request: Request, { params }: Ctx) {
  const auth = await authorizeCapability("survey.analyze");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: surveyId } = await params;
  const parsed = z.object({ answer_id: z.string().uuid(), label: z.string().trim().min(1).max(80), notes: z.string().trim().max(500).optional() })
    .strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid survey code" }, { status: 400 });
  const body = parsed.data;

  const label = (body.label ?? "").trim();
  if (!body.answer_id) return NextResponse.json({ error: "answer_id is required" }, { status: 400 });
  if (label.length < 1 || label.length > 80) {
    return NextResponse.json({ error: "label must be 1–80 characters" }, { status: 400 });
  }

  const adminDb = createAdminClient();
  const { data: boundAnswer } = await adminDb
    .from("survey_answers")
    .select("id, survey_responses!inner(survey_id)")
    .eq("id", body.answer_id)
    .eq("survey_responses.survey_id", surveyId)
    .maybeSingle();
  if (!boundAnswer) return NextResponse.json({ error: "Answer does not belong to this survey" }, { status: 400 });
  const { data, error } = await adminDb
    .from("survey_answer_codes")
    .insert({
      answer_id: body.answer_id,
      survey_id: surveyId,
      label,
      coder_id:  auth.actor.id,
      notes:     body.notes?.trim() || null,
    })
    .select("id, label, coder_id, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already applied this label to that answer." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
