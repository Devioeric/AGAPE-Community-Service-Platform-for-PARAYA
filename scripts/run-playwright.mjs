import { spawn } from "node:child_process";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const inherited = { ...process.env, PLAYWRIGHT_BASE_URL: baseURL };
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js test server did not become ready");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: inherited, windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

try {
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3000"], { stdio: "inherit", env: inherited, windowsHide: true });
    await waitForServer();
  }
  const code = await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test"]);
  process.exitCode = code;
} finally {
  if (server && !server.killed) server.kill();
}
