export function isProfilingV2Enabled(): boolean {
  return process.env.AGAPE_PROFILING_V2_ENABLED === "true";
}

/**
 * The simplified profiling surface is enabled by default for local development,
 * but remains opt-in in production environments. This keeps the existing
 * workspace available as a safe rollback without adding a database flag.
 */
export function isProfilingSimpleUiEnabled(): boolean {
  const configured = process.env.AGAPE_PROFILING_SIMPLE_UI_ENABLED;
  if (configured != null) return configured === "true";
  return process.env.NODE_ENV !== "production";
}
