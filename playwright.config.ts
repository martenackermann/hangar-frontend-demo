import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke tests run against `pnpm dev:demo` (MSW mock API, no backend needed).
 * Set E2E_BASE_URL to test an already running server instead, e.g. a production demo build:
 *   pnpm build:demo && npx serve -s dist -l 4173
 *   E2E_BASE_URL=http://localhost:4173 pnpm test:e2e
 * Workers default to 2: more parallel Chromium pages on one dev server crashed pages and
 * truncated the 4 MB seed fixture under load. E2E_WORKERS overrides it.
 */
const externalBaseUrl = process.env.E2E_BASE_URL
const isCI = Boolean(process.env.CI)
const workers = Number(process.env.E2E_WORKERS) || 2

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /screenshots\.spec\.ts/,
    },
    // `pnpm screenshots`: refreshes docs/screenshots/foundation (not part of test:e2e)
    {
      name: 'screenshots',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /screenshots\.spec\.ts/,
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'pnpm dev:demo',
        url: 'http://localhost:5173',
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
})
