import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseGitPorcelainZ } from "./lib/release-inclusion.mjs";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
}

function samePaths(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "docs/implementation/release-gate-inclusion-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.schema !== "agape.release-inclusion-manifest.v1") throw new Error("Unsupported inclusion manifest schema.");
if (manifest.branch !== git(root, ["branch", "--show-current"]).trim()) throw new Error("Manifest branch does not match the current branch.");
if (manifest.head !== git(root, ["rev-parse", "HEAD"]).trim()) throw new Error("Manifest HEAD does not match the current revision.");
if (manifest.summary["ambiguous-needs-owner-review"] !== 0) throw new Error("Manifest still contains ambiguous paths.");
if (manifest.summary.secretFindings !== 0) throw new Error("Manifest still contains unresolved secret findings.");

const currentPaths = parseGitPorcelainZ(git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]))
  .map((entry) => entry.path)
  .sort((left, right) => left.localeCompare(right));
const manifestPaths = manifest.entries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
if (!samePaths(currentPaths, manifestPaths)) throw new Error("Working-tree paths changed after the manifest was generated.");

const includePaths = manifest.entries
  .filter((entry) => entry.classification === "include")
  .map((entry) => entry.path)
  .sort((left, right) => left.localeCompare(right));

for (let index = 0; index < includePaths.length; index += 40) {
  git(root, ["add", "--", ...includePaths.slice(index, index + 40)]);
}

const stagedPaths = git(root, ["diff", "--cached", "--name-only", "-z"])
  .split("\0").filter(Boolean).sort((left, right) => left.localeCompare(right));
if (!samePaths(stagedPaths, includePaths)) throw new Error("Staged paths do not exactly match the approved include list.");

console.log(`Staged ${stagedPaths.length} explicitly approved paths.`);
