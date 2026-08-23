import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import {
  classifyReleasePath,
  applyOwnerApprovals,
  parseGitPorcelainZ,
  scanFileForSecretRuleIds,
  shouldScanReleaseEntry,
  summarizeManifestEntries,
} from "./lib/release-inclusion.mjs";

function usage() {
  console.log(`Usage: node scripts/build-release-inclusion-manifest.mjs [options]

Options:
  --output <path>  Write stable JSON to this repository path.
  --check          Exit non-zero when ambiguous paths or secret findings exist.
  --help           Show this help.

The command never stages or commits files and never prints matched secret values.`);
}

function parseArguments(argv) {
  const options = { output: null, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--output requires a path.");
      options.output = value;
      index += 1;
    } else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const root = resolve(import.meta.dirname, "..");
  const branch = git(root, ["branch", "--show-current"]).trim();
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const approvalsPath = resolve(root, "docs/implementation/release-gate-inclusion-approvals.json");
  const approvals = JSON.parse(await readFile(approvalsPath, "utf8"));
  const porcelain = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const statusEntries = parseGitPorcelainZ(porcelain).sort((left, right) => left.path.localeCompare(right.path));
  const entries = [];

  for (const statusEntry of statusEntries) {
    const classified = classifyReleasePath(statusEntry.path);
    const secretRuleIds = shouldScanReleaseEntry({ ...statusEntry, ...classified })
      ? await scanFileForSecretRuleIds(resolve(root, statusEntry.path), statusEntry.path)
      : [];
    entries.push(applyOwnerApprovals({ ...statusEntry, ...classified, secretRuleIds }, approvals));
  }

  const manifest = {
    schema: "agape.release-inclusion-manifest.v1",
    branch,
    head,
    policy: {
      staging: "explicit-paths-only",
      blindBulkStagingAllowed: false,
      secretValuesPrinted: false,
      ownerApprovalRequiredForAmbiguousPaths: true,
    },
    approvals: {
      schema: approvals.schema,
      approvedBy: approvals.approvedBy,
      approvalSource: approvals.approvalSource,
    },
    summary: summarizeManifestEntries(entries),
    entries,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

  if (options.output) {
    const output = resolve(root, options.output);
    const relativeOutput = relative(root, output);
    if (!relativeOutput || relativeOutput.startsWith("..") || relativeOutput.includes(":\\")) {
      throw new Error("--output must remain inside the repository.");
    }
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }

  console.error(`Manifest entries: ${manifest.summary.total}`);
  console.error(`Include: ${manifest.summary.include}`);
  console.error(`Ambiguous: ${manifest.summary["ambiguous-needs-owner-review"]}`);
  console.error(`Excluded generated/private: ${manifest.summary["exclude-generated"] + manifest.summary["exclude-private"]}`);
  console.error(`Secret rule findings: ${manifest.summary.secretFindings}`);
  console.error(`Acknowledged synthetic fixture findings: ${manifest.summary.acknowledgedSyntheticSecretFindings}`);

  if (options.check && (manifest.summary["ambiguous-needs-owner-review"] > 0 || manifest.summary.secretFindings > 0)) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exitCode = 2;
}
