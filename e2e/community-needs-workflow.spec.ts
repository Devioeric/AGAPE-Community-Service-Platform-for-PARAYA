import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "SyntheticReleaseGateOnly!2026";
const NEED_TITLE = "Synthetic potable water workflow need";

async function signIn(page: Page, account: string, home: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${account}@release-gate.invalid`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(new RegExp(`${home.replaceAll("/", "\\/")}(?:/)?$`));
}

async function signOutLocally(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
}

if (process.env.AGAPE_COMMUNITY_NEEDS_E2E === "true") {
  test("Secretary submits, Captain approves, and PARAYA can read a community need", async ({ page }) => {
    const fatalResponses: string[] = [];
    page.on("pageerror", (error) => fatalResponses.push(`pageerror:${error.message}`));
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin === new URL(page.url()).origin && response.status() >= 500) {
        fatalResponses.push(`${response.status()}:${url.pathname}`);
      }
    });

    await signIn(page, "secretary-alpha", "/barangay");
    await page.goto("/barangay/submit-needs");
    await page.getByRole("button", { name: /Health Medical access/i }).click();
    await page.getByLabel("Need title").fill(NEED_TITLE);
    await page.getByLabel("Description").fill("Synthetic aggregate-only need used to verify the community approval workflow.");
    await page.getByLabel("Estimated affected residents").fill("12");
    await page.getByLabel("Sitio / Purok").fill("Synthetic Sitio North");
    await page.getByRole("button", { name: "Submit for Approval" }).click();
    await expect(page.getByRole("heading", { name: "Submitted for Approval" })).toBeVisible();

    await signOutLocally(page);
    await signIn(page, "captain-alpha", "/barangay");
    await page.goto("/barangay/approvals");
    const pendingCard = page.locator("[data-slot='card']").filter({ hasText: NEED_TITLE });
    await expect(pendingCard).toBeVisible();
    await pendingCard.getByRole("button", { name: /Approve & Forward to PARAYA/i }).click();
    await expect(page.getByText("Need approved and forwarded to PARAYA.")).toBeVisible();
    await expect(pendingCard).toHaveCount(0);

    await signOutLocally(page);
    await signIn(page, "researcher", "/officer");
    await page.goto("/officer/analytics/community-needs");
    await expect(page.getByText(NEED_TITLE)).toBeVisible();

    expect(fatalResponses).toEqual([]);
  });
}
