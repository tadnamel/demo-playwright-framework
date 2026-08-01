import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the CargoAudit Lite sample project.
 *
 * webServer[] automatically boots the mock API and the static mock app
 * before tests run (and tears them down after), so `npm test` works
 * standalone with no manual setup.
 *
 * Tests tagged @smoke are a lightweight subset intended for a nightly
 * pipeline run; the full suite is treated as the regression pass.
 *
 * IMPORTANT: both the e2e and api projects exercise the SAME shared,
 * stateful mock API server (in-memory shipments + audit log, with a
 * test-only /__reset endpoint). Running tests in parallel would let
 * multiple tests reset/mutate that shared state at the same time,
 * causing cross-test interference. workers is fixed to 1 so the whole
 * suite runs serially against the shared backend — the trade-off is a
 * slightly slower run in exchange for deterministic results.
 */
export default defineConfig({
  testDir: './test-suites',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true, suiteTitle: false }],
  ],
  webServer: [
    {
      command: 'node mock-api/downstream/rate-service.js',
      port: 4001,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node mock-api/server.js',
      port: 4000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx http-server mock-app -p 5173 -s',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'e2e',
      testDir: './test-suites/e2e',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173',
      },
    },
    {
      name: 'api',
      testDir: './test-suites/api',
      use: {
        baseURL: 'http://localhost:4000',
      },
    },
  ],
});
