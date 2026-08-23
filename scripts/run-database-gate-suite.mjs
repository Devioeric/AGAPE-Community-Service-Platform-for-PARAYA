import { spawnSync } from "node:child_process";

for (const scope of ["phase1", "phase2"]) {
  const result = spawnSync(process.execPath, ["scripts/run-local-database-gates.mjs", "--all", "--scope", scope], {
    cwd: process.cwd(), env: process.env, stdio: "inherit", windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
