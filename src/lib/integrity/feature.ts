import { NextResponse } from "next/server";

export function isFinanceIntegrityEnabled() {
  return process.env.AGAPE_FINANCE_INTEGRITY_V1_ENABLED === "true";
}

export function financeIntegrityDisabledResponse() {
  return NextResponse.json({
    error: "Finance integrity verification is disabled until its provider and release boundary are approved",
    code: "finance_integrity_disabled",
  }, { status: 503 });
}
