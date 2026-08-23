import { readFile } from "node:fs/promises";

export const REQUIRED_PHASE1_ROLES = ["admin","paraya_director","paraya_associate","paraya_researcher","finance_officer","barangay_captain","barangay_secretary","barangay_mother_leader","volunteer"];
export const REQUIRED_ACCOUNT_STATES = ["active","pending","inactive","suspended"];

export function validatePhase1SecurityScenarios(value) {
  const findings = [];
  if (value?.schema !== "agape.phase1-security-scenarios.v1") findings.push("invalid schema");
  for (const suite of ["catalog","jwt","rpc-abuse","concurrency","storage"]) if (!value?.mandatorySuites?.includes(suite)) findings.push(`missing suite ${suite}`);
  for (const role of REQUIRED_PHASE1_ROLES) if (!value?.roles?.includes(role)) findings.push(`missing role ${role}`);
  for (const state of REQUIRED_ACCOUNT_STATES) if (!value?.accountStates?.includes(state)) findings.push(`missing account state ${state}`);
  const ids = value?.jwtCases?.map((entry) => entry.id) ?? [];
  if (new Set(ids).size !== ids.length) findings.push("duplicate JWT case id");
  if (!ids.some((id) => id.includes("admin"))) findings.push("missing Admin isolation case");
  if (!ids.some((id) => id.includes("deny-override"))) findings.push("missing deny override case");
  for (const group of ["jwtCases","rpcAbuseCases","concurrencyCases","storageCases"]) if (!Array.isArray(value?.[group]) || value[group].length === 0) findings.push(`empty ${group}`);
  if (value?.raceAcceptance?.materialWinners !== 1 || value?.raceAcceptance?.immutableWinningEvents !== 1 || value?.raceAcceptance?.partialGraphs !== 0 || value?.raceAcceptance?.mandatorySkips !== 0) findings.push("invalid race acceptance");
  return { ok: findings.length === 0, findings, counts: { jwt: value?.jwtCases?.length ?? 0, rpcAbuse: value?.rpcAbuseCases?.length ?? 0, concurrency: value?.concurrencyCases?.length ?? 0, storage: value?.storageCases?.length ?? 0 } };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href) {
  const path = process.argv[2] ?? "test/gates/phase1-security-scenarios.json";
  const result = validatePhase1SecurityScenarios(JSON.parse(await readFile(path, "utf8")));
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
