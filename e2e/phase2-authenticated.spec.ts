import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "SyntheticReleaseGateOnly!2026";
const component = process.env.AGAPE_PHASE2_E2E_COMPONENT;

async function signIn(page: Page, account: string, expectedHome: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${account}@release-gate.invalid`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(expectedHome);
}

async function selectByText(select: ReturnType<Page["locator"]>, text: string) {
  const value = await select.locator("option").filter({ hasText: text }).first().getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
}

async function selectContainingOption(page: Page, text: string) {
  const option = page.locator("option").filter({ hasText: text }).first();
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute("value");
  expect(value).toBeTruthy();
  await option.locator("..").selectOption(value!);
}

if (process.env.AGAPE_PHASE2_E2E === "true") {
  test.describe.configure({ mode: "serial" });

  if (component === "partners") test("Director can inspect the synthetic Partner graph without contact-address disclosure", async ({ page }) => {
    await signIn(page, "director", /\/officer(?:\/)?$/);
    await page.goto("/officer/phase-2");
    await expect(page.getByTestId("phase2-tab-partners")).toContainText("available");
    await expect(page.getByTestId("partner-operations")).toBeVisible();
    await selectByText(page.getByTestId("partner-selector"), "Synthetic External Organization");
    await expect(page.getByTestId("partner-detail")).toContainText("SYN-PTR-001");
    await expect(page.getByText("Legacy institutional-account reconciliation")).toBeVisible();
    await expect(page.locator("body")).toContainText("email opted in");
    await expect(page.locator("body")).not.toContainText("contact@release-gate.invalid");
  });

  if (component === "historical_programs") test("Researcher can use historical intake and quality-aware review screens", async ({ page }) => {
    await signIn(page, "researcher", /\/officer(?:\/)?$/);
    await page.goto("/officer/phase-2");
    await page.getByTestId("phase2-tab-history").click();
    await expect(page.getByTestId("historical-operations")).toBeVisible();
    await expect(page.getByText("Encode a historical program")).toBeVisible();
    await expect(page.getByText("Controlled spreadsheet intake")).toBeVisible();
    await selectByText(page.getByTestId("historical-selector"), "Synthetic Verified History");
    await expect(page.getByText("Aggregate-only synthetic history.")).toBeVisible();
    await expect(page.getByText("Immutable review timeline")).toBeVisible();
  });

  if (component === "proposals") test("Associate can inspect the frozen structured proposal and handoff action", async ({ page }) => {
    await signIn(page, "associate", /\/officer(?:\/)?$/);
    await page.goto("/officer/phase-2");
    await page.getByTestId("phase2-tab-proposals").click();
    await expect(page.getByTestId("proposal-operations")).toBeVisible();
    await selectContainingOption(page, "Synthetic Structured Proposal");
    await expect(page.getByTestId("proposal-detail")).toContainText("approved");
    await expect(page.getByTestId("proposal-detail")).toContainText("Final beneficiaries");
    await expect(page.getByRole("button", { name: "Create or open operational program" })).toBeVisible();
  });

  if (component === "program_finance") test("Finance sees allowlisted immutable budget and program variance views", async ({ page }) => {
    await signIn(page, "finance", /\/officer(?:\/)?$/);
    await page.goto("/officer/phase-2");
    await page.getByTestId("phase2-tab-finance").click();
    await expect(page.getByTestId("finance-operations")).toBeVisible();
    await expect(page.getByText("Proposal budget review queue")).toBeVisible();
    await expect(page.getByText("Program financial monitoring")).toBeVisible();
    await expect(page.getByText("Planned cash")).toBeVisible();
    await expect(page.getByText("Verified actual")).toBeVisible();
    await expect(page.getByText("Liquidation", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Expenditure description")).toHaveCount(0);
  });

  if (component === "barangay_scope") test("Captain gets own-barangay Partner detail and aggregate-only history", async ({ page }) => {
    await signIn(page, "captain-alpha", /\/barangay(?:\/)?$/);
    await page.goto("/barangay/partnership");
    await expect(page.getByTestId("phase2-tab-partners")).toContainText("available");
    const options = page.getByTestId("partner-selector").locator("option");
    await expect(options).toHaveCount(2);
    await selectByText(page.getByTestId("partner-selector"), "Synthetic Barangay Partner");
    await expect(page.getByTestId("partner-detail")).toContainText("SYN-PTR-007");
    await page.getByTestId("phase2-tab-history").click();
    await expect(page.getByTestId("historical-operations")).toBeVisible();
    await expect(page.getByTestId("historical-selector")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Verified historical metrics", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Unverified historical metrics", exact: true })).toBeVisible();
  });

  if (component === "recommendation_review") test("Researcher can dismiss and endorse an advisory recommendation without changing proposal workflow", async ({ page }) => {
    await signIn(page, "researcher", /\/officer(?:\/)?$/);
    await page.goto("/officer/analytics/recommendations");
    const card = page.getByTestId("recommendation-card").first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId("recommendation-review-controls")).toBeVisible();
    await card.getByLabel(/Dismissal reason for/).selectOption("data_quality_concern");
    await card.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByRole("status")).toContainText("Recommendation dismissed");
    await expect(card).toContainText("Dismissed");
    await card.getByRole("button", { name: "Endorse" }).click();
    await expect(page.getByRole("status")).toContainText("Recommendation endorsed");
    await expect(card).toContainText("Researcher-endorsed");
    await expect(card).toContainText("do not create or advance a proposal");
  });

  if (component === "recommendation_automation") test("weekly advisory refresh creates only deduplicated synthetic in-app notices", async ({ page }) => {
    await signIn(page, "researcher", /\/officer(?:\/)?$/);
    const run = async () => page.request.get("/api/ai/recommendations?scheduled=true", {
      headers: { authorization: "Bearer SyntheticRecommendationCronOnly!2026" },
    });
    const first = await run();
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.data).toMatchObject({ skipped: false, mode: "synthetic" });
    expect(firstBody.data.created).toBeGreaterThan(0);

    const retry = await run();
    expect(retry.status()).toBe(200);
    expect((await retry.json()).data.created).toBe(0);

    const notifications = await page.evaluate(async () => {
      const response = await fetch("/api/notifications");
      return { status: response.status, body: await response.json() };
    });
    expect(notifications.status).toBe(200);
    const notice = notifications.body.data.find((item: { title?: string }) => item.title === "Community need recommendation ready");
    expect(notice).toMatchObject({ type: "alert", action_url: "/officer/analytics/recommendations" });
    expect(Object.keys(notice).sort()).toEqual(["action_url", "channel", "created_at", "id", "is_read", "message", "title", "type"]);
  });

  if (component === "ai_privacy") test("AI receives aggregate-only Phase 2-safe context and remains advisory", async ({ page }) => {
    await signIn(page, "researcher", /\/officer(?:\/)?$/);
    const result = await page.evaluate(async () => {
      const invoke = async (module: string, message: string) => {
        const response = await fetch("/api/ai/chatbot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, conversationHistory: [], module }) });
        return { status: response.status, body: await response.text() };
      };
      const budget = await invoke("budget", "Give an aggregate budget status summary.");
      const partnerships = await invoke("partnerships", "Give an aggregate partnership status summary.");
      const narrative = await fetch("/api/ai/narrative-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ period_start: "2026-01-01", period_end: "2026-12-31" }) });
      return { budget, partnerships, narrative: { status: narrative.status, body: await narrative.text() } };
    });
    expect(result.budget.status).toBe(200); expect(result.budget.body).toContain("[DONE]");
    expect(result.partnerships.status).toBe(200); expect(result.partnerships.body).toContain("[DONE]");
    expect(result.narrative.status).toBe(200); expect(JSON.parse(result.narrative.body)).toMatchObject({ data: { status: "draft" } });
  });
}
