import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "SyntheticReleaseGateOnly!2026";

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

    test("AI routes emit advisory-only payloads to the loopback recorder", async ({ page }) => {
      await signIn(page, "researcher", /\/officer(?:\/)?$/);
      const result = await page.evaluate(async () => {
        const chatbot = await fetch("/api/ai/chatbot", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Summarize current programs without resident data.", conversationHistory: [], module: "programs" }),
        });
        const chatbotBody = await chatbot.text();
        const narrative = await fetch("/api/ai/narrative-report", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ period_start: "2026-01-01", period_end: "2026-12-31" }),
        });
        return { chatbotStatus: chatbot.status, chatbotBody, narrativeStatus: narrative.status, narrativeBody: await narrative.text() };
      });
      expect(result.chatbotStatus).toBe(200);
      expect(result.chatbotBody).toContain("[DONE]");
      expect(result.narrativeStatus).toBe(200);
      expect(JSON.parse(result.narrativeBody)).toMatchObject({ data: { status: "draft" } });
    });
  });
}
