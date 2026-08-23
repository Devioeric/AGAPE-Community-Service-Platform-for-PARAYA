import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getEvidenceArtifactSpec } from "./evidence-artifact-specs.mjs";
import { sha256, validateDisabledFeatureConfiguration, validateEvidenceFile, validateReleaseRevisionContext, verifyPrivateArtifactIndex } from "./release-evidence.mjs";

export function parseReleaseGateArguments(argv) {
  const options = { releaseRevision: null, artifactIndex: null, envelopeOnly: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--release-revision" || argument === "--artifact-index") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      options[argument === "--release-revision" ? "releaseRevision" : "artifactIndex"] = value;
      index += 1;
    } else if (argument === "--envelope-only") options.envelopeOnly = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!options.help && !options.releaseRevision) throw new Error("--release-revision is required");
  if (!options.help && !options.envelopeOnly && !options.artifactIndex) throw new Error("--artifact-index is required unless --envelope-only is used");
  if (options.envelopeOnly && options.artifactIndex) throw new Error("Use --artifact-index or --envelope-only, not both");
  return options;
}

export function releaseGateUsage(scriptName) {
  return `Usage: node ${scriptName} --release-revision <40-char-commit> (--artifact-index <private-json> | --envelope-only)`;
}

export async function runReleaseGate({ root, phase, evidencePaths, flags, releaseRevision, artifactIndex, envelopeOnly }) {
  const failures = [];
  try { validateReleaseRevisionContext(root, releaseRevision, evidencePaths); }
  catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }

  const baselineFile = "20260815000000_pre_phase0_baseline.sql";
  let baseline = null;
  try {
    const source = await readFile(resolve(root, "supabase/migrations", baselineFile));
    if (source.length < 1_000) failures.push("canonical baseline is unexpectedly small");
    baseline = { file: baselineFile, sha256: sha256(source) };
  } catch { failures.push("verified canonical pre-Phase-0 baseline is missing"); }

  const evidenceRecords = [];
  for (const relativePath of evidencePaths) {
    try {
      const artifactSpec = getEvidenceArtifactSpec(relativePath);
      const result = await validateEvidenceFile(resolve(root, relativePath), {
        expectedRevision: releaseRevision,
        artifactSpec,
        baseline: artifactSpec.baseline ? baseline : null,
      });
      evidenceRecords.push({ relativePath, fields: result.fields });
      for (const failure of result.failures) failures.push(`${relativePath}: ${failure}`);
    } catch (error) {
      failures.push(`${relativePath}: ${error instanceof Error ? error.message : "missing or unreadable"}`);
    }
  }
  failures.push(...await validateDisabledFeatureConfiguration(root, flags));
  if (!envelopeOnly && evidenceRecords.length === evidencePaths.length) {
    try { await verifyPrivateArtifactIndex({ root, indexPath: artifactIndex, expectedRevision: releaseRevision, evidenceRecords }); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }

  if (failures.length) {
    console.error(`${phase} release gate is OPEN:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`${phase}: ${envelopeOnly ? "Envelope-only validation" : "Private bundles and evidence envelopes"} passed for release revision ${releaseRevision}. Human release authorization remains required.`);
  return true;
}
