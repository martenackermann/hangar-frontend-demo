import { expect, persona, PERSONAS, signIn, test } from './fixtures'

/** H5 dashboard (SCREENS.md §2.2): KPI tiles with sparklines, charts with a table view. */

for (const who of PERSONAS) {
  test(`${who.name} sees the dashboard KPIs`, async ({ page }) => {
    await signIn(page, who)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Open requests').first()).toBeVisible()
    await expect(page.getByText('Stock shortfall').first()).toBeVisible()
    await expect(
      page.getByRole('img', { name: 'Service requests by pipeline stage' }),
    ).toBeVisible()
  })
}

test('a chart switches to its table view and back', async ({ page }) => {
  await signIn(page, persona('dana'))
  await page.goto('/dashboard')
  // Column charts have focusable bars, so the chart is a named group (bars are images).
  const chart = page.getByRole('group', { name: 'Completions per day, last 14 days' })
  await expect(chart).toBeVisible()
  const tables = await page.getByRole('table').count()
  await page.getByRole('button', { name: 'Show table' }).first().click()
  await expect(page.getByRole('table')).toHaveCount(tables + 1)
  await page.getByRole('button', { name: 'Show chart' }).first().click()
  await expect(page.getByRole('table')).toHaveCount(tables)
})
