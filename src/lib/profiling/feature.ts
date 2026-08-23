export function isProfilingV2Enabled(): boolean {
  return process.env.AGAPE_PROFILING_V2_ENABLED === "true";
}
