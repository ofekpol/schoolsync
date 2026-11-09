import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

const needsAuth = !!process.env.DATABASE_URL;
// Set to run against a deployment (e.g. staging) instead of a local dev server.
const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: needsAuth ? "./test/e2e/global.setup.ts" : undefined,
  use: {
    baseURL: remoteBaseUrl ?? "http://localhost:3000",
    trace: "on-first-retry",
    locale: "he-IL",
    extraHTTPHeaders: vercelBypassSecret
      ? { "x-vercel-protection-bypass": vercelBypassSecret, "x-vercel-set-bypass-cookie": "true" }
      : undefined,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: remoteBaseUrl
    ? undefined
    : {
        // CI's demo step reuses the production build (`pnpm start`).
        command: process.env.PLAYWRIGHT_WEB_COMMAND ?? "pnpm dev",
        url: "http://localhost:3000",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
