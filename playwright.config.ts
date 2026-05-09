import { defineConfig, devices } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://factory:factory_password@localhost:5432/factory?schema=public";
const bootstrapUsername = process.env.BOOTSTRAP_USERNAME ?? "admin";
const bootstrapPassword =
  process.env.BOOTSTRAP_PASSWORD ?? "change-me-before-use";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

process.env.DATABASE_URL = databaseUrl;
process.env.BOOTSTRAP_USERNAME = bootstrapUsername;
process.env.BOOTSTRAP_PASSWORD = bootstrapPassword;
process.env.APP_ORIGIN = process.env.APP_ORIGIN ?? baseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run db:deploy && npm run db:seed && npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
});
