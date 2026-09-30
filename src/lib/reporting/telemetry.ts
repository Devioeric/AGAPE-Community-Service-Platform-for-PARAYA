export type ReportGenerationTelemetry = {
  provider: string | null;
  model: string | null;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  historyCharacterCount: number;
  contextCharacterCount: number;
  selectedTopicCount: number;
  durationMs: number;
  fallbackUsed: boolean;
  outcome: "success" | "failure";
  failureCode?: string;
};

/**
 * Emit only bounded operational counters. Never pass prompts, narratives,
 * actor names, record identifiers, or provider credentials to this helper.
 */
export function recordReportGenerationTelemetry(metrics: ReportGenerationTelemetry): void {
  const safe = {
    event: "agape.report_generation",
    provider: metrics.provider,
    model: metrics.model,
    estimatedInputTokens: Math.max(0, Math.floor(metrics.estimatedInputTokens)),
    estimatedOutputTokens: Math.max(0, Math.floor(metrics.estimatedOutputTokens)),
    historyCharacterCount: Math.max(0, Math.floor(metrics.historyCharacterCount)),
    contextCharacterCount: Math.max(0, Math.floor(metrics.contextCharacterCount)),
    selectedTopicCount: Math.max(0, Math.floor(metrics.selectedTopicCount)),
    durationMs: Math.max(0, Math.floor(metrics.durationMs)),
    fallbackUsed: Boolean(metrics.fallbackUsed),
    outcome: metrics.outcome,
    ...(metrics.failureCode ? { failureCode: metrics.failureCode } : {}),
  };
  console.info(JSON.stringify(safe));
}
