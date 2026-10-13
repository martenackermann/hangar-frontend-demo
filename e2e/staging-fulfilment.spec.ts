import { expect, persona, signIn, test } from './fixtures'

/**
 * H3 · Order closing, Picking and Parcel shipping (SCREENS.md §5.3–5.5) as Dana; the drawer's
 * Staging/Shipping tabs; read-only views for the viewer.
 */
test('dispatcher ticks the software checklist and closes an order', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/warehouse/order-closing?checklistComplete=false')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Order closing')
  const table = page.getByRole('table', { name: 'Orders waiting for closing' })
  await table.getByRole('row').nth(1).click()
  const checklist = page.getByTestId('software-checklist')
  await expect(checklist).toBeVisible()
  const boxes = checklist.getByRole('checkbox')
  const count = await boxes.count()
  for (let i = 0; i < count; i++) {
    const box = boxes.nth(i)
    if ((await box.getAttribute('data-state')) !== 'checked') await box.click()
  }
  await expect(checklist.getByText('All software installed.')).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/staging/order-closing.png' })
  const close = page.getByRole('button', { name: 'Close order', exact: true })
  await expect(close).toBeEnabled({ timeout: 5000 })
  await close.click()
  await expect(page.getByText(/Close order · SR/).first()).toBeVisible()
})

test('dispatcher marks a technician order as provided', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/warehouse/picking')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Picking')
  const button = page.getByRole('button', { name: 'Mark provided' }).first()
  await expect(button).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/staging/picking.png' })
  const before = await page.getByRole('button', { name: 'Mark provided' }).count()
  await button.click()
  await expect(page.getByRole('button', { name: 'Mark provided' })).toHaveCount(before - 1)
})

test('dispatcher packs a parcel by scanning and creates the shipment', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/warehouse/parcel-shipping?siteId=3')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Parcel shipping')
  await page.getByRole('list', { name: 'Parcel orders' }).getByRole('button').first().click()
  const items = page.getByRole('list', { name: 'Items to pack' })
  await expect(items).toBeVisible()
  const tags = await items.locator('li .hg-mono').allTextContents()
  const scan = page.getByTestId('pack-scan').getByRole('textbox')
  for (const tag of tags) {
    await scan.fill(tag.trim())
    await scan.press('Enter')
    await expect(page.getByText(/Packed|Already packed/).first()).toBeVisible()
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: 'docs/screenshots/staging/parcel-packing.png' })
  const create = page.getByRole('button', { name: 'Create shipment' })
  await expect(create).toBeEnabled()
  const download = page.waitForEvent('download').catch(() => null)
  await create.click()
  await expect(page.getByTestId('shipment-result')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tracking parcel 1' }).first()).toBeVisible()
  await download
  await page.getByTestId('shipment-result').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'docs/screenshots/staging/parcel-shipped.png' })
})

test('the SR drawer shows the Staging and Shipping tabs', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/warehouse/parcel-shipping?siteId=3')
  const shipped = page.getByRole('region', { name: 'Shipped' })
  await shipped.getByRole('button').first().click()
  await expect(page.getByRole('tab', { name: 'Shipping' })).toBeVisible()
  await page.getByRole('tab', { name: 'Shipping' }).click()
  const drawer = page.getByRole('tabpanel')
  await expect(drawer.getByRole('table', { name: 'Shipments' })).toBeVisible()
  await page.getByRole('tab', { name: 'Staging' }).click()
  await expect(
    page.getByRole('tabpanel').getByRole('table', { name: 'Assigned devices' }),
  ).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/staging/drawer-staging-tab.png' })
})

test('viewer sees the warehouse screens without mutating controls', async ({ page }) => {
  await signIn(page, persona('vic'))
  await page.goto('/warehouse/picking')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Picking')
  await expect(page.getByRole('button', { name: 'Mark provided' })).toHaveCount(0)
  await page.goto('/warehouse/parcel-shipping?siteId=3')
  await page.getByRole('list', { name: 'Parcel orders' }).getByRole('button').first().click()
  await expect(page.getByTestId('pack-scan')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create shipment' })).toHaveCount(0)
})
