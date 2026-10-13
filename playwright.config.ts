import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke tests run against `pnpm dev:demo` (MSW mock API, no backend needed), started on
 * E2E_PORT (default 5173) unless one is running there already (outside CI).
 * Set E2E_BASE_URL to test an already running server instead, e.g. the static demo build:
 *   pnpm build:demo && pnpm exec vite preview --port 4173
 *   E2E_BASE_URL=http://localhost:4173 pnpm test:e2e
 * Workers default to 2: more parallel Chromium pages on one dev server crashed pages and
 * truncated the 5 MB seed fixture under load. E2E_WORKERS overrides it.
 * `pnpm test:e2e` never writes into the repository: the `chromium` project skips the
 * `*screenshots.spec.ts` files (`pnpm screenshots` runs those).
 */
const externalBaseUrl = process.env.E2E_BASE_URL
const port = Number(process.env.E2E_PORT) || 5173
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
    baseURL: externalBaseUrl ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /screenshots\.spec\.ts$/,
    },
    // `pnpm screenshots`: refreshes docs/screenshots (not part of test:e2e)
    {
      name: 'screenshots',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /screenshots\.spec\.ts$/,
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `pnpm dev:demo --port ${port} --strictPort`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
})
