import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
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

const currentPaths = parseGitPorcelainZ(git(root, ["-c", "status.renames=false", "status", "--porcelain=v1", "-z", "--untracked-files=all"]))
  .map((entry) => entry.path)
  .sort((left, right) => left.localeCompare(right));
const manifestPaths = manifest.entries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
if (!samePaths(currentPaths, manifestPaths)) throw new Error("Working-tree paths changed after the manifest was generated.");

const includeEntries = manifest.entries.filter((entry) => entry.classification === "include");
const includePaths = includeEntries
  .map((entry) => entry.path)
  .sort((left, right) => left.localeCompare(right));

const deletedPaths = [];
const presentPaths = [];
for (const entry of includeEntries) {
  if (existsSync(resolve(root, entry.path))) presentPaths.push(entry.path);
  else if (entry.tracked && entry.state.includes("D")) deletedPaths.push(entry.path);
  else throw new Error(`Approved include path is unexpectedly absent: ${entry.path}`);
}

for (let index = 0; index < presentPaths.length; index += 40) {
  git(root, ["add", "--", ...presentPaths.slice(index, index + 40)]);
}
for (let index = 0; index < deletedPaths.length; index += 40) {
  git(root, ["update-index", "--remove", "--", ...deletedPaths.slice(index, index + 40)]);
}

const stagedPaths = git(root, ["diff", "--cached", "--name-only", "--no-renames", "-z"])
  .split("\0").filter(Boolean).sort((left, right) => left.localeCompare(right));
if (!samePaths(stagedPaths, includePaths)) throw new Error("Staged paths do not exactly match the approved include list.");

console.log(`Staged ${stagedPaths.length} explicitly approved paths.`);
