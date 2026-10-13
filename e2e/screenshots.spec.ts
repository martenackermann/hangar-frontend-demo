import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, persona, signIn, test } from './fixtures'

/**
 * The README screenshot set (docs/screenshots/*.png), demo mode. Opt-in, never part of
 * `pnpm test:e2e`:
 *
 *   pnpm screenshots            # starts `pnpm dev:demo` unless E2E_BASE_URL is set
 *
 * Desktop shots are 1440×900 @1x, phone shots 390×844 @2x. Mostly dark, a few light variants.
 */
const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

type Theme = 'dark' | 'light'

async function prefs(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('hangar.prefs.v1', JSON.stringify({ theme: value, density: 'compact' }))
  }, theme)
}

async function shot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0)
  // let fonts, fades and the refetch line settle
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const theme of ['dark', 'light'] as const) {
    test(`pipeline and service requests (${theme})`, async ({ page }) => {
      await prefs(page, theme)
      await signIn(page, persona('dana'))
      await expect(page.getByRole('region', { name: /^Imported, / })).toBeVisible()
      await shot(page, `pipeline-${theme}`)

      await page.goto('/service-requests?status=appointment_booked')
      const table = page.getByRole('table', { name: 'Service requests' })
      await table.getByRole('row').nth(1).click()
      const drawer = page.getByRole('complementary', { name: /^Service request / })
      await expect(drawer.getByRole('tab', { name: /Overview/ })).toBeVisible()
      await shot(page, `service-requests-drawer-${theme}`)
    })
  }

  test('login (dark)', async ({ page }) => {
    await prefs(page, 'dark')
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in as a demo persona' })).toBeVisible()
    await shot(page, 'login-dark')
  })

  test('lease returns, imports, command palette (dark)', async ({ page }) => {
    await prefs(page, 'dark')
    await signIn(page, persona('dana'))

    await page.goto('/lease-returns')
    await expect(
      page.getByRole('table', { name: 'Lease returns' }).getByRole('row').nth(1),
    ).toBeVisible()
    await shot(page, 'lease-returns-dark')

    // the seeded import that finished with row errors
    await page.goto('/data/imports/6')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shot(page, 'import-detail-dark')

    await page.goto('/pipeline')
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await page.keyboard.type('SR00122')
    await expect(palette.getByRole('option').first()).toBeVisible()
    await shot(page, 'command-palette-dark')
  })

  test('warehouse: personalization and parcel shipping (dark)', async ({ page }) => {
    await prefs(page, 'dark')
    await signIn(page, persona('dana'))
    await page.goto('/warehouse/personalization')
    const queue = page.getByRole('list', { name: 'Requests' })
    await queue.getByRole('button').filter({ hasNotText: 'none in staging' }).first().click()
    const panel = page.getByTestId('work-panel')
    await panel.getByRole('button', { name: 'Claim', exact: true }).click()
    await expect(panel.getByText('You are editing')).toBeVisible()
    const suggestion = panel.getByTestId('suggested-asset').first()
    if (await suggestion.isVisible().catch(() => false)) {
      const serial = (await suggestion.locator('.hg-mono.text-xs').first().textContent())?.trim()
      const scan = panel.getByTestId('assign-scan').getByRole('textbox')
      await scan.fill(serial ?? '')
      await scan.press('Enter')
      await expect(panel.getByText(/Assigned|Not the oldest/).first()).toBeVisible()
    }
    await shot(page, 'personalization-dark')

    await page.goto('/warehouse/parcel-shipping')
    await expect(page.getByRole('heading', { level: 1, name: 'Parcel shipping' })).toBeVisible()
    await shot(page, 'parcel-shipping-dark')
  })

  test('field, stock, inventory, dashboard (dark)', async ({ page }) => {
    await prefs(page, 'dark')
    await signIn(page, persona('dana'))

    await page.goto('/field/tour-planner')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shot(page, 'tour-planner-dark')

    await page.goto('/stock/matrix')
    await expect(page.getByRole('table', { name: 'Stock matrix' })).toBeVisible()
    await shot(page, 'stock-matrix-dark')

    await page.goto('/stock/inventory/3')
    const input = page.getByRole('textbox', { name: /Scan serial or asset tag/ })
    await input.fill('ZZSHOT0001')
    await input.press('Enter')
    await expect(page.getByText('ZZSHOT0001').first()).toBeVisible()
    await shot(page, 'inventory-scan-dark')

    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await shot(page, 'dashboard-dark')
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })

  for (const theme of ['dark', 'light'] as const) {
    test(`technician on a phone (${theme})`, async ({ page }) => {
      await prefs(page, theme)
      await signIn(page, persona('theo'))
      await expect(
        page.getByRole('list', { name: 'Stops' }).getByRole('listitem').first(),
      ).toBeVisible()
      await shot(page, `my-tour-phone-${theme}`)

      await page.getByRole('link', { name: /Open/ }).first().click()
      await expect(page).toHaveURL(/\/field\/tours\/\d+\/stops\/\d+/)
      await expect(page.getByRole('tab', { name: /Devices/ })).toBeVisible()
      await shot(page, `deployment-phone-${theme}`)
    })
  }
})
