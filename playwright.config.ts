import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE_FILE, BASE_URL, E2E_PORT, e2eEnv } from "./e2e/env";

/**
 * E2E suite (S19). `npm run test:e2e` — needs PostgreSQL and Redis
 * (`docker compose up -d`) and a database named cs2analyst_e2e.
 * Every spec runs at 1280 px (desktop) and 360 px (phone).
 * Visual baselines: e2e/screens/__screenshots__, rendered in the Playwright
 * Docker image so they match CI (`npm run test:e2e:update-snapshots`).
 */
const CI = !!process.env.CI;

const DESKTOP = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, storageState: AUTH_STATE_FILE };
const MOBILE = {
  ...devices["Pixel 7"],
  // The narrowest screen the product supports (CLAUDE.md: "from 360 px").
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 1,
  storageState: AUTH_STATE_FILE,
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: CI ? 2 : 3,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" },
  },
  forbidOnly: CI,
  // Screenshots only match where they were rendered: in CI and in the Docker
  // image (`npm run test:e2e:update-snapshots` sets E2E_VISUAL). A plain local
  // run checks everything else.
  ignoreSnapshots: !CI && !process.env.E2E_VISUAL,
  reporter: CI ? [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // Read-only specs first (screens and their screenshots see only the seed)…
    { name: "desktop", dependencies: ["setup"], testDir: "./e2e/screens", use: DESKTOP },
    { name: "mobile", dependencies: ["setup"], testDir: "./e2e/screens", use: MOBILE },
    // …then the ones that change data (upload, delete, register, share).
    { name: "desktop-flows", dependencies: ["desktop", "mobile"], testDir: "./e2e/flows", use: DESKTOP },
    { name: "mobile-flows", dependencies: ["desktop", "mobile"], testDir: "./e2e/flows", use: MOBILE },
  ],
  webServer: {
    command: CI ? `npm run start -- -p ${E2E_PORT}` : `npm run build && npm run start -- -p ${E2E_PORT}`,
    url: `${BASE_URL}/login`,
    env: e2eEnv,
    reuseExistingServer: !CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
