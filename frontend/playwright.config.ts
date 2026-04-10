import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3006",
    trace: "on",
    video: "on",
    screenshot: "on",
    actionTimeout: 15000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
