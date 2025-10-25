import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const WEB_UI_PORT = 3000;
const WEB_UI_HOST = "127.0.0.1";
const BASE_URL = `http://${WEB_UI_HOST}:${WEB_UI_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_WEB_UI_BASE_URL ?? BASE_URL,
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"]
    }
  ],
  webServer: {
    command: `pnpm --filter @chaincontest/web-ui dev --hostname ${WEB_UI_HOST} --port ${WEB_UI_PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NEXT_INTL_CONFIG:
        process.env.NEXT_INTL_CONFIG ??
        path.resolve(process.cwd(), "apps/web-ui/next-intl.config.ts"),
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
        process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000"
    }
  }
});
