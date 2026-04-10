import { expect, type Page,test } from "@playwright/test";

const BASE_URL = "http://localhost:3006";
const TEST_EMAIL = "lmnr-coding-agent@gmail.com";
const PROJECT_ID = "be2114ba-03d7-4490-8a0a-beef2eb8bc0d";

const SIGNAL_NAME = `e2e-cascade-signal-${Date.now()}`;
const ALERT_NAME = `e2e-cascade-alert-${Date.now()}`;

/**
 * E2E test: Verifies that deleting a signal cascades to delete its associated alerts.
 *
 * Flow:
 * 1. Sign in with email auth
 * 2. Create a signal and alert via API
 * 3. Navigate to Alerts settings page and verify the alert is visible
 * 4. Delete the signal (which should cascade-delete the alert)
 * 5. Navigate back to Alerts settings and verify the alert was removed
 */

const signIn = async (page: Page) => {
  await page.goto(`${BASE_URL}/sign-in`);
  await page.waitForLoadState("networkidle");

  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await emailInput.fill(TEST_EMAIL);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for redirect after sign-in
  await page.waitForURL(/\/(workspace|projects|onboarding|project)/, { timeout: 30000 });
};

test.describe("Delete signal cascades to alerts", () => {
  test("deleting a signal removes its associated alert", async ({ page }) => {
    test.setTimeout(120000);

    // ── Step 1: Sign in ──
    await signIn(page);
    await page.waitForTimeout(1000);

    // ── Step 2: Create a signal via API ──
    const createSignalRes = await page.request.post(`${BASE_URL}/api/projects/${PROJECT_ID}/signals`, {
      data: {
        projectId: PROJECT_ID,
        name: SIGNAL_NAME,
        prompt: "E2E test signal for cascade delete verification",
        structuredOutput: {},
      },
    });
    expect(createSignalRes.ok()).toBeTruthy();
    const signal = await createSignalRes.json();
    const signalId = signal.id;
    expect(signalId).toBeTruthy();

    // ── Step 3: Create an alert linked to the signal via API ──
    const createAlertRes = await page.request.post(`${BASE_URL}/api/projects/${PROJECT_ID}/alerts`, {
      data: {
        name: ALERT_NAME,
        type: "SIGNAL_EVENT",
        sourceId: signalId,
        targets: [{ type: "EMAIL", email: TEST_EMAIL }],
      },
    });
    expect(createAlertRes.ok()).toBeTruthy();
    const alertData = await createAlertRes.json();
    expect(alertData.id).toBeTruthy();

    // ── Step 4: Navigate to Alerts settings and verify alert exists ──
    await page.goto(`${BASE_URL}/project/${PROJECT_ID}/settings?tab=alerts`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const alertRow = page.locator(`td:has-text("${ALERT_NAME}")`);
    await expect(alertRow.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "/tmp/e2e-01-alerts-before-delete.png", fullPage: true });

    // ── Step 5: Delete the signal via API (triggers cascade delete of alerts) ──
    const deleteRes = await page.request.delete(`${BASE_URL}/api/projects/${PROJECT_ID}/signals`, {
      data: { ids: [signalId] },
    });
    expect(deleteRes.ok()).toBeTruthy();
    await page.waitForTimeout(1000);

    // ── Step 6: Reload Alerts settings and verify alert was cascade-deleted ──
    await page.goto(`${BASE_URL}/project/${PROJECT_ID}/settings?tab=alerts`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Verify the alert is no longer visible
    const alertAfterDelete = page.locator(`td:has-text("${ALERT_NAME}")`);
    await expect(alertAfterDelete).not.toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/tmp/e2e-02-alerts-after-delete.png", fullPage: true });
  });
});
