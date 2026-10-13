import { mkdirSync } from 'node:fs'
import { test as base } from '@playwright/test'
import { expect, persona, signIn } from './fixtures'

/**
 * Reference screenshots of the H1 screens (pipeline, service requests + drawer, lease returns,
 * communications, dispatch settings), both themes, for comparison with
 * _spec/hangar/comps/pipeline.html and table-drawer.html. Runs in the `screenshots` project
 * (`pnpm screenshots`), not in `pnpm test:e2e`. Output: docs/screenshots/requests/.
 */
const OUT = 'docs/screenshots/requests'
mkdirSync(OUT, { recursive: true })

// The mail preview is a sandboxed srcdoc iframe; tracing tries to inject into it (see comms spec).
const test = base

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme, viewport: { width: 1440, height: 900 } })

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem(
          'hangar.prefs.v1',
          JSON.stringify({ theme: value, density: 'compact', railCollapsed: false }),
        )
      }, theme)
      await signIn(page, persona('dana'))
    })

    test(`pipeline ${theme}`, async ({ page }) => {
      await page.goto('/pipeline')
      await expect(page.getByRole('region', { name: /^Imported, / })).toBeVisible()
      await page.mouse.move(0, 899)
      await page.screenshot({ path: `${OUT}/pipeline-1440-${theme}.png` })
    })

    test(`service requests + drawer ${theme}`, async ({ page }) => {
      await page.goto('/service-requests')
      const table = page.getByRole('table', { name: 'Service requests' })
      await expect(table.getByRole('row').nth(1)).toBeVisible()
      await page.screenshot({ path: `${OUT}/service-requests-1440-${theme}.png` })
      await page.goto('/service-requests?status=appointment_booked')
      await table.getByRole('row').nth(1).click()
      const drawer = page.getByRole('complementary', { name: /^Service request / })
      await expect(drawer.getByRole('tab', { name: /Overview/ })).toBeVisible()
      await page.mouse.move(0, 899)
      await page.screenshot({ path: `${OUT}/sr-drawer-overview-1440-${theme}.png` })
      await drawer.getByRole('tab', { name: /Communication/ }).click()
      await page.screenshot({ path: `${OUT}/sr-drawer-communication-1440-${theme}.png` })
      await drawer.getByRole('tab', { name: /History/ }).click()
      await page.screenshot({ path: `${OUT}/sr-drawer-history-1440-${theme}.png` })
    })

    test(`lease returns + drawer ${theme}`, async ({ page }) => {
      await page.goto('/lease-returns')
      const table = page.getByRole('table', { name: 'Lease returns' })
      await expect(table.getByRole('row').nth(1)).toBeVisible()
      await page.screenshot({ path: `${OUT}/lease-returns-1440-${theme}.png` })
      await table.getByRole('row').nth(1).click()
      await expect(page.getByRole('complementary', { name: /^Lease return / })).toBeVisible()
      await page.mouse.move(0, 899)
      await page.screenshot({ path: `${OUT}/lease-drawer-1440-${theme}.png` })
    })

    test(`communications ${theme}`, async ({ page }) => {
      await page.goto('/communications')
      await expect(
        page.getByRole('table', { name: 'Mail log' }).getByRole('row').nth(1),
      ).toBeVisible()
      await page.screenshot({ path: `${OUT}/communications-mail-log-1440-${theme}.png` })
      await page.goto('/communications?view=dispatch-runs&run=1')
      await expect(page.getByRole('complementary', { name: /^Dispatch run / })).toBeVisible()
      await page.screenshot({ path: `${OUT}/communications-runs-1440-${theme}.png` })
      await page.goto('/communications?preview=true')
      await expect(
        page.getByRole('dialog', { name: 'Send due mails' }).getByText('Mails', { exact: true }),
      ).toBeVisible()
      await page.screenshot({ path: `${OUT}/communications-dry-run-1440-${theme}.png` })
      await page.goto('/communications?view=templates&template=sr.invitation')
      await expect(page.getByRole('dialog', { name: 'Booking invitation' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/communications-template-1440-${theme}.png` })
    })

    test(`dispatch settings ${theme}`, async ({ page }) => {
      await page.goto('/admin/dispatch-settings')
      await expect(page.getByRole('heading', { level: 1, name: 'Dispatch settings' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/dispatch-settings-1440-${theme}.png` })
    })
  })
}

test('pipeline and SR list on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, persona('dana'))
  await page.goto('/pipeline')
  await expect(page.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/pipeline-390.png` })
  await page.goto('/service-requests')
  await expect(page.getByRole('heading', { level: 1, name: 'Service requests' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/service-requests-390.png` })
})
