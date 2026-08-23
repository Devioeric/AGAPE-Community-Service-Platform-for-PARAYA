// Shared auth guard for cron endpoints. Two ways to authorize:
//   1. Bearer token: Authorization: Bearer <CRON_SECRET>
//   2. Vercel Cron sets x-vercel-cron-signature automatically; if you run on
//      Vercel and configure cron jobs there, only an extra CRON_SECRET check
//      is needed because Vercel guarantees the source.
//
// Configure env var CRON_SECRET in production. If missing, cron endpoints
// 503 — fail-closed, never world-readable.

import { NextResponse } from "next/server";

export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Cron is not configured. Set CRON_SECRET in the deployment env." },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization");
  const ok   = auth === `Bearer ${secret}`;
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
