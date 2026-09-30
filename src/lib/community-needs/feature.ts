/**
 * Data-derived need suggestions are deliberately opt-in.  This flag is
 * server-only; the API also checks the profiling feature/runtime guards.
 */
export function isNeedSuggestionsEnabled(): boolean {
  return process.env.AGAPE_NEED_SUGGESTIONS_ENABLED === "true";
}
