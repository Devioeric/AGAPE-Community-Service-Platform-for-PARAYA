import { expect, test } from "@playwright/test";

test("Phase 2 APIs require authentication before revealing component state", async ({ request }) => {
  for (const path of ["/api/v2/partners", "/api/v2/historical-programs"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized" });
  }
});

test("unauthenticated users cannot enter the dark officer workspace", async ({ page }) => {
  await page.goto("/officer/phase-2");
  await expect(page).toHaveURL(/\/login/);
});
