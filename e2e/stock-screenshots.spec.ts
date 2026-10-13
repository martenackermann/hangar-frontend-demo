import { mkdirSync } from 'node:fs'
import { expect, persona, signIn, test } from './fixtures'

/**
 * Reference screenshots of the H5 screens (dashboard, stock matrix, call-off orders, inventory,
 * assets, deactivation import). Runs in the `screenshots` project, not in `pnpm test:e2e`:
 *   pnpm exec playwright test --project=screenshots e2e/stock-screenshots.spec.ts
 */
const OUT = 'docs/screenshots/stock'
mkdirSync(OUT, { recursive: true })

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
    })

    test(`dashboard and matrix ${theme}`, async ({ page }) => {
      await signIn(page, persona('dana'))
      await page.goto('/dashboard')
      await expect(
        page.getByRole('img', { name: 'Service requests by pipeline stage' }),
      ).toBeVisible()
      await page.mouse.move(0, 899)
      await page.screenshot({ path: `${OUT}/dashboard-1440-${theme}.png` })

      await page.goto('/stock/matrix')
      await expect(page.getByRole('table', { name: 'Stock matrix' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/matrix-1440-${theme}.png` })
    })

    test(`call-off orders ${theme}`, async ({ page }) => {
      await signIn(page, persona('dana'))
      await page.goto('/stock/call-off-orders')
      await expect(page.getByRole('heading', { level: 1, name: 'Call-off orders' })).toBeVisible()
      await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible()
      await page.screenshot({ path: `${OUT}/calloff-list-1440-${theme}.png` })

      // the seeded Eastgate draft
      await page.getByRole('table').getByRole('row').filter({ hasText: 'Draft' }).first().click()
      await expect(page).toHaveURL(/\/stock\/call-off-orders\/\d+$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Call-off order' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/calloff-draft-1440-${theme}.png` })
    })

    test(`inventory ${theme}`, async ({ page }) => {
      await signIn(page, persona('dana'))
      await page.goto('/stock/inventory')
      await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/inventory-list-1440-${theme}.png` })

      await page.goto('/stock/inventory/1')
      await expect(page.getByRole('heading', { level: 1, name: /^Inventory · / })).toBeVisible()
      await page.screenshot({ path: `${OUT}/inventory-closed-1440-${theme}.png` })

      await signIn(page, persona('theo'))
      await page.goto('/stock/inventory/3')
      const input = page.getByRole('textbox', { name: 'Scan serial or asset tag' })
      await input.fill('ZZSHOT0001')
      await input.press('Enter')
      await expect(page.getByRole('status').filter({ hasText: 'ZZSHOT0001' })).toBeVisible()
      await page.screenshot({ path: `${OUT}/inventory-station-1440-${theme}.png` })
    })

    test(`assets ${theme}`, async ({ page }) => {
      await signIn(page, persona('dana'))
      await page.goto('/stock/assets')
      const table = page.getByRole('table', { name: 'Assets' })
      await expect(table.getByRole('row').nth(1)).toBeVisible()
      await page.screenshot({ path: `${OUT}/assets-1440-${theme}.png` })

      await table.getByRole('row').nth(1).click()
      const drawer = page.getByRole('complementary', { name: /^Asset / })
      await drawer.getByRole('tab', { name: 'Movements' }).click()
      await expect(drawer.getByRole('listitem').first()).toBeVisible()
      await page.screenshot({ path: `${OUT}/assets-drawer-movements-1440-${theme}.png` })
    })

    test(`deactivation ${theme}`, async ({ page }) => {
      await signIn(page, persona('dana'))
      await page.goto('/stock/deactivation?batch=1')
      await expect(page.getByText(/^Result · /)).toBeVisible()
      await page.screenshot({ path: `${OUT}/deactivation-result-1440-${theme}.png` })
    })
  })
}

test('technician scan station on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, persona('theo'))
  await page.goto('/stock/inventory/3')
  await expect(page.getByRole('textbox', { name: 'Scan serial or asset tag' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/inventory-station-390-dark.png` })
})
