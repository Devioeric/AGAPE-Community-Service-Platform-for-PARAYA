/**
 * The loopback local preview (`npm run dev:local`) presents AGAPE as a product
 * demo: every module is enabled there, so deployment-status chrome such as
 * runtime modes and release-gate readiness is hidden. Hosted builds and the
 * automated test gates never set this flag and keep showing that chrome.
 */
export function isDemoPresentation(): boolean {
  return process.env.NEXT_PUBLIC_AGAPE_LOCAL_PREVIEW === "true";
}
