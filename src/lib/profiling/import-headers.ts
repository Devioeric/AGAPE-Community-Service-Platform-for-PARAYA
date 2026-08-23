export type ProfilingImportHeaderIssue = { field: string; message: "Duplicate import column" | "Unknown import column" };

export function normalizeProfilingImportHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function validateProfilingImportHeaders(values: unknown[], allowed: readonly string[]): ProfilingImportHeaderIssue[] {
  const headers = values.map((value) => normalizeProfilingImportHeader(String(value ?? ""))).filter(Boolean);
  const issues: ProfilingImportHeaderIssue[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) issues.push({ field: header, message: "Duplicate import column" });
    else seen.add(header);
    if (!allowed.includes(header)) issues.push({ field: header, message: "Unknown import column" });
  }
  return issues;
}
