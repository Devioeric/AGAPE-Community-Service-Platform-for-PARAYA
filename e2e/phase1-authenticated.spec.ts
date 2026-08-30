import { expect, test, type Page } from "@playwright/test";
import { waitForDisposableAuthLink } from "./support/local-mailpit";

const PASSWORD = "SyntheticReleaseGateOnly!2026";
const RECOVERED_PASSWORD = "SyntheticReleaseGateRecovered!2026";

async function signIn(page: Page, account: string, expectedHome: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${account}@release-gate.invalid`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(expectedHome);
}

async function selectCycle(page: Page, name: string) {
  const select = page.getByTestId("profiling-cycle-select");
  const value = await select.locator("option").filter({ hasText: name }).getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
  await expect(select.locator("option:checked")).toContainText(name);
}

async function followDisposableAuthLink(page: Page, link: string, expectedPath: RegExp) {
  await page.evaluate((target) => { window.location.assign(target); }, link);
  await expect(page).toHaveURL(expectedPath, { timeout: 15_000 });
}

if (process.env.AGAPE_PHASE1_E2E === "true") {
  test.describe("Phase 1 authenticated synthetic workflows", () => {
    test.describe.configure({ mode: "serial" });

    test("Researcher can operate setup while completed analytics remain de-identified", async ({ page }) => {
      await signIn(page, "researcher", /\/officer(?:\/)?$/);
      await page.goto("/officer/profiling");
      await expect(page.getByTestId("researcher-operations")).toBeVisible();
      await expect(page.getByTestId("approved-privacy-notice")).toContainText("Synthetic notice for disposable release-gate workflows only");
      await selectCycle(page, "Synthetic Completed Cycle");
      const aggregate = page.getByTestId("profiling-aggregate-panel");
      await expect(aggregate).toContainText("Approved households");
      await expect(aggregate).toContainText("Nonparticipating households");
      await expect(aggregate).not.toContainText("not stated: 2");
      await expect(aggregate).not.toContainText("Synthetic Adult");
      await expect(aggregate).not.toContainText("Synthetic Minor");
    });

    test("Mother Leader sees only the assigned sample queue and records an anonymous outcome", async ({ page }) => {
      await signIn(page, "mother-alpha", /\/barangay(?:\/)?$/);
      await page.goto("/barangay/profiling");
      await selectCycle(page, "Synthetic Collecting Cycle");
      await expect(page.getByTestId("approved-privacy-notice")).toBeVisible();
      const sample = page.getByTestId("sample-unit-SMP-SYNCOL005");
      await expect(sample).toBeVisible();
      await sample.click();
      await page.getByRole("button", { name: "Record unavailable" }).click();
      await expect(page.getByText("Sample recorded as unavailable")).toBeVisible();
    });

    test("Secretary must open complete detail before returning a package", async ({ page }) => {
      await signIn(page, "secretary-alpha", /\/barangay(?:\/)?$/);
      await page.goto("/barangay/profiling");
      await selectCycle(page, "Synthetic Validating Cycle");
      await expect(page.getByTestId("secretary-detail-review")).toHaveCount(0);
      await page.getByRole("button", { name: "Review details" }).first().click();
      const review = page.getByTestId("secretary-detail-review");
      await expect(review).toBeVisible();
      await expect(review).toContainText("Complete resident roster");
      await expect(review).toContainText("Consent review");
      await review.getByPlaceholder("Required reason when returning the package").fill("Synthetic browser return reason");
      await review.getByRole("button", { name: "Return with reason" }).click();
      await expect(page.getByText("Package returned")).toBeVisible();
      await expect(review).toHaveCount(0);
    });

    test("Captain can view approved aggregate detail and separately endorse a completed cycle", async ({ page }) => {
      await signIn(page, "captain-alpha", /\/barangay(?:\/)?$/);
      await page.goto("/barangay/profiling");
      await selectCycle(page, "Synthetic Completed Cycle");
      await expect(page.getByTestId("profiling-aggregate-panel")).toBeVisible();
      const endorsement = page.getByTestId("captain-endorsement");
      await expect(endorsement).toContainText("does not change approved counts");
      await endorsement.getByRole("button", { name: "Endorse completed cycle" }).click();
      await expect(page.getByText("Completed cycle endorsed")).toBeVisible();
      await expect(endorsement.getByRole("button", { name: "Endorsed" })).toBeDisabled();
    });

    for (const [account, label] of [["director", "Director"], ["associate", "Associate"]] as const) {
      test(`${label} remains aggregate-only without resident drill-through`, async ({ page }) => {
        await signIn(page, account, /\/officer(?:\/)?$/);
        await page.goto("/officer/profiling");
        await selectCycle(page, "Synthetic Completed Cycle");
        await expect(page.getByTestId("profiling-aggregate-panel")).toBeVisible();
        await expect(page.getByTestId("researcher-operations")).toHaveCount(0);
        await expect(page.getByTestId("secretary-detail-review")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Review details" })).toHaveCount(0);
      });
    }

    test("System Admin loads account-provisioning options without operational partnership access", async ({ page }) => {
      test.setTimeout(60_000);
      await signIn(page, "admin", /\/admin(?:\/)?$/);
      const requestedPaths: string[] = [];
      page.on("request", (request) => requestedPaths.push(new URL(request.url()).pathname));
      await page.goto("/admin/users", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("User Accounts", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Add User" }).click();
      await page.getByLabel("Role", { exact: true }).selectOption("barangay_secretary");
      const assignment = page.getByLabel(/Barangay assignment/);
      await expect(assignment).toContainText("Synthetic Barangay Alpha");
      await expect(assignment).toContainText("Synthetic Barangay Beta");
      expect(requestedPaths).toContain("/api/admin/user-provisioning-options");
      expect(requestedPaths).not.toContain("/api/partnerships");
    });

    test("Password recovery follows the disposable captured email link", async ({ page }) => {
      const email = "volunteer@release-gate.invalid";
      await page.goto("/forgot-password");
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Send Reset Link" }).click();
      await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

      const recoveryLink = await waitForDisposableAuthLink(email);
      await followDisposableAuthLink(page, recoveryLink, /\/reset-password(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "Choose a New Password" })).toBeVisible();
      await page.getByLabel("New password", { exact: true }).fill(RECOVERED_PASSWORD);
      await page.getByLabel("Confirm new password", { exact: true }).fill(RECOVERED_PASSWORD);
      await page.getByRole("button", { name: "Update Password" }).click();
      await expect(page.getByRole("heading", { name: "Password Updated" })).toBeVisible();
      await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 10_000 });

      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password").fill(RECOVERED_PASSWORD);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).toHaveURL(/\/volunteer(?:\/)?$/);
    });

    test("Administrator invitation activates only the disposable pending account", async ({ browser, page }) => {
      const email = "invited-browser@release-gate.invalid";
      await signIn(page, "admin", /\/admin(?:\/)?$/);
      const invitation = await page.evaluate(async (recipient) => {
        const response = await fetch("/api/admin/invite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: recipient, role: "volunteer", barangay_id: null }),
        });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      }, email);
      expect(invitation).toMatchObject({ status: 200, body: { success: true } });

      const invitationLink = await waitForDisposableAuthLink(email);
      const inviteeContext = await browser.newContext();
      const inviteePage = await inviteeContext.newPage();
      try {
        await followDisposableAuthLink(inviteePage, invitationLink, /\/accept-invite(?:[?#]|$)/);
        await expect(inviteePage.getByRole("heading", { name: "Complete Your Account" })).toBeVisible();
        await inviteePage.getByLabel("Full name").fill("Synthetic Invited Browser User");
        await inviteePage.getByLabel("Set password").fill(PASSWORD);
        await inviteePage.getByLabel("Confirm password").fill(PASSWORD);
        await inviteePage.getByRole("button", { name: "Activate Account" }).click();
        await expect(inviteePage.getByRole("heading", { name: "Account Ready!" })).toBeVisible();
        await expect(inviteePage).toHaveURL(/\/volunteer(?:\/)?$/, { timeout: 10_000 });
      } finally {
        await inviteeContext.close();
      }
    });

    test("Phase 1 chatbot emits an advisory-only payload to the loopback recorder", async ({ page }) => {
      await signIn(page, "researcher", /\/officer(?:\/)?$/);
      const result = await page.evaluate(async () => {
        const chatbot = await fetch("/api/ai/chatbot", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Summarize current programs without resident data.", conversationHistory: [], module: "programs" }),
        });
        const chatbotBody = await chatbot.text();
        return { chatbotStatus: chatbot.status, chatbotBody };
      });
      expect(result.chatbotStatus).toBe(200);
      expect(result.chatbotBody).toContain("[DONE]");
    });
  });
}
