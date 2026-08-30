import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "SyntheticReleaseGateOnly!2026";

type RoleSurface = {
  account: string;
  home: string;
  pages: string[];
  forbidden: string[];
};

const ROLE_SURFACES: Record<string, RoleSurface> = {
  paraya_director: {
    account: "director", home: "/officer",
    pages: ["/officer/partnerships", "/officer/proposals", "/officer/programs", "/officer/surveys", "/officer/donations", "/officer/impact", "/officer/reports", "/officer/analytics/recommendations"],
    forbidden: ["/admin", "/barangay", "/volunteer", "/partner"],
  },
  paraya_associate: {
    account: "associate", home: "/officer",
    pages: ["/officer/partnerships", "/officer/proposals", "/officer/programs", "/officer/volunteers", "/officer/surveys", "/officer/donations", "/officer/impact", "/officer/reports"],
    forbidden: ["/admin", "/barangay", "/volunteer", "/partner"],
  },
  paraya_researcher: {
    account: "researcher", home: "/officer",
    pages: ["/officer/profiling", "/officer/phase-2", "/officer/proposals", "/officer/programs", "/officer/analytics/recommendations", "/officer/reports"],
    forbidden: ["/admin", "/barangay", "/volunteer", "/partner"],
  },
  finance_officer: {
    account: "finance", home: "/officer",
    pages: ["/officer/finance", "/officer/phase-2"],
    forbidden: ["/admin", "/barangay", "/volunteer", "/partner", "/officer/profiling", "/officer/donations"],
  },
  barangay_captain: {
    account: "captain-alpha", home: "/barangay",
    pages: ["/barangay/partnership", "/barangay/profiling", "/barangay/submit-needs", "/barangay/approvals", "/barangay/surveys", "/barangay/reports", "/barangay/forum"],
    forbidden: ["/admin", "/officer", "/volunteer", "/partner"],
  },
  barangay_secretary: {
    account: "secretary-alpha", home: "/barangay",
    pages: ["/barangay/partnership", "/barangay/profiling", "/barangay/submit-needs", "/barangay/surveys", "/barangay/reports", "/barangay/forum"],
    forbidden: ["/admin", "/officer", "/volunteer", "/partner", "/barangay/approvals"],
  },
  barangay_mother_leader: {
    account: "mother-alpha", home: "/barangay",
    pages: ["/barangay/partnership", "/barangay/profiling", "/barangay/submit-needs", "/barangay/surveys", "/barangay/forum"],
    forbidden: ["/admin", "/officer", "/volunteer", "/partner", "/barangay/approvals", "/barangay/reports"],
  },
  volunteer: {
    account: "volunteer", home: "/volunteer",
    pages: ["/volunteer/programs", "/volunteer/schedule", "/volunteer/check-in", "/volunteer/log-activity", "/volunteer/hours", "/volunteer/surveys", "/volunteer/forum", "/volunteer/profile"],
    forbidden: ["/admin", "/officer", "/barangay", "/partner"],
  },
  admin: {
    account: "admin", home: "/admin",
    pages: ["/admin/users", "/admin/audit-logs", "/admin/backup", "/admin/readiness", "/admin/integrity", "/admin/communications"],
    forbidden: ["/officer", "/barangay", "/volunteer", "/partner"],
  },
  office: {
    account: "office-history", home: "/partner", pages: ["/partner/proposals", "/partner/programs"],
    forbidden: ["/admin", "/officer", "/barangay", "/volunteer", "/partner/volunteers"],
  },
  student_org: {
    account: "organization-history", home: "/partner", pages: ["/partner/proposals", "/partner/programs"],
    forbidden: ["/admin", "/officer", "/barangay", "/volunteer", "/partner/volunteers"],
  },
  department: {
    account: "department-history", home: "/partner", pages: ["/partner/proposals", "/partner/programs"],
    forbidden: ["/admin", "/officer", "/barangay", "/volunteer", "/partner/volunteers"],
  },
};

async function signIn(page: Page, surface: RoleSurface) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${surface.account}@release-gate.invalid`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(new RegExp(`${surface.home.replaceAll("/", "\\/")}(?:/)?$`));
}

function recordFatalResponses(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror:${error.message}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(page.url()).origin && response.status() >= 500) {
      failures.push(`${response.status()}:${url.pathname}`);
    }
  });
  return failures;
}

if (process.env.AGAPE_ROLE_SURFACE_E2E === "true") {
  test.describe("complete role surface and isolation smoke", () => {
    for (const [role, surface] of Object.entries(ROLE_SURFACES)) {
      test(`${role} can open every intended page and is redirected from every forbidden page`, async ({ page }) => {
        const failures = recordFatalResponses(page);
        await signIn(page, surface);

        for (const path of surface.pages) {
          const response = await page.goto(path, { waitUntil: "domcontentloaded" });
          expect(response?.status(), `${role} page ${path} returned an unexpected status`).toBeLessThan(500);
          await expect(page, `${role} was redirected away from ${path}`).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:[?#].*)?$`));
          await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
        }

        for (const path of surface.forbidden) {
          await page.goto(path, { waitUntil: "domcontentloaded" });
          const safeExit = `(?:${surface.home.replaceAll("/", "\\/")}(?:/)?|\\/login(?:[?#].*)?)$`;
          await expect(page, `${role} entered forbidden page ${path}`).toHaveURL(new RegExp(safeExit));
        }

        expect(failures, `${role} produced fatal browser/server failures`).toEqual([]);
      });
    }

    for (const account of ["pending", "inactive", "suspended"]) {
      test(`${account} account authenticates to no application surface`, async ({ page }) => {
        await page.goto("/login");
        await page.getByLabel("Email address").fill(`${account}@release-gate.invalid`);
        await page.getByLabel("Password").fill(PASSWORD);
        await page.getByRole("button", { name: "Sign In" }).click();
        await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
        await expect(page.getByText(/pending approval, suspended, or unavailable/i)).toBeVisible();
      });
    }
  });
}
