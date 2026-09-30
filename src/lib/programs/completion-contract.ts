export type ProgramCompletionInput = {
  activities: Array<{ report_1?: string | null; report_2?: string | null; photo_count?: number }>;
  budgets: Array<{ allocated: number | null; spent: number | null }>;
  signups: Array<{ status: string }>;
  active_signup_count?: number;
};

/** Advisory presentation of the mandatory database checks; never authority. */
export function programCompletionChecks(input: ProgramCompletionInput) {
  const totals = input.budgets.reduce<{ allocated: number; spent: number }>((sum, row) => ({
    allocated: sum.allocated + Number(row.allocated ?? 0),
    spent: sum.spent + Number(row.spent ?? 0),
  }), { allocated: 0, spent: 0 });
  const activeSignups = input.active_signup_count ?? input.signups.filter((row) => row.status !== "withdrawn").length;
  const checks = [
    { key: "activities", label: "At least one activity recorded", passed: input.activities.length > 0 },
    { key: "activity_reports", label: "Every activity has nonblank Activity and Financial reports", passed: input.activities.every((row) => Boolean(row.report_1?.trim()) && Boolean(row.report_2?.trim())) },
    { key: "activity_photos", label: "Every activity has at least one photo", passed: input.activities.every((row) => (row.photo_count ?? 0) > 0) },
    { key: "budget_items", label: "At least one budget item recorded", passed: input.budgets.length > 0 },
    { key: "budget_balance", label: "Spending within allocated budget", passed: Number.isFinite(totals.allocated) && Number.isFinite(totals.spent) && totals.spent <= totals.allocated },
    { key: "volunteer_signups", label: "At least one non-withdrawn volunteer signup", passed: activeSignups > 0 },
  ];
  return { allPass: checks.every((check) => check.passed), checks };
}

/** Allowlisted application errors; raw SQL details are never displayed. */
export function programMutationError(error: { code?: string; message?: string }) {
  if (error.code === "23514" && error.message === "Program completion prerequisites are not satisfied") {
    return { status: 409, code: "program_completion_incomplete", error: "Program completion requires an activity, both reports and a photo for every activity, a budget item with spending within allocation, and a non-withdrawn volunteer signup. Reopen a completed program before removing required evidence." };
  }
  if (error.code === "40001" || error.code === "40P01") return { status: 409, code: "program_evidence_changed", error: "Program evidence changed. Reload the program and try again." };
  if (error.code === "23514") return { status: 409, code: "program_constraint", error: "This change conflicts with program requirements. Check the current program and try again." };
  if (error.code === "42501") return { status: 403, code: "program_forbidden", error: "This account cannot make that program change." };
  if (error.code === "PGRST116" || error.code === "P0002") return { status: 404, code: "program_not_found", error: "Program record not found." };
  return { status: 500, code: "program_update_failed", error: "The program could not be saved. Please try again." };
}
