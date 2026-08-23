import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getReleaseRevision, sha256, validateDisabledFeatureConfiguration, validateEvidenceFile } from "./release-evidence.mjs";

export async function runReleaseGate({ root, phase, evidenceDir, evidenceNames, flags, inheritedEvidenceNames = [] }) {
  const failures = [];
  let revision = null;
  try { revision = getReleaseRevision(root); }
  catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }

  const baselineFile = "20260815000000_pre_phase0_baseline.sql";
  const baselinePath = resolve(root, "supabase/migrations", baselineFile);
  let baseline = null;
  try {
    const source = await readFile(baselinePath);
    if (source.length < 1_000) failures.push("canonical baseline is unexpectedly small");
    baseline = { file: baselineFile, sha256: sha256(source) };
  } catch { failures.push("verified canonical pre-Phase-0 baseline is missing"); }

  const validate = async (directory, name, baselineOptions = null) => {
    const path = resolve(directory, name);
    try {
      const result = await validateEvidenceFile(path, { expectedRevision: revision, baseline: baselineOptions });
      for (const failure of result.failures) failures.push(`${name}: ${failure}`);
    } catch { failures.push(`${name} is missing or unreadable`); }
  };

  await validate(resolve(root, "docs/release-evidence"), "baseline-manifest.md", baseline);
  for (const name of inheritedEvidenceNames) await validate(resolve(root, "docs/release-evidence"), name);
  for (const name of evidenceNames) await validate(evidenceDir, name);

  failures.push(...await validateDisabledFeatureConfiguration(root, flags));

  if (failures.length) {
    console.error(`${phase} release gate is OPEN:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`${phase} evidence envelopes and baseline digest passed. Human release authorization is still required.`);
  return true;
}
