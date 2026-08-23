import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EVIDENCE_ARTIFACT_SPECS } from "./lib/evidence-artifact-specs.mjs";
import { renderEvidenceTemplate, templateRelativePathForSpec } from "./lib/evidence-templates.mjs";

const root = resolve(import.meta.dirname, "..");
for (const spec of EVIDENCE_ARTIFACT_SPECS.values()) {
  const target = resolve(root, templateRelativePathForSpec(spec));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, renderEvidenceTemplate(spec), "utf8");
}
console.log(`Generated ${EVIDENCE_ARTIFACT_SPECS.size} non-executable evidence templates.`);
