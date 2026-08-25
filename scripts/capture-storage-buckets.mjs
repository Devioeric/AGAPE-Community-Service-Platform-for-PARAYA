import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { sanitizeStorageBuckets } from "./lib/sanitized-catalog-capture.mjs";

function parseEnv(source) {
  const result = {};
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return result;
}

function outsideRepository(repository, candidate) {
  const value = relative(repository, candidate);
  return value.startsWith("..") && !value.startsWith(`..${sep}..${sep}`);
}

try {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
    if (index % 2 === 0) pairs.push([item, all[index + 1]]);
    return pairs;
  }, []));
  const envPath = resolve(args["--env-file"] ?? ".env.local");
  const output = resolve(args["--output"] ?? "");
  const projectReference = args["--project-reference"];
  if (!output || !projectReference) throw new Error("--output and --project-reference are required");
  const repository = resolve(import.meta.dirname, "..");
  if (!outsideRepository(repository, output)) throw new Error("Storage bucket capture must be outside the repository");
  const env = parseEnv(await readFile(envPath, "utf8"));
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (url.protocol !== "https:" || url.hostname !== `${projectReference}.supabase.co`) throw new Error("Supabase URL does not match the authorized staging project");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  const response = await fetch(new URL("/storage/v1/bucket", url), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Storage bucket request failed with HTTP ${response.status}`);
  const buckets = sanitizeStorageBuckets(await response.json());
  await writeFile(output, `${JSON.stringify(buckets.map(({ name, public: isPublic, fileSizeLimit, allowedMimeTypes }) => ({
    id: name, name, public: isPublic, file_size_limit: fileSizeLimit, allowed_mime_types: allowedMimeTypes,
  })), null, 2)}\n`, "utf8");
  console.log(`Captured ${buckets.length} sanitized Storage bucket definitions; no keys or object rows were emitted.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
