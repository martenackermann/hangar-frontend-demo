import { readFileSync } from 'node:fs'
import { expect, persona, signIn, test } from './fixtures'

/**
 * H3 · Installation places (SCREENS.md §5.1): Theo shelves a goods-in device by scanning its
 * serial and a place (two values → one request), sees the verdict and undoes it.
 */

interface Fixture {
  tables: {
    stock_locations: { id: number; code: string }[]
    assets: { serialNumber: string; status: string; locationId: number }[]
  }
}

function goodsInSerials(count: number): string[] {
  const fixture = JSON.parse(
    readFileSync(new URL('../src/mocks/fixtures/seed.json', import.meta.url), 'utf8'),
  ) as Fixture
  const goodsIn = fixture.tables.stock_locations.find((l) => l.code === 'RIV-GOODS_IN')?.id
  return fixture.tables.assets
    .filter((a) => a.locationId === goodsIn && a.status === 'available')
    .slice(0, count)
    .map((a) => a.serialNumber)
}

test('technician scans serial + place, sees the verdict and undoes it', async ({ page }) => {
  const [serial = '', second = ''] = goodsInSerials(2)
  await signIn(page, persona('theo'))
  await page.goto('/warehouse/installation-places')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Installation places')

  const input = page.getByLabel('Scan serial or place')
  await expect(input).toBeFocused()
  await input.fill(serial)
  await input.press('Enter')
  await expect(page.getByTestId('scan-expecting')).toHaveText(`Serial ${serial} — now scan a place`)
  await input.fill('loc:b9-12')
  await input.press('Enter')
  const banner = page.getByRole('status').filter({ hasText: 'Placed' }).first()
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('B9-12')

  // place first, then a serial; the occupied place is a warning but applied
  await input.fill('B9-12')
  await input.press('Enter')
  await input.fill(second)
  await input.press('Enter')
  await expect(page.getByText('Place occupied').first()).toBeVisible()

  // sticky place
  await page.getByRole('button', { name: 'Lock place' }).click()
  await expect(page.getByTestId('scan-expecting')).toHaveText('Locked: B9-12 — scan serials')

  // undo the latest scan
  await page.getByRole('button', { name: /^Undo/ }).first().click()
  await expect(page.getByText(/undone/i).first()).toBeVisible()

  // unknown serials are an error verdict, not an HTTP error
  await input.fill('NOPE12345')
  await input.press('Enter')
  await expect(page.getByText('Unknown serial').first()).toBeVisible()
})

test('viewer cannot open the scan station', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/warehouse/installation-places')
  await expect(page.getByText("You don't have access to this screen.")).toBeVisible()
})

test('the scan station works on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, persona('theo'))
  await page.goto('/warehouse/installation-places')
  const input = page.getByLabel('Scan serial or place')
  await expect(input).toBeVisible()
  await input.fill('B9-20')
  await input.press('Enter')
  await expect(page.getByTestId('scan-expecting')).toHaveText('Place B9-20 — now scan a serial')
})
