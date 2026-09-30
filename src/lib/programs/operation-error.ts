/** Public responses intentionally never forward database details or identifiers. */
export function programOperationError(error: { code?: string; message?: string }, kind: "signup" | "attendance") {
  if (error.code === "23514" && error.message === "Program completion prerequisites are not satisfied") return { status: 409, error: "A completed program must retain its required evidence. Reopen the program before removing its last non-withdrawn volunteer signup." };
  if (error.code === "42501") return { status: 403, error: kind === "attendance" ? "An active Volunteer with an approved program assignment is required." : "This account cannot change this signup." };
  if (error.code === "P0002") return { status: 404, error: kind === "attendance" ? "Activity or attendance code not found." : "Program not found." };
  if (error.code === "P0003" && kind === "attendance") return { status: 410, error: "This attendance code has expired. Ask the officer for a new one." };
  if (error.code === "22023") return { status: 400, error: "The request is invalid. Check the supplied values." };
  if (error.code === "23505") return { status: 409, error: kind === "attendance" ? "Already recorded for this activity." : "Already signed up for this program." };
  if (error.code === "40001" || error.code === "40P01") return { status: 409, error: "The record changed. Reload and try again." };
  if (error.code === "23514") {
    if (kind === "signup" && error.message === "Program is full") return { status: 409, error: "This program has no remaining volunteer slots." };
    return { status: 409, error: kind === "attendance" ? "This activity or volunteer is not eligible for attendance. Ask the officer to check the assignment and code." : "This program or volunteer is not eligible for enrollment. Check the program status and requirements." };
  }
  return { status: 500, error: kind === "attendance" ? "Attendance could not be recorded. Please try again." : "The signup could not be updated. Please try again." };
}
