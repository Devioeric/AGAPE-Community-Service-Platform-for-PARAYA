export interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  section_title: string | null;
}

export interface SurveyAnswer {
  question_id: string;
  answer_text: string | null;
  answer_options?: string[] | null;
}

/** Structured selections are canonical; old JSON text remains readable. */
function selections(answer: SurveyAnswer): string[] {
  if (Array.isArray(answer.answer_options) && answer.answer_options.length > 0) return answer.answer_options;
  if (!answer.answer_text) return [];
  try {
    const parsed: unknown = JSON.parse(answer.answer_text);
    if (Array.isArray(parsed)) return parsed.filter((value): value is string => typeof value === "string");
  } catch { /* A legacy single-choice answer can be plain text. */ }
  return [answer.answer_text];
}

export function surveyDistribution(question: SurveyQuestion, answers: SurveyAnswer[]) {
  const rows = answers.filter(answer => answer.question_id === question.id);
  const options = Array.from(new Set(question.options ?? []));
  const choices = rows.map(answer => Array.from(new Set(selections(answer))).filter(value => options.includes(value)))
    .filter(values => values.length > 0);
  const ratings = rows.map(answer => Number(answer.answer_text)).filter(value => Number.isInteger(value) && value >= 1 && value <= 5);
  const responseCount = question.question_type === "rating" ? ratings.length
    : ["multiple_choice", "checkbox"].includes(question.question_type) ? choices.length
      : rows.filter(answer => answer.answer_text?.trim()).length;
  const labels = question.question_type === "rating" ? ["1", "2", "3", "4", "5"]
    : ["multiple_choice", "checkbox"].includes(question.question_type) ? options : [];
  const distribution = labels.map(label => {
    const count = question.question_type === "rating" ? ratings.filter(value => value === Number(label)).length
      : choices.filter(values => values.includes(label)).length;
    return { label, count, pct: responseCount ? Math.round(count / responseCount * 1000) / 10 : 0 };
  });
  return {
    distribution,
    response_count: responseCount,
    average: question.question_type === "rating" && ratings.length
      ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length * 100) / 100 : null,
  };
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** Ambiguous wording or changed answer scales must never be silently paired. */
export function matchSurveyQuestions<T extends SurveyQuestion>(baseline: T[], followup: T[]) {
  const grouped = (questions: T[]) => {
    const result = new Map<string, T[]>();
    for (const question of questions) {
      const key = normalize(question.question_text);
      result.set(key, [...(result.get(key) ?? []), question]);
    }
    return result;
  };
  const baseGroups = grouped(baseline);
  const followGroups = grouped(followup);
  const pairs: Array<{ baseline: T; followup: T }> = [];
  const usedBase = new Set<string>();
  const usedFollowup = new Set<string>();
  for (const [key, base] of Array.from(baseGroups)) {
    const follow = followGroups.get(key);
    if (base.length !== 1 || follow?.length !== 1) continue;
    const [b] = base; const [f] = follow;
    if (b.question_type !== f.question_type) continue;
    if (["multiple_choice", "checkbox"].includes(b.question_type)) {
      const scale = (question: T) => JSON.stringify(Array.from(new Set(question.options ?? [])).sort());
      if (scale(b) !== scale(f)) continue;
    }
    pairs.push({ baseline: b, followup: f }); usedBase.add(b.id); usedFollowup.add(f.id);
  }
  return {
    pairs,
    baselineOnly: baseline.filter(question => !usedBase.has(question.id)),
    followupOnly: followup.filter(question => !usedFollowup.has(question.id)),
  };
}
