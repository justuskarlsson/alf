import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Live agent turns (real Cursor) can take a while to spin up + respond.
  timeout: 180_000,
  expect: { timeout: 10_000 },
  // Each live test spawns a heavy local Cursor agent — run serially so we never
  // have several agents resident at once (parallel runs can exhaust RAM).
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TEST_FRONTEND_URL ?? process.env.FRONTEND_URL ?? "http://localhost:5010",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
